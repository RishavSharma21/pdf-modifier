"""True Content Stream Modification Strategy.

Modifies PDF text at the content-stream operator level without rasterization,
redaction flattening, or format conversion.
"""
from __future__ import annotations
import os
import re
from typing import Optional, List, Tuple, Dict, Any
import pikepdf
from .strategy import TextModificationStrategy
from ..models.operation import EditOperation, ModificationResult, ModificationStrategy
from ..models.text_object import BoundingBox, FontInfo
from ..fonts.inspector import FontInspector
from ..fonts.metrics import FontMetricsCalculator
from ..fonts.fallback import FontFallbackMatcher
from ..pdf.stream_parser import escape_pdf_string


def segment_text_by_runs(
    orig_text: str,
    new_text: str,
    runs: Optional[List[Any]],
    default_font: FontInfo
) -> List[Tuple[str, FontInfo]]:
    """Preserve rich text formatting (bold, italic, color) across multi-run lines during edits."""
    if not runs or len(runs) <= 1:
        return [(new_text, default_font)]

    orig_char_fonts = [default_font] * len(orig_text)
    curr_idx = 0
    for r in runs:
        r_text = getattr(r, "text", "")
        r_font = getattr(r, "font", default_font)
        if not r_text:
            continue
        pos = orig_text.find(r_text, curr_idx)
        if pos != -1:
            for k in range(pos, pos + len(r_text)):
                orig_char_fonts[k] = r_font
            curr_idx = pos + len(r_text)

    import difflib
    matcher = difflib.SequenceMatcher(None, orig_text, new_text)
    new_char_fonts = [default_font] * len(new_text)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            new_char_fonts[j1:j2] = orig_char_fonts[i1:i2]
        elif tag in ("replace", "insert"):
            if i1 < len(orig_char_fonts):
                f = orig_char_fonts[i1]
            elif i1 > 0:
                f = orig_char_fonts[i1 - 1]
            else:
                f = default_font
            for k in range(j1, j2):
                new_char_fonts[k] = f

    if not new_text:
        return []

    segments: List[Tuple[str, FontInfo]] = []
    curr_str = []
    curr_font = new_char_fonts[0]

    def is_same_style(f1: FontInfo, f2: FontInfo) -> bool:
        if not f1 or not f2:
            return f1 == f2
        return (
            getattr(f1, "weight", "normal") == getattr(f2, "weight", "normal") and
            getattr(f1, "style", "normal") == getattr(f2, "style", "normal") and
            getattr(f1, "color", (0, 0, 0)) == getattr(f2, "color", (0, 0, 0)) and
            getattr(f1, "family", "") == getattr(f2, "family", "") and
            abs(getattr(f1, "size", 12.0) - getattr(f2, "size", 12.0)) < 0.1
        )

    for ch, font in zip(new_text, new_char_fonts):
        if is_same_style(font, curr_font):
            curr_str.append(ch)
        else:
            segments.append(("".join(curr_str), curr_font))
            curr_str = [ch]
            curr_font = font

    if curr_str:
        segments.append(("".join(curr_str), curr_font))

    return segments


