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

        # Attempt replacement across content streams
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

        if not modified_stream:
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
            pdf.close()
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
                if cand["can_encode_new"] and cand["encoded_new"]:
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
