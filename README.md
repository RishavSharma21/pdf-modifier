# PDFModifier: High-Fidelity PDF Edit Engine

A production-oriented document-engineering engine that enables direct, surgical modification of existing text inside PDF content streams—without rasterizing pages, without overlay/whiteout hacks, and without lossy roundtrips through Word or LibreOffice.

---

## The Problem

PDFs are fixed-layout vector canvas programs, not structured documents like Word or HTML files. When a PDF is compiled:
- Text is broken into arbitrary display chunks and low-level canvas operators (`BT`, `Tf`, `Tm`, `Tj`, `TJ`, `ET`).
- Characters may be separated by manual kerning adjustments or placed in non-reading order.
- Fonts are often aggressively **subsetted** (e.g., `ABCDEF+Calibri`), retaining only the glyphs present in the original draft.
- Text has no reflow engine; bounding boxes, baseline offsets, and matrices are fixed at exact 72-DPI points.

Most existing "web PDF editors" solve this by cheating: they either convert the PDF to a Word document and back (destroying vector geometry and typography) or overlay an HTML/canvas white box over the text and render new text on top (which corrupts searchability, vector layers, and print fidelity).

---

## The Solution: True Content Stream Modification

**PDFModifier** directly manipulates the PDF's uncompressed content streams, glyph tables, and indirect object graphs:
1. **Locate Target Text Operators**: Identifies the exact content stream bytes and text operators (`Tj`, `TJ`) responsible for the visible text run.
2. **Font & Glyph Analysis**: Inspects the page's `/Resources /Font` dictionary and character maps to verify whether the embedded font can represent the replacement text.
3. **Advance Width & Layout Recalculation**: Calculates the precise rendered advance width of the replacement string using font metrics, ensuring neighboring content is preserved.
4. **Surgical Stream Rewriting**: Modifies the operator stream in-place, handling literal strings, hex strings, and kerning arrays.
5. **Clean Object Graph Serialization**: Saves the document via PikePDF (QPDF engine) to guarantee perfect cross-reference (`xref`) tables and zero structural corruption.

---

## Technical Architecture (Phase 0)

```
pdfmodifier/
├── core/
│   ├── models/
│   │   ├── text_object.py        # EditableText, TextRun, BoundingBox, FontInfo
│   │   └── operation.py          # EditOperation, ModificationStrategy, ModificationResult
│   ├── pdf/
│   │   ├── analyzer.py           # Extracts layout, text runs, and page fonts
│   │   ├── stream_parser.py      # PDF content stream lexer (BT, ET, Tf, Tm, Tj, TJ)
│   │   └── coordinate.py         # Transforms PDF coordinates <-> Viewport coordinates
│   ├── fonts/
│   │   ├── inspector.py          # Embedded font inspection, subset detection, glyph availability
│   │   ├── metrics.py            # Advance width calculations via PyMuPDF font metrics
│   │   └── fallback.py           # Controlled fallback font matching and substitution
│   ├── modification/
│   │   ├── strategy.py           # Abstract modification strategy interface
│   │   ├── true_content_strategy.py # True content stream surgery engine
│   │   └── engine.py             # Orchestration engine for text search & replacement
│   └── validation/
│       ├── validator.py          # Independent dual-parser (PyMuPDF + PikePDF) validator
│       └── visual_diff.py        # 150 DPI page rasterization & pixel-level diff analyzer
├── scripts/
│   ├── generate_test_corpus.py   # Generates controlled test PDFs
│   ├── analyze_pdf.py            # CLI tool to inspect fonts, streams, and text runs
│   └── modify_pdf.py             # CLI tool to modify text and run validation/diffing
└── tests/                        # Automated unit and integration test suite
```

---

## Font Strategy Matrix

Every text replacement is classified by the engine into one of four states:

| Strategy | Description | When Used |
|---|---|---|
| `ORIGINAL_FONT_REUSED` | Reuses existing embedded/Base-14 font dictionary and encoding. | All replacement glyphs exist in the font or subset. |
| `ORIGINAL_FONT_PATCHED` | Expands or patches missing glyphs into embedded font program. | Subsetted TrueType/OpenType where safe expansion is supported. |
| `FONT_SUBSTITUTED` | Injects a matching standard font resource (`/F_FALLBACK`) and updates `Tf`. | Missing glyphs in subset where in-place patching risks corruption. |
| `UNSUPPORTED` | Operation halted with an explicit error explaining the failure mode. | Encrypted streams, unsupported compressed object formats. |

---

## Verification & Visual Regression Testing

Every modification in PDFModifier can be verified using the automated validation suite:
- **Structural Integrity**: Re-opened independently by both **PyMuPDF** and **PikePDF (QPDF)**.
- **Searchability & Selectability**: Confirms the replacement string exists as genuine selectable text.
- **Preservation of Unrelated Content**: Verifies that adjacent paragraphs, tables, and images remain unchanged.
- **Visual Regression Testing**: Both the original and modified documents are rasterized to PNG at 150 DPI, pixel-diffed, and analyzed. In our standard test cases, changes alter less than **0.05%** of the page area, restricted solely to the target text bounding box.

---

## CLI Usage

### 1. Generate Test Corpus
```bash
python scripts/generate_test_corpus.py
```

### 2. Analyze PDF Content and Text Runs
```bash
python scripts/analyze_pdf.py test-pdfs/standard_font.pdf
```

### 3. Surgically Modify PDF Text
```bash
python scripts/modify_pdf.py test-pdfs/standard_font.pdf output.pdf \
  --search "Rishav" \
  --replace "Rishav Sharma" \
  --validate \
  --visual-diff
```

### 4. Run Automated Tests
```bash
pytest -v
```

---

## Current Scope & Limitations

PDFModifier is designed with an honest engineering policy. We do not claim universal compatibility with every PDF ever created:
- **Supported in Phase 0**: Selectable text runs with Standard-14 fonts, full embedded fonts, and subsetted fonts with existing glyph representation; hex-encoded and literal `Tj`/`TJ` streams; multi-column text layouts.
- **Planned for Phase 1 & beyond**: Full paragraph reflow across line breaks, rotated text matrix transformations, interactive React + PDF.js editing canvas.
- **Unsupported**: Scanned bitmap PDFs without OCR, password-protected/DRM-locked documents, and Type 3 bitmap-only fonts.
