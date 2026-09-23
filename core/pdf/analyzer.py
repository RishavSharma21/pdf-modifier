"""PDF Analyzer for extracting text runs, font resources, and bounding boxes."""
from __future__ import annotations
import uuid
from typing import List, Dict, Any, Optional
import fitz  # PyMuPDF
import pikepdf
from ..models.text_object import BoundingBox, FontInfo, TextRun, EditableText
from ..fonts.inspector import FontInspector
from .stream_parser import ContentStreamTokenizer, PdfOperator


class PDFAnalyzer:
    """Analyzes a PDF document and extracts structured EditableText objects and TextRuns."""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.font_inspector = FontInspector(pdf_path)

    def analyze_page(self, page_index: int = 0) -> List[EditableText]:
        """Extract all editable text blocks and runs for a page (0-indexed)."""
        doc = fitz.open(self.pdf_path)
        page = doc[page_index]
        page_num = page_index + 1

        # Extract page fonts dictionary
        page_fonts = self.font_inspector.inspect_page_fonts(page_index)

        # PyMuPDF textpage extracted as structured dictionary
        text_page = page.get_text("dict", flags=fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE)
        editable_objects: List[EditableText] = []

        block_idx = 0
        for block in text_page.get("blocks", []):
            if block.get("type") != 0:  # 0 is text block, 1 is image
                continue

            block_bbox = BoundingBox.from_rect(block["bbox"])
            for line in block.get("lines", []):
                line_text_parts = []
                line_runs: List[TextRun] = []
                line_bbox = BoundingBox.from_rect(line["bbox"])

                for span in line.get("spans", []):
                    span_text = span.get("text", "")
                    if not span_text.strip():
                        continue

                    span_bbox = BoundingBox.from_rect(span["bbox"])
                    font_name = span.get("font", "Helvetica")
                    font_size = float(span.get("size", 12.0))
                    color_int = span.get("color", 0)

                    # Convert integer color to RGB tuple (0.0-1.0)
                    r = ((color_int >> 16) & 255) / 255.0
                    g = ((color_int >> 8) & 255) / 255.0
                    b = (color_int & 255) / 255.0

                    # Match font metadata from page fonts
                    font_info = page_fonts.get(font_name)
                    if not font_info:
                        is_subset = FontInspector.is_subset_name(font_name)
                        clean_family = FontInspector.clean_font_name(font_name)
                        font_info = FontInfo(
                            family=clean_family,
                            size=font_size,
                            weight="bold" if "bold" in font_name.lower() else "normal",
                            style="italic" if "italic" in font_name.lower() else "normal",
                            color=(r, g, b),
                            embedded=False,
                            subsetted=is_subset,
                            base_font=font_name,
                        )
                    else:
                        # Copy and attach run-specific size and color
                        font_info = FontInfo(
                            family=font_info.family,
                            size=font_size,
                            weight=font_info.weight,
                            style=font_info.style,
                            color=(r, g, b),
                            embedded=font_info.embedded,
                            subsetted=font_info.subsetted,
                            resource_name=font_info.resource_name,
                            encoding=font_info.encoding,
                            is_cid=font_info.is_cid,
                            base_font=font_info.base_font,
                            char_to_code=font_info.char_to_code,
                            code_to_char=font_info.code_to_char,
                        )

                    origin = span.get("origin", (span_bbox.x, span_bbox.y + span_bbox.height))
                    run_id = f"run-{page_num}-{block_idx}-{len(line_runs)}"

                    text_run = TextRun(
                        id=run_id,
                        text=span_text,
                        bounding_box=span_bbox,
                        font=font_info,
                        origin=origin,
                    )
                    line_runs.append(text_run)
                    line_text_parts.append(span_text)

                if line_runs:
                    full_line_text = "".join(line_text_parts)
                    primary_font = line_runs[0].font
                    editable_id = f"text-{page_num}-{block_idx}-{len(editable_objects)}"

                    editable = EditableText(
                        id=editable_id,
                        page_number=page_num,
                        text=full_line_text,
                        bounding_box=line_bbox,
                        font=primary_font,
                        runs=line_runs,
                        rotation=page.rotation,
                    )
                    editable_objects.append(editable)

            block_idx += 1

        doc.close()
        return editable_objects

    def analyze_all_pages(self) -> Dict[int, List[EditableText]]:
        """Analyze all pages in document. Returns dict mapping 1-indexed page_num to EditableText list."""
        doc = fitz.open(self.pdf_path)
        total_pages = len(doc)
        doc.close()

        results: Dict[int, List[EditableText]] = {}
        for p in range(total_pages):
            results[p + 1] = self.analyze_page(p)
        return results

    def inspect_raw_page_streams(self, page_index: int = 0) -> List[bytes]:
        """Extract all raw uncompressed content stream buffers for a page via PikePDF."""
        streams = []
        with pikepdf.Pdf.open(self.pdf_path) as pdf:
            page = pdf.pages[page_index]
            contents = page.get("/Contents")
            if contents is None:
                return []
            if isinstance(contents, pikepdf.Array):
                for stream_obj in contents:
                    streams.append(stream_obj.read_bytes())
            elif isinstance(contents, (pikepdf.Stream, pikepdf.Dictionary)):
                streams.append(contents.read_bytes())
        return streams
