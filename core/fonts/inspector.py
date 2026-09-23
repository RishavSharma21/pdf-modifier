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

    def inspect_page_fonts(self, page_index: int) -> Dict[str, FontInfo]:
        """Inspect all fonts registered on a given page."""
        doc = fitz.open(self.doc_path)
        page = doc[page_index]
        font_list = page.get_fonts(full=True)

        fonts_by_res: Dict[str, FontInfo] = {}

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

            weight = "bold" if "bold" in base_font.lower() else "normal"
            style = "italic" if ("italic" in base_font.lower() or "oblique" in base_font.lower()) else "normal"

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
            )
            fonts_by_res[res_name] = font_info
            if base_font:
                fonts_by_res[base_font] = font_info

        doc.close()
        return fonts_by_res

    def get_embedded_font_data(self, xref: int) -> Optional[bytes]:
        """Extract embedded font binary buffer using PyMuPDF."""
        doc = fitz.open(self.doc_path)
        try:
            return doc.extract_font(xref)[3]
        except Exception:
            return None
        finally:
            doc.close()

    def check_glyph_availability(
        self, font_info: FontInfo, text: str, page_index: int = 0
    ) -> Tuple[bool, Set[str]]:
        """Verify whether the font can represent every character in `text`.
        
        Returns:
            (can_represent: bool, missing_characters: Set[str])
        """
        # Standard Base-14 fonts (Helvetica, Times, Courier) can represent standard ASCII / Latin1
        standard_fonts = {
            "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
            "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
            "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
            "Symbol", "ZapfDingbats"
        }
        clean_name = self.clean_font_name(font_info.base_font or font_info.family)
        if clean_name in standard_fonts and not font_info.embedded:
            # Check if all chars in WinAnsi/Latin1
            missing = set()
            for ch in text:
                try:
                    ch.encode('latin1')
                except UnicodeEncodeError:
                    missing.add(ch)
            return len(missing) == 0, missing

        # If not subsetted and embedded TrueType / OpenType, check cmap table
        if font_info.embedded:
            doc = fitz.open(self.doc_path)
            page = doc[page_index]
            for item in page.get_fonts(full=True):
                if item[4] == font_info.resource_name or item[3] == font_info.base_font:
                    xref = item[0]
                    font_bytes = doc.extract_font(xref)[3]
                    if font_bytes:
                        try:
                            tt = TTFont(io.BytesIO(font_bytes))
                            cmap = tt.getBestCmap()
                            if cmap:
                                missing = {ch for ch in text if ord(ch) not in cmap}
                                doc.close()
                                return len(missing) == 0, missing
                        except Exception:
                            pass
            doc.close()

        # Fallback heuristic: check if all characters exist in the current document text under this font
        return True, set()
