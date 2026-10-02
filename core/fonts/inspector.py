"""Font Inspector for analyzing embedded fonts, subsets, and glyph availability."""
from __future__ import annotations
import io
import re
from typing import Dict, Any, Optional, Set, Tuple
import fitz  # PyMuPDF
import pikepdf
from fontTools.ttLib import TTFont
from ..models.text_object import FontInfo


class FontInspector:
    """Analyzes fonts present in a PDF document and extracts glyph coverage."""

    def __init__(self, doc_path: str):
        self.doc_path = doc_path
        self._font_cache: Dict[str, FontInfo] = {}

    @staticmethod
    def is_subset_name(font_name: str) -> bool:
        """PDF subset fonts start with 6 uppercase letters followed by a '+'."""
        return bool(re.match(r'^[A-Z]{6}\+', font_name))

    @staticmethod
    def clean_font_name(font_name: str) -> str:
        """Strip subset tag if present (e.g., 'ABCDEF+Calibri' -> 'Calibri')."""
        if '+' in font_name:
            return font_name.split('+', 1)[1]
        return font_name

    @staticmethod
    def parse_tounicode_cmap(cmap_bytes: bytes) -> Tuple[Dict[str, str], Dict[str, str]]:
        """Parse ToUnicode CMap stream into (char_to_code, code_to_char)."""
        char_to_code: Dict[str, str] = {}
        code_to_char: Dict[str, str] = {}
        text = cmap_bytes.decode('latin1', errors='replace')

        # 1. Parse beginbfchar ... endbfchar blocks
        for block in re.finditer(r'beginbfchar\s*(.*?)\s*endbfchar', text, re.DOTALL):
            for m in re.finditer(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block.group(1)):
                code_hex = m.group(1).lower()
                uni_hex = m.group(2)
                try:
                    char = chr(int(uni_hex, 16))
                    char_to_code[char] = code_hex
                    code_to_char[code_hex] = char
                except (ValueError, OverflowError):
                    pass

        # 2. Parse beginbfrange ... endbfrange blocks
        for block in re.finditer(r'beginbfrange\s*(.*?)\s*endbfrange', text, re.DOTALL):
            for m in re.finditer(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block.group(1)):
                start_hex = m.group(1)
                end_hex = m.group(2)
                dst_hex = m.group(3)
                try:
                    start_code = int(start_hex, 16)
                    end_code = int(end_hex, 16)
                    dst_val = int(dst_hex, 16)
                    width = len(start_hex)
                    for offset, c in enumerate(range(start_code, end_code + 1)):
                        c_hex = f"{c:0{width}x}".lower()
                        ch = chr(dst_val + offset)
                        char_to_code[ch] = c_hex
                        code_to_char[c_hex] = ch
                except (ValueError, OverflowError):
                    pass

        return char_to_code, code_to_char

    def inspect_page_fonts(self, page_index: int) -> Dict[str, FontInfo]:
        """Inspect all fonts registered on a given page."""
        doc = fitz.open(self.doc_path)
        page = doc[page_index]
        font_list = page.get_fonts(full=True)

        fonts_by_res: Dict[str, FontInfo] = {}

        # Also extract ToUnicode CMaps via pikepdf if available
        cmaps_by_res: Dict[str, Tuple[Dict[str, str], Dict[str, str]]] = {}
        try:
            with pikepdf.Pdf.open(self.doc_path) as pike_doc:
                if 0 <= page_index < len(pike_doc.pages):
                    p = pike_doc.pages[page_index]
                    res = p.get("/Resources")
                    if res and "/Font" in res:
                        for font_key, font_dict in res["/Font"].items():
                            f_res_name = str(font_key).lstrip('/')
                            to_uni = font_dict.get("/ToUnicode")
                            if to_uni is not None:
                                try:
                                    raw_cmap = to_uni.read_bytes()
                                    cmaps_by_res[f_res_name] = self.parse_tounicode_cmap(raw_cmap)
                                except Exception:
                                    pass
        except Exception:
            pass

        for item in font_list:
            xref = item[0]
            ext = item[1]
            f_type = item[2]
            base_font = item[3]
            res_name = item[4]
            encoding = item[5]

            is_subset = self.is_subset_name(base_font)
            family = self.clean_font_name(base_font)
            is_embedded = (xref > 0)
            is_cid = ("Identity" in str(encoding)) or ("Type0" in f_type) or ("CID" in f_type)

            _bn_lower = base_font.lower()
            _bn_clean = _bn_lower.split('+')[-1]  # strip subset prefix like ABCDEF+
            weight = (
                "bold" if any(k in _bn_clean for k in ['bold', 'heavy', 'black', 'semibold', 'demi', 'cmbx', 'w6', 'w7', 'w8', 'w9'])
                or any(_bn_clean.endswith(k) for k in ['-bd', '-b', '-bold'])
                else "normal"
            )
            style = "italic" if ("italic" in _bn_lower or "oblique" in _bn_lower) else "normal"

            c2code, code2c = cmaps_by_res.get(res_name, ({}, {}))

            font_info = FontInfo(
                family=family,
                size=12.0,  # default, will be overridden per text run
                weight=weight,
                style=style,
                embedded=is_embedded,
                subsetted=is_subset,
                resource_name=res_name,
                encoding=encoding,
                is_cid=is_cid,
                base_font=base_font,
                char_to_code=c2code,
                code_to_char=code2c,
            )
            fonts_by_res[res_name] = font_info
            if base_font:
                fonts_by_res[base_font] = font_info
            if family:
                fonts_by_res[family] = font_info

        doc.close()
        return fonts_by_res

    def check_glyph_availability(
        self, font_info: FontInfo, text: str, page_index: int = 0
    ) -> Tuple[bool, Set[str]]:
        """Verify whether the font can represent every character in `text`."""
        # 1. If we have a ToUnicode CMap for this subset font, check directly
        if font_info.char_to_code:
            missing = {ch for ch in text if ch not in font_info.char_to_code}
            return len(missing) == 0, missing

        # 2. Standard Base-14 fonts
        standard_fonts = {
            "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
            "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
            "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
            "Symbol", "ZapfDingbats"
        }
        clean_name = self.clean_font_name(font_info.base_font or font_info.family)
        if clean_name in standard_fonts and not font_info.embedded:
            missing = set()
            for ch in text:
                try:
                    ch.encode('latin1')
                except UnicodeEncodeError:
                    missing.add(ch)
            return len(missing) == 0, missing

        return True, set()
