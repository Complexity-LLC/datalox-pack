---
type: note
kind: pdf
title: Nucleotide-resolution mapping of regulatory elements via allelic readout of tiled base editing
workflow: pdf_capture
status: active
sources:
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC13065808/
related: []
updated: 2026-04-18T12:46:33.791Z
---

# Nucleotide-resolution mapping of regulatory elements via allelic readout of tiled base editing

## When to Use

Use this note when the task depends on claims, terminology, protocol parameters, assay conditions, or exact numeric values from Nucleotide-resolution mapping of regulatory elements via allelic readout of tiled base editing.

## Signal

Captured 24 page(s) from https://pmc.ncbi.nlm.nih.gov/articles/PMC13065808/. Section map anchored on Abstract, Results, and Figure Legends. Normalized page evidence is stored in agent-wiki/notes/pdf/nucleotide-resolution-regulatory-elements-tiled-base-editing.capture.json.

## Interpretation

The reusable value is concentrated in normalized page evidence grouped by sections such as Abstract, with agent-side extraction deciding which exact values matter for the task.

## Action

Read agent-wiki/notes/pdf/nucleotide-resolution-regulatory-elements-tiled-base-editing.md for the overview, then inspect agent-wiki/notes/pdf/nucleotide-resolution-regulatory-elements-tiled-base-editing.capture.json for normalized page evidence before turning Nucleotide-resolution mapping of regulatory elements via allelic readout of tiled base editing into implementation guidance.

## Examples

- Abstract CRISPR tiling screens have enabled the characterization of regulatory sequences but are limited by low resolution arising from the indirect readout of editing via guide RNA sequencing and enrichment analysis.
- This study introduces an end-to-end experimental assay and computational pipeline, which leverages targeted sequencing of CRISPR-introduced alleles at the endogenous target locus following dense base-editing mutagenesis.
- As a proof of concept, we studied a putative CD19 enhancer, an immunotherapy target in leukemia, and identified alleles and single nucleotides crucial for CD19 regulation.
- Our visualization tools revealed transcription factor motifs corresponding to the top-ranked nucleotides.
- Validation experiments confirmed that mutations in MYB, PAX5, and EBF1 binding sites reduce CD19 expression.

## Agent Protocol

Read the metadata JSON before reopening the raw PDF.
Start with `Methods`, `Supplementary Materials`, `Tables`, then `Figure Legends` when you need exact protocol values.
Extract only exact values that appear with real lab units or explicit procedure sentences.
Return the value with page number and source sentence; omit uncertain matches rather than guessing.
Ignore panel labels like `1c` or `3D` unless the task explicitly asks about figure labels or model dimensionality.

## Metadata

- Metadata path: agent-wiki/notes/pdf/nucleotide-resolution-regulatory-elements-tiled-base-editing.capture.json
- Metadata stores normalized page text with section labels and page provenance.
- Use metadata for exact extraction; use this note for overview and routing.

## Section Map

