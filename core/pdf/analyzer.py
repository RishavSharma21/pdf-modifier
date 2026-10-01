"""PDF Analyzer — extracts editable text objects with smart line merging.

Merging strategy:
  • Non-link spans on the same visual line are merged into a single EditableText
    (prevents inter-span overlap when one span's text grows into a neighbour's area).
  • Link spans (URL hyperlinks detected via page link annotations) are kept as
    SEPARATE EditableText objects so that link editing, underline drawing, and
    annotation updates all continue to work correctly.
"""
from __future__ import annotations
import uuid
from typing import List, Dict, Any, Optional, Set
import fitz  # PyMuPDF
import pikepdf
from ..models.text_object import BoundingBox, FontInfo, TextRun, EditableText
from ..fonts.inspector import FontInspector
from .stream_parser import ContentStreamTokenizer, PdfOperator


class PDFAnalyzer:
    """Analyzes a PDF document and extracts structured EditableText objects."""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.font_inspector = FontInspector(pdf_path)

    @staticmethod
    def _build_span_font_info(span: dict, page_fonts: dict) -> FontInfo:
        s_font_name = span.get("font", "Helvetica")
        s_size = float(span.get("size", 12.0))
        s_color = span.get("color", 0)
        s_r = ((s_color >> 16) & 255) / 255.0
        s_g = ((s_color >> 8) & 255) / 255.0
        s_b = (s_color & 255) / 255.0
        s_flags = span.get("flags", 0)
        s_font_lower = s_font_name.lower()
        s_bold = bool(s_flags & 16) or ("bold" in s_font_lower) or ("black" in s_font_lower) or ("heavy" in s_font_lower)
        s_italic = bool(s_flags & 2) or ("italic" in s_font_lower) or ("oblique" in s_font_lower)

        base = page_fonts.get(s_font_name)
        if base:
            return FontInfo(
                family=base.family,
                size=s_size,
                weight="bold" if s_bold else base.weight,
                style="italic" if s_italic else base.style,
                color=(s_r, s_g, s_b),
                embedded=base.embedded,
                subsetted=base.subsetted,
                resource_name=base.resource_name,
                encoding=base.encoding,
                is_cid=base.is_cid,
                base_font=base.base_font,
                char_to_code=base.char_to_code,
                code_to_char=base.code_to_char,
            )
        else:
            is_sub = FontInspector.is_subset_name(s_font_name)
            clean_fam = FontInspector.clean_font_name(s_font_name)
            return FontInfo(
                family=clean_fam,
                size=s_size,
                weight="bold" if s_bold else "normal",
                style="italic" if s_italic else "normal",
                color=(s_r, s_g, s_b),
                embedded=False,
                subsetted=is_sub,
                base_font=s_font_name,
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze_page(self, page_index: int = 0) -> List[EditableText]:
        """Extract editable text for a page (0-indexed).

        Returns one EditableText per logical unit:
          • For lines without links → full merged line (all spans joined).
          • For lines with links    → each link span is its own object;
                                      surrounding non-link text is merged separately.
        """
        doc = fitz.open(self.pdf_path)
        page = doc[page_index]
        page_num = page_index + 1   # 1-indexed

        page_fonts = self.font_inspector.inspect_page_fonts(page_index)

        # Collect link annotation rects so we can detect "link spans"
        link_rects: List[fitz.Rect] = []
        try:
            for lk in page.get_links():
                r = lk.get("from")
                if r:
                    link_rects.append(fitz.Rect(r))
        except Exception:
            pass

        text_page = page.get_text(
            "dict",
            flags=fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE
        )

        editable_objects: List[EditableText] = []
        block_idx = 0

        for block in text_page.get("blocks", []):
            if block.get("type") != 0:   # 0 = text, 1 = image
                continue

            for line_idx, line in enumerate(block.get("lines", [])):
                spans = [s for s in line.get("spans", []) if s.get("text", "")]
                if not spans:
                    continue

                # Merge all spans of this visual line into a single EditableText.
                # This guarantees:
                # 1. Unified line editing — shortening/lengthening URLs or words reflows
                #    naturally without leaving blank gaps or colliding with adjacent boxes.
                # 2. Numbered bullets like "2)" are unified with their line text.
                # 3. Inter-span spacing is properly preserved.
                group_spans = spans
                group_text = ""
                for s_i, s in enumerate(group_spans):
                    t = s.get("text", "")
                    if not t:
                        continue
                    if group_text:
                        prev_span = group_spans[s_i - 1]
                        prev_x1 = prev_span["bbox"][2]
                        curr_x0 = s["bbox"][0]
                        gap = curr_x0 - prev_x1
                        if gap >= s.get("size", 12.0) * 0.18 and not group_text.endswith(" ") and not t.startswith(" "):
                            group_text += " "
                    group_text += t
                if not group_text.strip():
                    continue

                x0 = min(s["bbox"][0] for s in group_spans)
                y0 = min(s["bbox"][1] for s in group_spans)
                x1 = max(s["bbox"][2] for s in group_spans)
                y1 = max(s["bbox"][3] for s in group_spans)
                group_bbox = BoundingBox(x=x0, y=y0, width=x1 - x0, height=y1 - y0)
                obj_id = f"line-{page_num}-{block_idx}-{line_idx}"

                runs: List[TextRun] = []
                for s_i, span in enumerate(group_spans):
                    sb = span["bbox"]
                    sp_origin = span.get("origin", (sb[0], sb[3]))
                    sp_bbox = BoundingBox(
                        x=sb[0], y=sb[1],
                        width=sb[2] - sb[0], height=sb[3] - sb[1]
                    )
                    run_fi = self._build_span_font_info(span, page_fonts)
                    runs.append(TextRun(
                        id=f"{obj_id}-s{s_i}",
                        text=span.get("text", ""),
                        bounding_box=sp_bbox,
                        font=run_fi,
                        origin=(float(sp_origin[0]), float(sp_origin[1]))
                    ))

                # Primary font for the merged line: use the longest span
                longest_span = max(group_spans, key=lambda s: len(s.get("text", "")))
                line_font_info = self._build_span_font_info(longest_span, page_fonts)

                first_span = group_spans[0]
                first_origin = first_span.get("origin", (x0, y1))
                origin = (float(first_origin[0]), float(first_origin[1]))

                editable = EditableText(
                    id=obj_id,
                    page_number=page_num,
                    text=group_text,
                    bounding_box=group_bbox,
                    font=line_font_info,
                    origin=origin,
                    runs=runs,
                    rotation=page.rotation,
                )
                editable_objects.append(editable)

            block_idx += 1

        doc.close()
        return editable_objects

    def analyze_all_pages(self) -> Dict[int, List[EditableText]]:
        """Analyze all pages. Returns dict mapping 1-indexed page_num → EditableText list."""
        doc = fitz.open(self.pdf_path)
        total_pages = len(doc)
        doc.close()
        results: Dict[int, List[EditableText]] = {}
        for p in range(total_pages):
            results[p + 1] = self.analyze_page(p)
        return results

    def inspect_raw_page_streams(self, page_index: int = 0) -> List[bytes]:
        """Extract raw uncompressed content stream buffers for a page via PikePDF."""
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

    def extract_images(self, page_index: int = 0) -> List[Dict[str, Any]]:
        """Extract all embedded image objects and their bounding boxes on a page."""
        doc = fitz.open(self.pdf_path)
        if page_index < 0 or page_index >= len(doc):
            doc.close()
            return []
        page = doc[page_index]
        page_num = page_index + 1
        images = []
        for idx, info in enumerate(page.get_image_info(xrefs=True)):
            bbox = info.get("bbox")
            xref = info.get("xref")
            if bbox:
                images.append({
                    "id": f"img-{page_num}-{idx}",
                    "xref": xref,
                    "boundingBox": {
                        "x": float(bbox[0]),
                        "y": float(bbox[1]),
                        "width": float(bbox[2] - bbox[0]),
                        "height": float(bbox[3] - bbox[1]),
                    },
                    "width": info.get("width"),
                    "height": info.get("height"),
                })
        doc.close()
        return images

