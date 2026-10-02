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
        s_font_clean = s_font_lower.split('+')[-1]  # strip any subset prefix like ABCDEF+
        s_bold = (
            bool(s_flags & 16)
            or any(k in s_font_clean for k in ('bold', 'black', 'heavy', 'semibold', 'demi', 'cmbx', 'w6', 'w7', 'w8', 'w9'))
            or any(s_font_clean.endswith(k) for k in ('-bd', '-b', '-bold'))
        )
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

    BULLET_CHARS: Set[str] = {
        '•', '·', '●', '○', '◦', '▪', '▫', '■', '□', '◆', '◇', '►', '▸', '‣', '⁃',
        '\u2022', '\u25cf', '\u25e6', '\u25aa', '\uf0b7', '\uf0a7', '\xb7', '*', '–', '—'
    }

    @classmethod
    def _is_bullet_span(cls, span: dict) -> bool:
        text = span.get("text", "").strip()
        if not text:
            return False
        if text in cls.BULLET_CHARS:
            return True
        if len(text) == 1 and not text.isalnum() and not text.isspace():
            font = span.get("font", "").lower()
            if any(k in font for k in ["symbol", "dingbat", "wingding", "cmsy"]):
                return True
        return False

    @staticmethod
    def _is_bold_span(span: dict) -> bool:
        font = span.get("font", "").lower()
        flags = span.get("flags", 0)
        return bool(flags & 16) or any(k in font for k in ["bold", "black", "heavy", "medium", "semibold"])

    @classmethod
    def _group_line_spans(cls, spans: List[dict]) -> List[List[dict]]:
        """Group visual line spans into logical editable units.
        
        1. Isolates leading bullet dots into their own unit so users never
           accidentally delete or re-format bullets.
        2. Separates bold labels (e.g. 'Languages:', 'Frameworks / Libraries:')
           from following regular text so editing body text never turns bold.
        3. Merges contiguous spans of the same flow so sentences and paragraphs
           remain unified.
        """
        if not spans:
            return []

        expanded_spans = []
        first = spans[0]
        first_text = first.get("text", "")
        first_stripped = first_text.strip()

        if cls._is_bullet_span(first):
            expanded_spans.append({**first, "is_bullet": True})
            expanded_spans.extend(spans[1:])
        elif len(first_text) > 1 and first_text.lstrip() and first_text.lstrip()[0] in cls.BULLET_CHARS:
            bullet_char = first_text.lstrip()[0]
            rest_text = first_text[first_text.find(bullet_char) + 1:].lstrip()
            b_sb = first.get("bbox", [0, 0, 10, 10])
            char_w = first.get("size", 10.0) * 0.7
            b_span = {
                **first,
                "text": bullet_char,
                "bbox": [b_sb[0], b_sb[1], b_sb[0] + char_w, b_sb[3]],
                "is_bullet": True
            }
            rest_span = {
                **first,
                "text": rest_text,
                "bbox": [b_sb[0] + char_w, b_sb[1], b_sb[2], b_sb[3]],
                "is_bullet": False
            }
            expanded_spans.append(b_span)
            expanded_spans.append(rest_span)
            expanded_spans.extend(spans[1:])
        else:
            expanded_spans.extend(spans)

        groups = []
        curr_group = []

        for s in expanded_spans:
            t = s.get("text", "")
            if not t.strip() and not s.get("is_bullet"):
                continue

            if s.get("is_bullet"):
                if curr_group:
                    groups.append(curr_group)
                    curr_group = []
                groups.append([s])
                continue

            if not curr_group:
                curr_group.append(s)
                continue

            prev_s = curr_group[-1]
            prev_is_bold = cls._is_bold_span(prev_s)
            curr_is_bold = cls._is_bold_span(s)
            prev_text = prev_s.get("text", "").rstrip()

            # Separate bold label ending in ':' from following regular body text
            if prev_is_bold and not curr_is_bold and (prev_text.endswith(":") or prev_text.endswith(":-") or prev_text.endswith(" -")):
                groups.append(curr_group)
                curr_group = [s]
            else:
                curr_group.append(s)

        if curr_group:
            groups.append(curr_group)

        return groups if groups else [spans]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze_page(self, page_index: int = 0) -> List[EditableText]:
        """Extract editable text for a page (0-indexed).

        Returns one EditableText per logical unit:
          • Bullet dots are isolated from bullet text.
          • Bold labels (e.g. 'Languages:') are separated from regular items.
          • Contiguous spans of normal text are merged into clean visual lines.
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
            flags=fitz.TEXT_PRESERVE_LIGATURES
            # Note: TEXT_PRESERVE_WHITESPACE is intentionally omitted.
            # On Linux, some embedded fonts (e.g. LaTeX CMR10/CMBX10) don't
            # include a ToUnicode mapping for glyph 32 (space), causing
            # PyMuPDF to emit \ufffd instead of a space character.
            # We rely on the positional gap analysis in the extraction loop
            # below, which is platform-agnostic and more robust.
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

                span_groups = self._group_line_spans(spans)

                for g_idx, group_spans in enumerate(span_groups):
                    group_text = ""
                    for s_i, s in enumerate(group_spans):
                        t = s.get("text", "").replace("\ufffd", " ").replace("\u0b1b", " ").replace("\x00", " ")
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
                    
                    if len(span_groups) == 1:
                        obj_id = f"line-{page_num}-{block_idx}-{line_idx}"
                    else:
                        obj_id = f"line-{page_num}-{block_idx}-{line_idx}-g{g_idx}"

                    runs: List[TextRun] = []
                    for s_i, span in enumerate(group_spans):
                        sb = span["bbox"]
                        sp_origin = span.get("origin", (sb[0], sb[3]))
                        sp_bbox = BoundingBox(
                            x=sb[0], y=sb[1],
                            width=sb[2] - sb[0], height=sb[3] - sb[1]
                        )
                        run_fi = self._build_span_font_info(span, page_fonts)
                        clean_span_text = span.get("text", "").replace("\ufffd", " ").replace("\u0b1b", " ").replace("\x00", " ")
                        runs.append(TextRun(
                            id=f"{obj_id}-s{s_i}",
                            text=clean_span_text,
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