- Abstract | page 1 | Abstract CRISPR tiling screens have enabled the characterization of regulatory sequences but are limited by low resolution arising from the indirect readout of editing via guide RNA sequencing and enrichment analysis.
- Results | page 2 | To address these limitations, we introduce an experimental and computational framework that enables precise determination of genotype-phenotype relationships at the nucleotide level from bulk amplicon sequencing, in the context of non-coding sequences, utilizing information from direct sequencing of alleles produced by base editing at regulatory regions.
- Figure Legends | pages 3-5 | Base-editor tiling screen design featuring gRNA-directed targeting, allele-based phenotypic readout, and integrated computational analysis pipeline.
- Methods | page 6 | In contrast to the gRNA readout model, CRISPR-Millipede demonstrates superior capabilities in elucidating genotype-phenotype relationship with nucleotide-level precision, a significant improvement over the ~5–10 base pair resolution of traditional genetic screens.
- Results | page 7 | identified 220 A > G and 224 A > G (Supplementary Fig.
- Figure Legends | page 8 | Arrayed flow cytometry-based validation of shared and framework-specific hit regions using different base editors.
- Results | page 9 | (AAVS1, CD19 ex2acc and neutral 1-3 gRNAs) for validations in ABE8e and evoCDA cells are shown twice in panels b and d.
- Figure Legends | pages 10-11 | Pinpointing CD19 regulating transcription factors (TFs) via CRISPR-Millipede boards and a focused TF KO screen.
- Discussion | page 12 | Targeting hit regions provides resistance to CD19-CAR-T cells.
- Methods | pages 13-18 | Other methods have been developed to investigate the contribution of individual single nucleotide variants on gene expression14,15.
- Acknowledgments | page 19 | Source data Source Data 1 (16.6KB, xlsx) Source Data 2 (134.3KB, xlsx) Source Data 3 (32.9KB, xlsx) Source Data 4 (76.3KB, xlsx) Source Data 5 (13.1KB, xlsx) Source Data 6 (348.8KB, xlsx) Acknowledgements The authors thank funding from 1R35HG010717–01 (L.P., D.B.), UM1HG012010 (L.P.,D.B.,B.P.K.), Rappaport MGH Research Scholar Award 2024-2029 (L.P.), the Kayden-Lambert MGH Research Scholar Award 2023-2028 (B.P.K.), the Austrian Federal Ministry of Labour and Economy and the National Foundation for Research, Technology and Development to the Christian Doppler Research Association (M.L.).
- Data Availability | pages 20-24 | Data availability The raw and processed sequencing data generated in this study have been deposited in the Gene Expression Omnibus (GEO) database under accession code GSE278581 [https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE278581] and the Zenodo database under accession code 18187633 [10.5281/zenodo.18187633].

## Evidence Snippets

- Abstract CRISPR tiling screens have enabled the characterization of regulatory sequences but are limited by low resolution arising from the indirect readout of editing via guide RNA sequencing and enrichment analysis.
- This study introduces an end-to-end experimental assay and computational pipeline, which leverages targeted sequencing of CRISPR-introduced alleles at the endogenous target locus following dense base-editing mutagenesis.
- As a proof of concept, we studied a putative CD19 enhancer, an immunotherapy target in leukemia, and identified alleles and single nucleotides crucial for CD19 regulation.
- Our visualization tools revealed transcription factor motifs corresponding to the top-ranked nucleotides.
- Validation experiments confirmed that mutations in MYB, PAX5, and EBF1 binding sites reduce CD19 expression.
- Critically, editing MYB and PAX5 motifs conferred resistance to CD19 CAR-T cell therapy, revealing how non-coding variants can drive immunotherapy escape.
- Taken together, this approach achieves nucleotide-resolution genotypephenotype mapping at regulatory elements beyond conventional gRNA-based screens.
- Subject terms: Functional genomics, Software Regulatory DNA screens often lack nucleotide-level resolution.

## Evidence

- Source path: /tmp/datalox-biotech-eval/downloads/gene_editing-PMC13065808.pdf
- Source URL: https://pmc.ncbi.nlm.nih.gov/articles/PMC13065808/
- Note path: agent-wiki/notes/pdf/nucleotide-resolution-regulatory-elements-tiled-base-editing.md
- Metadata path: agent-wiki/notes/pdf/nucleotide-resolution-regulatory-elements-tiled-base-editing.capture.json
- Captured at: 2026-04-18T12:46:33.791Z
- Page count: 24

## Related

- Add follow-up notes or skills here when the PDF changes runtime behavior.

## Structure

- Abstract (page 1): Abstract CRISPR tiling screens have enabled the characterization of regulatory sequences but are limited by low resolution arising from the indirect readout of editing via guide RNA sequencing and enrichment analysis.
- Results (page 2): To address these limitations, we introduce an experimental and computational framework that enables precise determination of genotype-phenotype relationships at the nucleotide level from bulk amplicon sequencing, in the context of non-coding sequences, utilizing information from direct sequencing of alleles produced by base editing at regulatory regions.
- Figure Legends (pages 3-5): Base-editor tiling screen design featuring gRNA-directed targeting, allele-based phenotypic readout, and integrated computational analysis pipeline.
- Methods (page 6): In contrast to the gRNA readout model, CRISPR-Millipede demonstrates superior capabilities in elucidating genotype-phenotype relationship with nucleotide-level precision, a significant improvement over the ~5–10 base pair resolution of traditional genetic screens.
- Results (page 7): identified 220 A > G and 224 A > G (Supplementary Fig.
- Figure Legends (page 8): Arrayed flow cytometry-based validation of shared and framework-specific hit regions using different base editors.
- Results (page 9): (AAVS1, CD19 ex2acc and neutral 1-3 gRNAs) for validations in ABE8e and evoCDA cells are shown twice in panels b and d.
- Figure Legends (pages 10-11): Pinpointing CD19 regulating transcription factors (TFs) via CRISPR-Millipede boards and a focused TF KO screen.
- Discussion (page 12): Targeting hit regions provides resistance to CD19-CAR-T cells.
- Methods (pages 13-18): Other methods have been developed to investigate the contribution of individual single nucleotide variants on gene expression14,15.
- Acknowledgments (page 19): Source data Source Data 1 (16.6KB, xlsx) Source Data 2 (134.3KB, xlsx) Source Data 3 (32.9KB, xlsx) Source Data 4 (76.3KB, xlsx) Source Data 5 (13.1KB, xlsx) Source Data 6 (348.8KB, xlsx) Acknowledgements The authors thank funding from 1R35HG010717–01 (L.P., D.B.), UM1HG012010 (L.P.,D.B.,B.P.K.), Rappaport MGH Research Scholar Award 2024-2029 (L.P.), the Kayden-Lambert MGH Research Scholar Award 2023-2028 (B.P.K.), the Austrian Federal Ministry of Labour and Economy and the National Foundation for Research, Technology and Development to the Christian Doppler Research Association (M.L.).
- Data Availability (pages 20-24): Data availability The raw and processed sequencing data generated in this study have been deposited in the Gene Expression Omnibus (GEO) database under accession code GSE278581 [https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE278581] and the Zenodo database under accession code 18187633 [10.5281/zenodo.18187633].
