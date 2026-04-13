import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { refreshControlArtifacts } from "./packCore.js";
import type { WebCaptureMetadata } from "./webCapture.js";

const DEFAULT_CORPUS_PREFIX = "design-corpus";
const R2_ACCOUNT_ID_ENV = "DATALOX_R2_ACCOUNT_ID";
const R2_ACCESS_KEY_ID_ENV = "DATALOX_R2_ACCESS_KEY_ID";
const R2_SECRET_ACCESS_KEY_ENV = "DATALOX_R2_SECRET_ACCESS_KEY";
const R2_BUCKET_ENV = "DATALOX_R2_BUCKET";
const R2_PUBLIC_BASE_URL_ENV = "DATALOX_R2_PUBLIC_BASE_URL";
const R2_PREFIX_ENV = "DATALOX_R2_PREFIX";

export interface PublishWebCaptureInput {
  repoPath?: string;
  capture: string;
  bucket?: string;
  prefix?: string;
  publicBaseUrl?: string;
}

export interface PublishedObjectRef {
  key: string;
  url: string | null;
}

export interface PublishedCaptureManifest {
  id: string;
  url: string;
  domain: string | null;
  title: string;
  captured_at: string;
  artifact_type: WebCaptureMetadata["artifactType"];
  tags: string[];
  fonts: string[];
  colors: string[];
  section_labels: string[];
  objects: {
    source_markdown: PublishedObjectRef;
    artifact_markdown: PublishedObjectRef | null;
    desktop_screenshot: PublishedObjectRef;
    mobile_screenshot: PublishedObjectRef;
  };
}

export interface PublishedCaptureIndex {
  generated_at: string;
  count: number;
  items: PublishedCaptureManifest[];
}

export interface PublishWebCaptureResult {
  repoPath: string;
  capture: string;
  bucket: string;
  prefix: string;
  manifestKey: string;
  manifestUrl: string | null;
  manifest: PublishedCaptureManifest;
  indexKey: string;
  indexUrl: string | null;
  index: PublishedCaptureIndex;
}

export interface ObjectStore {
  putText(key: string, content: string, contentType: string): Promise<void>;
  putBytes(key: string, content: Buffer, contentType: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  readJson<T>(key: string): Promise<T>;
}

interface CaptureBundle {
  metadata: WebCaptureMetadata;
  sourceMarkdown: string;
  artifactMarkdown: string | null;
  desktopScreenshot: Buffer;
  mobileScreenshot: Buffer;
}

interface R2StoreConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath ?? process.cwd());
}

function normalizePrefix(prefix?: string): string {
  const value = (prefix ?? process.env[R2_PREFIX_ENV] ?? DEFAULT_CORPUS_PREFIX).trim().replace(/^\/+|\/+$/g, "");
  return value || DEFAULT_CORPUS_PREFIX;
}

