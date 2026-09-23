"""Font metrics and rendered text width calculations."""
from typing import Optional
import fitz
from ..models.text_object import FontInfo


class FontMetricsCalculator:
    """Calculates rendered string dimensions based on font family and point size."""

    # Standard approximate character widths for Helvetica/Arial normalized to 1000 units
    DEFAULT_AVG_CHAR_WIDTH_RATIO = 0.52

    @staticmethod
    def get_text_length(
        text: str,
        font_info: FontInfo,
        font_size: Optional[float] = None
    ) -> float:
        """Calculate rendered text width in PDF points using PyMuPDF font metrics."""
        size = font_size or font_info.size
        try:
            # PyMuPDF has built-in standard font measurement
            font = fitz.Font(font_info.family)
            return font.text_length(text, fontsize=size)
        except Exception:
            try:
                font = fitz.Font("helv")
                return font.text_length(text, fontsize=size)
            except Exception:
                # Basic geometric approximation if font object cannot be initialized
                return len(text) * size * FontMetricsCalculator.DEFAULT_AVG_CHAR_WIDTH_RATIO

    @classmethod
    def calculate_width_delta(
        cls,
        original_text: str,
        new_text: str,
        font_info: FontInfo,
        font_size: Optional[float] = None
    ) -> float:
        """Returns new_width - original_width in points."""
        orig_w = cls.get_text_length(original_text, font_info, font_size)
        new_w = cls.get_text_length(new_text, font_info, font_size)
        return new_w - orig_w
