export function parseFrontmatter(rawFrontmatter: string): Record<string, any>;
export function splitFrontmatter(content: string): {
  frontmatter: Record<string, any>;
  body: string;
};
export function inferSkillNameFromPath(filePath: string): string;
export function parseSkillDoc(filePath: string, content: string): any;
export function hasMarkdownSection(body: string, sectionName: string): boolean;
export function parseWikiDoc(relativePath: string, content: string, includeContent?: boolean): any;
export function parseNoteDoc(relativePath: string, content: string, includeContent?: boolean): any;