function joinKey(...parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function buildPublicUrl(baseUrl: string | undefined, key: string): string | null {
  if (!baseUrl?.trim()) {
    return null;
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(key, normalizedBase).toString();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function loadCaptureBundle(repoPath: string, captureSlug: string): Promise<CaptureBundle> {
  const metadataPath = path.join(repoPath, "agent-wiki", "sources", "web", `${captureSlug}.capture.json`);
  const metadata = await readJsonFile<WebCaptureMetadata>(metadataPath);
  const [sourceMarkdown, artifactMarkdown, desktopScreenshot, mobileScreenshot] = await Promise.all([
    readFile(path.join(repoPath, metadata.sourcePagePath), "utf8"),
    metadata.artifactPath ? readFile(path.join(repoPath, metadata.artifactPath), "utf8") : Promise.resolve(null),
    readFile(path.join(repoPath, metadata.screenshotPaths.desktop)),
    readFile(path.join(repoPath, metadata.screenshotPaths.mobile)),
  ]);

  return {
    metadata,
    sourceMarkdown,
    artifactMarkdown,
    desktopScreenshot,
    mobileScreenshot,
  };
}

function buildManifest(
  metadata: WebCaptureMetadata,
  keys: {
    sourceMarkdown: string;
    artifactMarkdown: string | null;
    desktopScreenshot: string;
    mobileScreenshot: string;
  },
  publicBaseUrl?: string,
): PublishedCaptureManifest {
  return {
    id: metadata.slug,
    url: metadata.url,
    domain: metadata.domain,
    title: metadata.title,
    captured_at: metadata.capturedAt,
    artifact_type: metadata.artifactType,
    tags: metadata.tags,
    fonts: metadata.capture.desktop.fonts,
    colors: metadata.capture.desktop.colors,
    section_labels: metadata.capture.desktop.sections
      .map((section) => section.label || section.text)
      .filter(Boolean),
    objects: {
      source_markdown: {
        key: keys.sourceMarkdown,
        url: buildPublicUrl(publicBaseUrl, keys.sourceMarkdown),
      },
      artifact_markdown: keys.artifactMarkdown
        ? {
            key: keys.artifactMarkdown,
            url: buildPublicUrl(publicBaseUrl, keys.artifactMarkdown),
          }
        : null,
      desktop_screenshot: {
        key: keys.desktopScreenshot,
        url: buildPublicUrl(publicBaseUrl, keys.desktopScreenshot),
      },
      mobile_screenshot: {
        key: keys.mobileScreenshot,
        url: buildPublicUrl(publicBaseUrl, keys.mobileScreenshot),
      },
    },
  };
}

class R2ObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(private readonly config: R2StoreConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putText(key: string, content: string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async putBytes(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key) {
          keys.push(item.Key);
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async readJson<T>(key: string): Promise<T> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) {
      throw new Error(`R2 object ${key} was empty.`);
    }
    return JSON.parse(body) as T;
  }
}

export function createR2ObjectStore(input: {
  bucket?: string;
} = {}): ObjectStore {
  return new R2ObjectStore({
    accountId: requireEnv(R2_ACCOUNT_ID_ENV),
    accessKeyId: requireEnv(R2_ACCESS_KEY_ID_ENV),
    secretAccessKey: requireEnv(R2_SECRET_ACCESS_KEY_ENV),
    bucket: input.bucket ?? requireEnv(R2_BUCKET_ENV),
  });
}

export async function regenerateLatestIndex(input: {
  store: ObjectStore;
  prefix?: string;
}): Promise<{ key: string; index: PublishedCaptureIndex }> {
  const prefix = normalizePrefix(input.prefix);
  const manifestPrefix = joinKey(prefix, "instances");
  const manifestKeys = (await input.store.listKeys(manifestPrefix))
    .filter((key) => key.endsWith("/manifest.json"))
    .sort();

  const manifests = await Promise.all(
    manifestKeys.map((key) => input.store.readJson<PublishedCaptureManifest>(key)),
  );
  manifests.sort((left, right) => right.captured_at.localeCompare(left.captured_at));

  const index: PublishedCaptureIndex = {
    generated_at: new Date().toISOString(),
    count: manifests.length,
    items: manifests,
  };
  const key = joinKey(prefix, "indexes", "latest.json");
  await input.store.putText(key, `${JSON.stringify(index, null, 2)}\n`, "application/json");
  return { key, index };
}

export async function publishWebCapture(
  input: PublishWebCaptureInput,
  deps?: {
    store?: ObjectStore;
  },
): Promise<PublishWebCaptureResult> {
  const repoPath = resolveRepoPath(input.repoPath);
  const prefix = normalizePrefix(input.prefix);
  const bucket = input.bucket ?? process.env[R2_BUCKET_ENV];
  if (!bucket?.trim()) {
    throw new Error("publish-web-capture requires --bucket or DATALOX_R2_BUCKET.");
  }

  const store = deps?.store ?? createR2ObjectStore({ bucket });
  const publicBaseUrl = input.publicBaseUrl ?? process.env[R2_PUBLIC_BASE_URL_ENV];
  const bundle = await loadCaptureBundle(repoPath, input.capture);

  const baseKey = joinKey(prefix, "instances", bundle.metadata.slug);
  const sourceKey = joinKey(baseKey, "source.md");
  const artifactKey = bundle.metadata.artifactPath
    ? joinKey(baseKey, path.basename(bundle.metadata.artifactPath))
    : null;
  const desktopKey = joinKey(baseKey, "desktop.png");
  const mobileKey = joinKey(baseKey, "mobile.png");

  await store.putText(sourceKey, bundle.sourceMarkdown, "text/markdown; charset=utf-8");
  if (bundle.artifactMarkdown && artifactKey) {
    await store.putText(artifactKey, bundle.artifactMarkdown, "text/markdown; charset=utf-8");
  }
  await store.putBytes(desktopKey, bundle.desktopScreenshot, "image/png");
  await store.putBytes(mobileKey, bundle.mobileScreenshot, "image/png");

  const manifest = buildManifest(
    bundle.metadata,
    {
      sourceMarkdown: sourceKey,
      artifactMarkdown: artifactKey,
      desktopScreenshot: desktopKey,
      mobileScreenshot: mobileKey,
    },
    publicBaseUrl,
  );
  const manifestKey = joinKey(baseKey, "manifest.json");
  await store.putText(manifestKey, `${JSON.stringify(manifest, null, 2)}\n`, "application/json");

  const { key: indexKey, index } = await regenerateLatestIndex({
    store,
    prefix,
  });

  await refreshControlArtifacts({
    repoPath,
    logEntry: {
      action: "publish_web_capture",
      detail: `${bundle.metadata.slug} -> ${bucket}/${manifestKey}`,
      path: bundle.metadata.sourcePagePath,
    },
  });

  return {
    repoPath,
    capture: bundle.metadata.slug,
    bucket,
    prefix,
    manifestKey,
    manifestUrl: buildPublicUrl(publicBaseUrl, manifestKey),
    manifest,
    indexKey,
    indexUrl: buildPublicUrl(publicBaseUrl, indexKey),
    index,
  };
}