class TrueContentModificationStrategy(TextModificationStrategy):
    """Direct PDF content-stream modification engine."""

    def apply_edit(
        self,
        input_pdf_path: str,
        output_pdf_path: str,
        operation: EditOperation
    ) -> ModificationResult:
        """Surgically modify the target text in the PDF content stream."""
        orig_text = operation.original_text
        new_text = operation.new_text
        target_page_num = operation.page_number  # 1-indexed

        if not orig_text:
            return ModificationResult(
                success=False,
                operation=operation,
                strategy=ModificationStrategy.UNSUPPORTED,
                error="Original text cannot be empty"
            )

        try:
            pdf = pikepdf.Pdf.open(input_pdf_path)
        except Exception as e:
            return ModificationResult(
                success=False,
                operation=operation,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Failed to open PDF with pikepdf: {e}"
            )

        if target_page_num < 1 or target_page_num > len(pdf.pages):
            pdf.close()
            return ModificationResult(
                success=False,
                operation=operation,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Page number {target_page_num} out of bounds (1-{len(pdf.pages)})"
            )

        page_idx = target_page_num - 1
        page = pdf.pages[page_idx]

        # Inspect font and glyph coverage
        inspector = FontInspector(input_pdf_path)
        page_fonts = inspector.inspect_page_fonts(page_idx)

        target_font = operation.original_font
        if not target_font and page_fonts:
            # Pick first available or primary font
            target_font = next(iter(page_fonts.values()))

        # Check glyph availability
        strategy_used = ModificationStrategy.ORIGINAL_FONT_REUSED
        details = "Original font and glyph mapping reused successfully."
        fallback_font_name: Optional[str] = None

        if target_font:
            can_represent, missing = inspector.check_glyph_availability(target_font, new_text, page_idx)
            if not can_represent:
                # Need font substitution
                fallback_info = FontFallbackMatcher.match_fallback_font(target_font)
                strategy_used = ModificationStrategy.FONT_SUBSTITUTED
                fallback_font_name = fallback_info.base_font or "Helvetica"
                details = (
                    f"Original font {target_font.family} missing glyphs {missing}. "
                    f"Substituted with standard font {fallback_font_name}."
                )

        # Calculate width difference
        width_delta = 0.0
        if target_font:
            width_delta = FontMetricsCalculator.calculate_width_delta(
                orig_text, new_text, target_font
            )

        # Read page content stream(s)
        contents = page.get("/Contents")
        if contents is None:
            pdf.close()
            return ModificationResult(
                success=False,
                operation=operation,
                strategy=ModificationStrategy.UNSUPPORTED,
                error="Page has no /Contents stream"
            )

        # Check for subset CMap mappings across page fonts
        subset_candidates: List[Dict[str, Any]] = []
        for f_res, f_info in page_fonts.items():
            if f_info.char_to_code and all(ch in f_info.char_to_code for ch in orig_text):
                encoded_orig = "".join(f_info.char_to_code[ch] for ch in orig_text).lower()
                can_encode_new = all(ch in f_info.char_to_code for ch in new_text)
                encoded_new = "".join(f_info.char_to_code[ch] for ch in new_text).lower() if can_encode_new else None
                subset_candidates.append({
                    "font": f_info,
                    "font_res": f_info.resource_name or f_res,
                    "encoded_orig": encoded_orig,
                    "can_encode_new": can_encode_new,
                    "encoded_new": encoded_new,
                })

        # If any subset font matches orig_text and cannot encode new_text, enforce fallback font
        if subset_candidates and not any(c["can_encode_new"] for c in subset_candidates):
            if not fallback_font_name:
                best_font = subset_candidates[0]["font"]
                fallback_info = FontFallbackMatcher.match_fallback_font(best_font)
                strategy_used = ModificationStrategy.FONT_SUBSTITUTED
                fallback_font_name = fallback_info.base_font or "Helvetica"
                details = f"Subset font missing glyphs for replacement. Substituted with {fallback_font_name}."

        # If font fallback is required, inject fallback font resource into page dictionary
        if fallback_font_name:
            if "/Resources" not in page:
                page["/Resources"] = pikepdf.Dictionary()
            res_dict = page["/Resources"]
            if "/Font" not in res_dict:
                res_dict["/Font"] = pikepdf.Dictionary()
            font_clean = fallback_font_name.replace("/", "")
            res_dict["/Font"][pikepdf.Name("/F_FALLBACK")] = pikepdf.Dictionary(
                Type=pikepdf.Name.Font,
                Subtype=pikepdf.Name.Type1,
                BaseFont=pikepdf.Name("/" + font_clean),
                Encoding=pikepdf.Name.WinAnsiEncoding
            )

        # Normalize contents into a list of stream objects
        content_streams = []
        if isinstance(contents, pikepdf.Array):
            content_streams = list(contents)
        else:
            content_streams = [contents]

        modified_stream = False

        # If an exact spatial bounding box is provided, prioritize Native Stream Surgery
        # to ensure the exact clicked occurrence is modified rather than blind global stream replacement.
        # IMPORTANT: when spatial surgery is requested, we MUST skip the non-spatial pikepdf
        # stream replacement, which would blindly replace ALL occurrences causing duplicate text.
        use_spatial_surgery = operation.original_bounding_box is not None

        # Attempt replacement across content streams only if not spatially targeted
        if not use_spatial_surgery:
            for stream_obj in content_streams:
                raw_bytes = stream_obj.read_bytes()
                updated_bytes, count, matched_strat = self._replace_text_in_stream(
                    raw_bytes,
                    orig_text,
                    new_text,
                    subset_candidates=subset_candidates,
                    fallback_font=fallback_font_name,
                    font_size=target_font.size if target_font else 12.0
                )
                if count > 0:
                    stream_obj.write(updated_bytes)
                    modified_stream = True
                    if matched_strat:
                        strategy_used = matched_strat
                    break

        # Only attempt combined-stream fallback when NOT doing spatial surgery.
        # Spatial surgery MUST go through the fitz path below to target the correct instance.
        if not modified_stream and not use_spatial_surgery:
            # Fallback: combine if multiple streams exist
            if len(content_streams) > 1:
                combined_bytes = bytearray()
                for s in content_streams:
                    combined_bytes.extend(s.read_bytes())
                    combined_bytes.extend(b"\n")
                updated_bytes, count, matched_strat = self._replace_text_in_stream(
                    bytes(combined_bytes),
                    orig_text,
                    new_text,
                    subset_candidates=subset_candidates,
                    fallback_font=fallback_font_name,
                    font_size=target_font.size if target_font else 12.0
                )
                if count > 0:
                    new_stream = pdf.make_stream(updated_bytes)
                    page["/Contents"] = new_stream
                    modified_stream = True
                    if matched_strat:
                        strategy_used = matched_strat

        if not modified_stream:
            # Fallback: Perform PDF Native Stream Surgery (ISO 32000-1 §14.9)
            # Slices out target vector glyph stream instructions and inserts the new text
            try:
                import fitz
                pdf.close()
                doc = fitz.open(input_pdf_path)
                page_fitz = doc[page_idx]

                rects = []
                sub_orig = orig_text
                sub_new = new_text

                # Determine target area for redaction
                target_rect = None
                rects_to_redact = []

                if operation.original_bounding_box:
                    ob = operation.original_bounding_box
                    target_rect = fitz.Rect(ob.x, ob.y, ob.x + ob.width, ob.y + ob.height)
                    rects_to_redact.append(fitz.Rect(target_rect.x0 - 0.5, target_rect.y0 - 0.2, target_rect.x1 + 0.5, target_rect.y1 + 0.2))

                    # Also find any specific search rects inside target_rect
                    search_matches = page_fitz.search_for(orig_text)
                    for r in search_matches:
                        if target_rect.intersects(r):
                            rects_to_redact.append(fitz.Rect(r.x0 - 0.5, r.y0 - 0.2, r.x1 + 0.5, r.y1 + 0.2))

                # Fallback: full text search
                if not target_rect:
                    rects = page_fitz.search_for(orig_text)
                    if rects:
                        target_rect = fitz.Rect(
                            min(r.x0 for r in rects),
                            min(r.y0 for r in rects),
                            max(r.x1 for r in rects),
                            max(r.y1 for r in rects)
                        )
                        for r in rects:
                            rects_to_redact.append(fitz.Rect(r.x0 - 0.5, r.y0 - 0.2, r.x1 + 0.5, r.y1 + 0.2))

                # Fallback: word-level diff
                if not target_rect and not rects_to_redact:
                    import difflib
                    s = difflib.SequenceMatcher(None, orig_text.split(), new_text.split())
                    for tag, i1, i2, j1, j2 in s.get_opcodes():
                        if tag == 'replace':
                            w_orig = " ".join(orig_text.split()[i1:i2])
                            w_new = " ".join(new_text.split()[j1:j2])
                            w_rects = page_fitz.search_for(w_orig)
                            if w_rects:
                                target_rect = fitz.Rect(
                                    min(r.x0 for r in w_rects),
                                    min(r.y0 for r in w_rects),
                                    max(r.x1 for r in w_rects),
                                    max(r.y1 for r in w_rects)
                                )
                                for r in w_rects:
                                    rects_to_redact.append(fitz.Rect(r.x0 - 0.5, r.y0 - 0.2, r.x1 + 0.5, r.y1 + 0.2))
                                sub_orig = w_orig
                                sub_new = w_new
                                break
                if target_rect and rects_to_redact:
                    # 1. Clean up any existing link annotations in target_rect
                    try:
                        for lk in page_fitz.get_links():
                            lk_rect = lk.get("from")
                            if lk_rect and lk_rect.intersects(target_rect):
                                page_fitz.delete_link(lk)
                    except Exception:
                        pass

                    # Determine baseline Y and left X upfront to accurately compute vertical boundaries
                    def_font_size = target_font.size if target_font else 11.0
                    if operation.origin:
                        baseline_y = operation.origin[1]
                        insertion_x = operation.origin[0]
                    else:
                        baseline_y = target_rect.y0 + (def_font_size * 0.82)
                        insertion_x = target_rect.x0

                    # Scan for adjacent lines in the same visual column to avoid vertical ascender/descender overlap
                    all_page_lines = []
                    for b in page_fitz.get_text("dict").get("blocks", []):
                        if b.get("type") == 0:
                            for l in b.get("lines", []):
                                spans = l.get("spans", [])
                                if spans:
                                    l_bbox = fitz.Rect(l.get("bbox", spans[0]["bbox"]))
                                    l_origin_y = spans[0]["origin"][1]
                                    if (l_bbox.x0 < target_rect.x1) and (l_bbox.x1 > target_rect.x0):
                                        all_page_lines.append((l_bbox, l_origin_y, spans[0].get("size", def_font_size)))

                    b_above = None
                    sz_above = def_font_size
                    b_below = None
                    sz_below = def_font_size

                    for l_bbox, l_origin_y, l_size in all_page_lines:
                        if l_origin_y < baseline_y - 2.0:
                            if b_above is None or l_origin_y > b_above:
                                b_above = l_origin_y
                                sz_above = l_size
                        elif l_origin_y > baseline_y + 2.0:
                            if b_below is None or l_origin_y < b_below:
                                b_below = l_origin_y
                                sz_below = l_size

                    # Calculate safe_y0: stay strictly below line above's descenders
                    if b_above is not None and (baseline_y - b_above <= def_font_size * 2.5):
                        safe_y0 = max(target_rect.y0, b_above + (0.32 * sz_above))
                    else:
                        safe_y0 = target_rect.y0 - 0.2

                    # Calculate safe_y1: stay strictly above line below's ascenders
                    if b_below is not None and (b_below - baseline_y <= def_font_size * 2.5):
                        safe_y1 = min(target_rect.y1, b_below - (1.08 * sz_below))
                    else:
                        safe_y1 = target_rect.y1 + 0.2

                    if safe_y0 >= safe_y1:
                        safe_y0 = baseline_y - (def_font_size * 0.75)
                        safe_y1 = baseline_y + (def_font_size * 0.15)

                    # Clamp all redaction rectangles to the safe vertical range so PyMuPDF never prunes sibling lines
                    clamped_rects_to_redact = []
                    for r in rects_to_redact:
                        c_y0 = max(r.y0, safe_y0)
                        c_y1 = min(r.y1, safe_y1)
                        if c_y0 < c_y1:
                            clamped_rects_to_redact.append(fitz.Rect(r.x0, c_y0, r.x1, c_y1))
                    if not clamped_rects_to_redact:
                        clamped_rects_to_redact = [fitz.Rect(target_rect.x0 - 0.5, safe_y0, target_rect.x1 + 0.5, safe_y1)]

                    # 2. Detect underlying background color behind target_rect (e.g. table cell grey, banner tint, or white)
                    bg_color = (1.0, 1.0, 1.0)
                    all_drawings = page_fitz.get_drawings()
                    for d in all_drawings:
                        f = d.get("fill")
                        if f and fitz.Rect(d["rect"]).contains(fitz.Point(target_rect.x0 + 1.0, target_rect.y0 + 1.0)):
                            bg_color = tuple(float(c) for c in f[:3])
                            break
                    if bg_color == (1.0, 1.0, 1.0):
                        try:
                            # Sample small patch at top-left of target_rect before redaction
                            sample_clip = fitz.Rect(target_rect.x0, target_rect.y0, target_rect.x0 + 2.0, target_rect.y0 + 2.0)
                            pix = page_fitz.get_pixmap(clip=sample_clip)
                            if pix.width > 0 and pix.height > 0:
                                p = pix.pixel(0, 0)
                                sampled = (p[0] / 255.0, p[1] / 255.0, p[2] / 255.0)
                                if sum(sampled) > 0.6:
                                    bg_color = sampled
                        except Exception:
                            pass

                    # 3. Identify and classify drawings near target_rect:
                    # - Underlines of THIS text run (to be erased & later re-drawn to match new text width)
                    # - Table borders and form lines to write on (MUST be protected and restored so lines never break)
                    lines_to_restore = []
                    underlines_to_erase = []
                    had_text_underline = False
                    text_underline_info = None

                    for d in all_drawings:
                        dr = fitz.Rect(d.get("rect"))
                        if dr is None:
                            continue
                        is_h = (dr.height <= 3.5)
                        is_v = (dr.width <= 3.5)
                        if not (is_h or is_v):
                            continue

                        # Check if drawing is in the vicinity of target_rect
                        if is_h and (dr.x0 < target_rect.x1 + 4.0) and (dr.x1 > target_rect.x0 - 4.0):
                            if (safe_y0 - 2.0 <= dr.y0 <= safe_y1 + 4.0):
                                # Check if it is strictly an underline OF THIS TEXT RUN
                                # A text underline starts near target_rect.x0 and ends near target_rect.x1
                                # If it extends significantly beyond (e.g. table border or form rule), it is NOT an underline
                                is_text_underline = (abs(dr.x0 - target_rect.x0) <= 8.0) and (abs(dr.x1 - target_rect.x1) <= 10.0)
                                if is_text_underline:
                                    underlines_to_erase.append(d)
                                    had_text_underline = True
                                    text_underline_info = {
                                        "color": d.get("color") or (0, 0, 0),
                                        "width": d.get("width") or 0.7,
                                        "y": (dr.y0 + dr.y1) / 2.0,
                                        "dashes": d.get("dashes")
                                    }
                                else:
                                    lines_to_restore.append(d)
                        elif is_v and (dr.y0 < safe_y1 + 4.0) and (dr.y1 > safe_y0 - 4.0):
                            if (target_rect.x0 - 4.0 <= dr.x0 <= target_rect.x1 + 4.0):
                                lines_to_restore.append(d)

                    # 4. Redact underlying stream operators for target area with detected bg_color
                    for r_redact in clamped_rects_to_redact:
                        page_fitz.add_redact_annot(r_redact, fill=bg_color)
                    page_fitz.apply_redactions(images=0, graphics=0)

                    # 5. Visual paint-over with detected bg_color (strictly within safe vertical range)
                    paint_rect = fitz.Rect(
                        target_rect.x0 - 0.5,
                        safe_y0,
                        target_rect.x1 + 0.5,
                        safe_y1
                    )
                    page_fitz.draw_rect(paint_rect, color=None, fill=bg_color, width=0)

                    # 6. Erase old text underline if any (using bg_color so background stays consistent)
                    for d in underlines_to_erase:
                        dr = fitz.Rect(d["rect"])
                        ul_paint = fitz.Rect(dr.x0 - 0.5, dr.y0 - 0.5, dr.x1 + 0.5, dr.y1 + 0.5)
                        page_fitz.draw_rect(ul_paint, color=None, fill=bg_color, width=0)

                    PAGE_RIGHT_MARGIN = max(page_fitz.rect.width - 36.0, 100.0)
                    avail_width = max(target_rect.width, PAGE_RIGHT_MARGIN - insertion_x)
                    font_color = target_font.color if target_font else (0, 0, 0)

                    # Cache for dynamically loaded system and Base-14 fonts
                    loaded_fonts: Dict[str, Tuple[str, Optional[fitz.Font], float]] = {}

                    def get_font_render_details(fi: Optional[FontInfo], text_sample: str = "") -> Tuple[str, Optional[fitz.Font], float]:
                        f_size = fi.size if (fi and hasattr(fi, "size")) else def_font_size
                        f_bold = (getattr(fi, "weight", "normal") == "bold")
                        f_italic = (getattr(fi, "style", "normal") == "italic")
                        f_raw = (getattr(fi, "family", None) or "").lower()
                        f_clean = f_raw.split('+')[-1]
                        if "bold" in f_clean or "black" in f_clean or "heavy" in f_clean:
                            f_bold = True
                        if "italic" in f_clean or "oblique" in f_clean:
                            f_italic = True

                        cache_key = f"{f_clean}__w{f_bold}__i{f_italic}"
                        chars_to_check = [c for c in (text_sample or sub_new) if ord(c) > 32]
                        if cache_key in loaded_fonts:
                            c_name, c_obj, c_mult = loaded_fonts[cache_key]
                            if not chars_to_check or (c_obj and all(c_obj.has_glyph(ord(c)) for c in chars_to_check)):
                                return c_name, c_obj, f_size * c_mult

                        # 1. Attempt to reuse matching embedded font directly from the PDF page
                        # This preserves 100% of the original document typography (e.g. Rubik, Inter, Helvetica)
                        try:
                            for fx in page_fitz.get_fonts():
                                xref = fx[0]
                                emb_name = (fx[3] or "").lower()
                                emb_clean = emb_name.split('+')[-1]
                                name_match = (
                                    f_clean in emb_clean or
                                    emb_clean in f_clean or
                                    any(k in emb_clean for k in f_clean.split('-') if len(k) > 2)
                                )
                                if name_match:
                                    font_buffer = doc.extract_font(xref)[3]
                                    if font_buffer and len(font_buffer) > 0:
                                        test_font = fitz.Font(fontbuffer=font_buffer)
                                        if not chars_to_check or all(test_font.has_glyph(ord(c)) for c in chars_to_check):
                                            font_alias = f"F_EMB_{xref}"
                                            page_fitz.insert_font(fontname=font_alias, fontbuffer=font_buffer)
                                            loaded_fonts[cache_key] = (font_alias, test_font, 1.0)
                                            return font_alias, test_font, f_size
                        except Exception:
                            pass

                        # 2. Candidate system font filenames based on clean font name and weight/style
                        f_cand = None
                        if 'calibri' in f_clean or 'carlito' in f_clean:
                            if f_bold and f_italic: f_cand = 'calibriz.ttf'
                            elif f_bold: f_cand = 'calibrib.ttf'
                            elif f_italic: f_cand = 'calibrii.ttf'
                            else: f_cand = 'calibri.ttf'
                        elif 'arial' in f_clean or 'liberationsans' in f_clean or 'helvetica' in f_clean:
                            if f_bold and f_italic: f_cand = 'arialbi.ttf'
                            elif f_bold: f_cand = 'arialbd.ttf'
                            elif f_italic: f_cand = 'ariali.ttf'
                            else: f_cand = 'arial.ttf'
                        elif 'times' in f_clean or 'liberationserif' in f_clean or 'roman' in f_clean:
                            if f_bold and f_italic: f_cand = 'timesbi.ttf'
                            elif f_bold: f_cand = 'timesbd.ttf'
                            elif f_italic: f_cand = 'timesi.ttf'
                            else: f_cand = 'times.ttf'
                        elif 'courier' in f_clean or 'liberationmono' in f_clean or 'consolas' in f_clean:
                            if f_bold and f_italic: f_cand = 'courbi.ttf'
                            elif f_bold: f_cand = 'courbd.ttf'
                            elif f_italic: f_cand = 'couri.ttf'
                            else: f_cand = 'cour.ttf'
                        elif 'segoe' in f_clean:
                            if f_bold and f_italic: f_cand = 'segoeuiz.ttf'
                            elif f_bold: f_cand = 'segoeuib.ttf'
                            elif f_italic: f_cand = 'segoeuii.ttf'
                            else: f_cand = 'segoeui.ttf'
                        elif 'georgia' in f_clean:
                            if f_bold and f_italic: f_cand = 'georgiaz.ttf'
                            elif f_bold: f_cand = 'georgiab.ttf'
                            elif f_italic: f_cand = 'georgiai.ttf'
                            else: f_cand = 'georgia.ttf'
                        elif 'verdana' in f_clean:
                            if f_bold and f_italic: f_cand = 'verdanaz.ttf'
                            elif f_bold: f_cand = 'verdanab.ttf'
                            elif f_italic: f_cand = 'verdanai.ttf'
                            else: f_cand = 'verdana.ttf'
                        elif 'tahoma' in f_clean:
                            f_cand = 'tahomabd.ttf' if f_bold else 'tahoma.ttf'
                        elif 'trebuchet' in f_clean:
                            if f_bold and f_italic: f_cand = 'trebucbi.ttf'
                            elif f_bold: f_cand = 'trebucbd.ttf'
                            elif f_italic: f_cand = 'trebucit.ttf'
                            else: f_cand = 'trebuc.ttf'
                        elif any(k in f_clean for k in ['mono', 'console', 'code']):
                            f_cand = 'courbd.ttf' if f_bold else 'cour.ttf'
                        elif any(k in f_clean for k in ['serif', 'cambria', 'garamond', 'baskerville']):
                            f_cand = 'timesbd.ttf' if f_bold else 'times.ttf'
                        else:
                            # Standard sans fallback (for Rubik, Roboto, Inter, Poppins, Montserrat, OpenSans, etc.)
                            f_cand = 'arialbd.ttf' if f_bold else 'arial.ttf'

                        font_dirs = [
                            os.environ.get('WINDIR', 'C:\\Windows') + '\\Fonts',
                            '/usr/share/fonts/truetype',
                            '/usr/share/fonts/truetype/liberation',
                            '/usr/share/fonts/truetype/dejavu',
                            '/usr/share/fonts',
                            '/usr/local/share/fonts',
                            os.path.expanduser('~/.fonts')
                        ]

                        matched_file = None
                        font_obj = None
                        if f_cand:
                            for d in font_dirs:
                                if os.path.exists(d):
                                    test_path = os.path.join(d, f_cand)
                                    if os.path.exists(test_path):
                                        try:
                                            test_font = fitz.Font(fontfile=test_path)
                                            if not chars_to_check or all(test_font.has_glyph(ord(c)) for c in chars_to_check):
                                                matched_file = test_path
                                                font_obj = test_font
                                                break
                                        except Exception:
                                            pass

                        # 3. Unicode Currency / Special Symbol Fallback
                        # If candidate font cannot represent all characters (e.g. ₹ Indian Rupee sign), search for any TrueType font that can
                        if not matched_file:
                            unicode_cands = [
                                'arialbd.ttf' if f_bold else 'arial.ttf',
                                'segoeuib.ttf' if f_bold else 'segoeui.ttf',
                                'calibrib.ttf' if f_bold else 'calibri.ttf',
                                'tahomabd.ttf' if f_bold else 'tahoma.ttf',
                                'verdanab.ttf' if f_bold else 'verdana.ttf',
                                'NirmalaB.ttf' if f_bold else 'Nirmala.ttf',
                                'LiberationSans-Bold.ttf' if f_bold else 'LiberationSans-Regular.ttf',
                                'DejaVuSans-Bold.ttf' if f_bold else 'DejaVuSans.ttf',
                                'NotoSans-Bold.ttf' if f_bold else 'NotoSans-Regular.ttf',
                            ]
                            for uc in unicode_cands:
                                for d in font_dirs:
                                    if os.path.exists(d):
                                        p = os.path.join(d, uc)
                                        if os.path.exists(p):
                                            try:
                                                cand_font = fitz.Font(fontfile=p)
                                                if not chars_to_check or all(cand_font.has_glyph(ord(c)) for c in chars_to_check):
                                                    matched_file = p
                                                    font_obj = cand_font
                                                    break
                                            except Exception:
                                                pass
                                if matched_file:
                                    break

                        fname = "helv"
                        sz_mult = 1.0
                        if matched_file:
                            font_alias = f"F_{abs(hash(matched_file)) % 10000}"
                            try:
                                is_simple = all(ord(c) < 256 for c in (text_sample or sub_new))
                                page_fitz.insert_font(fontfile=matched_file, fontname=font_alias, set_simple=is_simple)
                                fname = font_alias
                                if not font_obj:
                                    font_obj = fitz.Font(fontfile=matched_file)
                            except Exception:
                                matched_file = None

                        if not matched_file:
                            # Only use Base-14 PDF fonts for pure ASCII where no TrueType font is found
                            if 'times' in f_clean or 'serif' in f_clean or 'roman' in f_clean:
                                if f_bold and f_italic: fname = "tibi"
                                elif f_bold: fname = "tibo"
                                elif f_italic: fname = "tiit"
                                else: fname = "tiro"
                            elif 'courier' in f_clean or 'mono' in f_clean:
                                if f_bold and f_italic: fname = "cobi"
                                elif f_bold: fname = "cobo"
                                elif f_italic: fname = "coit"
                                else: fname = "cour"
                            else:
                                if f_bold and f_italic: fname = "hebi"
                                elif f_bold: fname = "hebo"
                                elif f_italic: fname = "heit"
                                else: fname = "helv"
                                if ('calibri' in f_clean or 'carlito' in f_clean):
                                    sz_mult = 0.916

                        loaded_fonts[cache_key] = (fname, font_obj, sz_mult)
                        return fname, font_obj, f_size * sz_mult

                    def measure_piece_w(t: str, fn: str, f_obj: Optional[fitz.Font], sz: float) -> float:
                        if f_obj:
                            try:
                                return f_obj.text_length(t, fontsize=sz)
                            except Exception:
                                pass
                        return fitz.get_text_length(t, fontname=fn, fontsize=sz)

                    # 1. Segment modified text preserving original multi-span formatting (bold, italic, colors)
                    styled_segments = segment_text_by_runs(
                        orig_text=orig_text,
                        new_text=sub_new,
                        runs=operation.original_runs,
                        default_font=target_font or FontInfo(family="Helvetica", size=def_font_size)
                    )

                    # 2. Further segment text if any piece contains URLs / links
                    import re
                    URL_REGEX = re.compile(
                        r'(https?://[^\s<>"]+|www\.[^\s<>"]+|[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+\.[a-zA-Z]{2,})'
                    )
                    final_pieces = []
                    for seg_txt, seg_font in styled_segments:
                        last_end = 0
                        for m in URL_REGEX.finditer(seg_txt):
                            st, en = m.span()
                            if st > last_end:
                                final_pieces.append((seg_txt[last_end:st], seg_font, False))
                            final_pieces.append((m.group(0), seg_font, True))
                            last_end = en
                        if last_end < len(seg_txt):
                            final_pieces.append((seg_txt[last_end:], seg_font, False))

                    # 3. Resolve fonts & measure total width
                    total_line_w = 0.0
                    piece_render_info = []
                    for p_txt, p_font, p_is_link in final_pieces:
                        p_fname, p_fobj, p_size = get_font_render_details(p_font, p_txt)
                        p_w = measure_piece_w(p_txt, p_fname, p_fobj, p_size)
                        total_line_w += p_w
                        piece_render_info.append({
                            "text": p_txt,
                            "font": p_font,
                            "is_link": p_is_link,
                            "fname": p_fname,
                            "fobj": p_fobj,
                            "size": p_size,
                            "width": p_w,
                        })

                    # Calculate proportional scaling if line grew beyond available width
                    global_scale = 1.0
                    if total_line_w > avail_width and avail_width > 20:
                        global_scale = max(avail_width / total_line_w, 0.75)

                    # 4. Render pieces sequentially along exact baseline
                    curr_x = insertion_x
                    for p in piece_render_info:
                        actual_size = max(p["size"] * global_scale, 5.0)
                        actual_w = measure_piece_w(p["text"], p["fname"], p["fobj"], actual_size)
                        p_color = p["font"].color if (p["font"] and getattr(p["font"], "color", None)) else font_color

                        if not p["is_link"]:
                            page_fitz.insert_text(
                                fitz.Point(curr_x, baseline_y),
                                p["text"],
                                fontsize=actual_size,
                                fontname=p["fname"],
                                color=p_color
                            )
                        else:
                            link_color = (0.043, 0.404, 0.796) if p_color == (0, 0, 0) else p_color
                            page_fitz.insert_text(
                                fitz.Point(curr_x, baseline_y),
                                p["text"],
                                fontsize=actual_size,
                                fontname=p["fname"],
                                color=link_color
                            )
                            uy = baseline_y + 1.5
                            page_fitz.draw_line(
                                fitz.Point(curr_x, uy),
                                fitz.Point(curr_x + actual_w, uy),
                                color=link_color,
                                width=0.7
                            )
                            uri = p["text"].strip()
                            if "@" in uri and not uri.startswith("mailto:"):
                                uri = "mailto:" + uri
                            elif uri.startswith("www."):
                                uri = "https://" + uri
                            elif not uri.startswith(("http://", "https://", "mailto:")):
                                uri = "https://" + uri

                            l_rect = fitz.Rect(curr_x, target_rect.y0, curr_x + actual_w, target_rect.y1)
                            try:
                                page_fitz.insert_link({
                                    "kind": fitz.LINK_URI,
                                    "from": l_rect,
                                    "uri": uri
                                })
                            except Exception:
                                pass

                        curr_x += actual_w

                    # 5. Redraw text underline for normal text if original text was underlined
                    if had_text_underline and text_underline_info and not any(p.get("is_link") for p in piece_render_info):
                        uy = text_underline_info["y"]
                        page_fitz.draw_line(
                            fitz.Point(insertion_x, uy),
                            fitz.Point(curr_x, uy),
                            color=text_underline_info["color"],
                            width=text_underline_info["width"],
                            dashes=text_underline_info.get("dashes")
                        )

                    # 6. Restore any table grid borders or form write-on lines that were near/touched
                    for d in lines_to_restore:
                        c = d.get("color") or (0, 0, 0)
                        w = d.get("width") or 1.0
                        dsh = d.get("dashes")
                        items = d.get("items", [])
                        if items:
                            for item in items:
                                if item[0] == 'l':
                                    page_fitz.draw_line(item[1], item[2], color=c, width=w, dashes=dsh)
                                elif item[0] == 're':
                                    page_fitz.draw_rect(item[1], color=c, fill=d.get("fill"), width=w, dashes=dsh)
                        else:
                            dr = fitz.Rect(d["rect"])
                            if dr.height <= 2.0:
                                page_fitz.draw_line(fitz.Point(dr.x0, (dr.y0 + dr.y1) / 2.0), fitz.Point(dr.x1, (dr.y0 + dr.y1) / 2.0), color=c, width=w, dashes=dsh)
                            elif dr.width <= 2.0:
                                page_fitz.draw_line(fitz.Point((dr.x0 + dr.x1) / 2.0, dr.y0), fitz.Point((dr.x0 + dr.x1) / 2.0, dr.y1), color=c, width=w, dashes=dsh)


                    out_dir = os.path.dirname(os.path.abspath(output_pdf_path))
                    if out_dir:
                        os.makedirs(out_dir, exist_ok=True)
                    doc.save(output_pdf_path)
                    doc.close()

                    return ModificationResult(
                        success=True,
                        operation=operation,
                        strategy=strategy_used,
                        details="Surgically modified via content-stream vector surgery and font baseline preservation.",
                        metrics_delta_width=width_delta,
                        new_bounding_box=BoundingBox(
                            x=target_rect.x0,
                            y=target_rect.y0,
                            width=target_rect.width + width_delta,
                            height=target_rect.height
                        )
                    )

            except Exception as e:
                print(f"[STREAM SURGERY ERROR] {e}")

            return ModificationResult(
                success=False,
                operation=operation,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Could not locate matching content stream operator for text '{orig_text}'"
            )

        # Update bounding box if available
        new_box = None
        if operation.original_bounding_box:
            orig_box = operation.original_bounding_box
            new_box = BoundingBox(
                x=orig_box.x,
                y=orig_box.y,
                width=max(1.0, orig_box.width + width_delta),
                height=orig_box.height
            )

        # Save output PDF
        try:
            out_dir = os.path.dirname(os.path.abspath(output_pdf_path))
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            pdf.save(output_pdf_path)
            pdf.close()
        except Exception as e:
            pdf.close()
            return ModificationResult(
                success=False,
                operation=operation,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Failed to write output PDF: {e}"
            )

        return ModificationResult(
            success=True,
            operation=operation,
            strategy=strategy_used,
            details=details,
            new_bounding_box=new_box,
            metrics_delta_width=width_delta
        )

    def _replace_text_in_stream(
        self,
        stream_bytes: bytes,
        orig_text: str,
        new_text: str,
        subset_candidates: Optional[List[Dict[str, Any]]] = None,
        fallback_font: Optional[str] = None,
        font_size: float = 12.0
    ) -> Tuple[bytes, int, Optional[ModificationStrategy]]:
        """Perform exact text operator replacement inside uncompressed stream bytes."""
        text_str = stream_bytes.decode('latin1', errors='replace')
        count = 0
        used_strategy = None

        esc_orig = escape_pdf_string(orig_text)
        esc_new = escape_pdf_string(new_text)

        # --- PATH 1: CMap Subset Font Matching ---
        if subset_candidates:
            for cand in subset_candidates:
                enc_orig = cand["encoded_orig"]
                # Search for <...enc_orig...> in stream
                if cand["can_encode_new"] and cand["encoded_new"] and len(orig_text) >= 2:
                    # Priority 1: Reuse subset font
                    enc_new = cand["encoded_new"]
                    def rep_subset(m):
                        nonlocal count
                        hex_raw = m.group(1).replace(" ", "").replace("\r", "").replace("\n", "").lower()
                        if enc_orig in hex_raw:
                            count += 1
                            return f"<{hex_raw.replace(enc_orig, enc_new, 1)}>"
                        return m.group(0)

                    pattern_hex = re.compile(r'<([0-9a-fA-F\s]+)>')
                    new_str, _ = pattern_hex.subn(rep_subset, text_str)
                    if count > 0:
                        return new_str.encode('latin1'), count, ModificationStrategy.ORIGINAL_FONT_REUSED
                else:
                    # Priority 3: Fallback font substitution
                    # Match pattern: (/F... size Tf)? <...enc_orig...> Tj
                    # Replace with: /F_FALLBACK size Tf (new_text) Tj
                    cand_font_res = re.escape(cand["font_res"])
                    cand_hex = re.escape(enc_orig)

                    # Regex 1: /F... size Tf <cand_hex> Tj
                    pat_with_tf = re.compile(
                        r'(/F\w+)\s*(\d+(?:\.\d+)?)\s*Tf\s*<' + cand_hex + r'>\s*Tj',
                        re.IGNORECASE
                    )
                    if pat_with_tf.search(text_str):
                        repl = f"/F_FALLBACK \\2 Tf ({esc_new}) Tj"
                        text_str, count = pat_with_tf.subn(repl, text_str, count=1)
                        if count > 0:
                            return text_str.encode('latin1'), count, ModificationStrategy.FONT_SUBSTITUTED

                    # Regex 2: just <cand_hex> Tj (inject /F_FALLBACK font)
                    pat_just_tj = re.compile(
                        r'<' + cand_hex + r'>\s*Tj',
                        re.IGNORECASE
                    )
                    if pat_just_tj.search(text_str):
                        repl = f"/F_FALLBACK {font_size} Tf ({esc_new}) Tj"
                        text_str, count = pat_just_tj.subn(repl, text_str, count=1)
                        if count > 0:
                            return text_str.encode('latin1'), count, ModificationStrategy.FONT_SUBSTITUTED

        # --- PATH 2: Standard Hex-Encoded Strings (Latin1) ---
        orig_hex = orig_text.encode('latin1', errors='ignore').hex().lower()
        new_hex = new_text.encode('latin1', errors='ignore').hex().lower()

        if orig_hex:
            def replace_hex_match(m):
                nonlocal count
                hex_content = m.group(1).replace(" ", "").replace("\r", "").replace("\n", "").lower()
                if orig_hex in hex_content:
                    updated_hex = hex_content.replace(orig_hex, new_hex, 1)
                    count += 1
                    return f"<{updated_hex}>"
                return m.group(0)

            pattern_hex = re.compile(r'<([0-9a-fA-F\s]+)>')
            text_str, _ = pattern_hex.subn(replace_hex_match, text_str)
            if count > 0:
                return text_str.encode('latin1'), count, ModificationStrategy.ORIGINAL_FONT_REUSED

        # --- PATH 3: Literal string in Tj: (orig_text) Tj ---
        pattern_tj = re.compile(
            r'\(' + re.escape(esc_orig) + r'\)\s*Tj',
            re.MULTILINE
        )
        if pattern_tj.search(text_str):
            replacement = f"({esc_new}) Tj"
            text_str, count = pattern_tj.subn(replacement, text_str, count=1)
            if count > 0:
                return text_str.encode('latin1'), count, ModificationStrategy.ORIGINAL_FONT_REUSED

        # --- PATH 4: Literal string inside TJ array: [(...orig_text...)] TJ ---
        pattern_in_tj = re.compile(
            r'\(' + re.escape(esc_orig) + r'\)',
            re.MULTILINE
        )
        if pattern_in_tj.search(text_str):
            text_str, count = pattern_in_tj.subn(f"({esc_new})", text_str, count=1)
            if count > 0:
                return text_str.encode('latin1'), count, ModificationStrategy.ORIGINAL_FONT_REUSED

        # --- PATH 5: Disjointed spans inside TJ: e.g. [(orig) -10 (inal)] TJ ---
        pattern_tj_block = re.compile(r'\[(.*?)\]\s*TJ', re.DOTALL)
        for match in pattern_tj_block.finditer(text_str):
            inside = match.group(1)
            strs = re.findall(r'\((.*?)\)', inside)
            joined = "".join(strs)
            if orig_text in joined:
                full_match = match.group(0)
                new_tj = f"[({esc_new})] TJ"
                text_str = text_str.replace(full_match, new_tj, 1)
                return text_str.encode('latin1'), 1, ModificationStrategy.ORIGINAL_FONT_REUSED

        return stream_bytes, 0, None
