"""Controlled Font Fallback and Matching System."""
from typing import Dict, Tuple
from ..models.text_object import FontInfo


class FontFallbackMatcher:
    """Matches fonts to standard compatible replacements when glyphs are unavailable."""

    # Standard 14 PDF fonts mapping
    STANDARD_MAPPINGS: Dict[str, str] = {
        # Sans-serif
        "arial": "Helvetica",
        "helvetica": "Helvetica",
        "calibri": "Helvetica",
        "verdana": "Helvetica",
        "tahoma": "Helvetica",
        "trebuchet": "Helvetica",
        "sans": "Helvetica",
        # Serif
        "times": "Times-Roman",
        "times new roman": "Times-Roman",
        "georgia": "Times-Roman",
        "garamond": "Times-Roman",
        "serif": "Times-Roman",
        # Monospace
        "courier": "Courier",
        "courier new": "Courier",
        "consolas": "Courier",
        "monaco": "Courier",
        "mono": "Courier",
    }

    @classmethod
    def match_fallback_font(cls, original_font: FontInfo) -> FontInfo:
        """Find a clean standard fallback font preserving weight and style."""
        family_clean = original_font.family.lower()
        matched_base = "Helvetica"

        for key, candidate in cls.STANDARD_MAPPINGS.items():
            if key in family_clean:
                matched_base = candidate
                break

        is_bold = original_font.weight == "bold" or "bold" in original_font.family.lower()
        is_italic = original_font.style == "italic" or "italic" in original_font.family.lower()

        if matched_base == "Helvetica":
            if is_bold and is_italic:
                target_font = "Helvetica-BoldOblique"
            elif is_bold:
                target_font = "Helvetica-Bold"
            elif is_italic:
                target_font = "Helvetica-Oblique"
            else:
                target_font = "Helvetica"
        elif matched_base == "Times-Roman":
            if is_bold and is_italic:
                target_font = "Times-BoldItalic"
            elif is_bold:
                target_font = "Times-Bold"
            elif is_italic:
                target_font = "Times-Italic"
            else:
                target_font = "Times-Roman"
        elif matched_base == "Courier":
            if is_bold and is_italic:
                target_font = "Courier-BoldOblique"
            elif is_bold:
                target_font = "Courier-Bold"
            elif is_italic:
                target_font = "Courier-Oblique"
            else:
                target_font = "Courier"
        else:
            target_font = "Helvetica"

        return FontInfo(
            family=target_font,
            size=original_font.size,
            weight="bold" if is_bold else "normal",
            style="italic" if is_italic else "normal",
            color=original_font.color,
            embedded=False,
            subsetted=False,
            resource_name=None,
            encoding="WinAnsiEncoding",
            is_cid=False,
            base_font=target_font,
        )
