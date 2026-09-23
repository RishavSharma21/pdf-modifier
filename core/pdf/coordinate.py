"""Coordinate transformation system between PDF points and viewport coordinates."""
from typing import Tuple
from ..models.text_object import BoundingBox


class CoordinateTransformer:
    """Handles bidirectional transformations between PDF points and viewport/screen space.
    
    Standard PDF coordinate system:
      - Origin (0,0) at bottom-left of MediaBox/CropBox
      - Measured in points (1 point = 1/72 inch)
      - Y increases upward

    Viewport / Screen coordinate system:
      - Origin (0,0) at top-left
      - Measured in CSS pixels
      - Y increases downward
    """

    def __init__(self, page_width: float, page_height: float, rotation: int = 0):
        self.page_width = float(page_width)
        self.page_height = float(page_height)
        self.rotation = int(rotation) % 360

    def pdf_to_viewport(
        self, pdf_x: float, pdf_y: float, scale: float = 1.0
    ) -> Tuple[float, float]:
        """Convert PDF point (x, y) to viewport pixel (vx, vy)."""
        # Flip Y from bottom-left to top-left
        vx = pdf_x * scale
        vy = (self.page_height - pdf_y) * scale

        if self.rotation == 90:
            vx, vy = vy, (self.page_width * scale) - vx
        elif self.rotation == 180:
            vx = (self.page_width * scale) - vx
            vy = (self.page_height * scale) - vy
        elif self.rotation == 270:
            vx = (self.page_height * scale) - vy
            vy = vx

        return vx, vy

    def viewport_to_pdf(
        self, vx: float, vy: float, scale: float = 1.0
    ) -> Tuple[float, float]:
        """Convert viewport pixel (vx, vy) to PDF point (x, y)."""
        px = vx / scale
        py = vy / scale

        if self.rotation == 0:
            pdf_x = px
            pdf_y = self.page_height - py
        elif self.rotation == 90:
            pdf_x = self.page_width - (py / scale)
            pdf_y = px / scale
        elif self.rotation == 180:
            pdf_x = self.page_width - px
            pdf_y = py
        elif self.rotation == 270:
            pdf_x = py
            pdf_y = self.page_height - (self.page_height - px)
        else:
            pdf_x = px
            pdf_y = self.page_height - py

        return pdf_x, pdf_y

    def pdf_box_to_viewport(
        self, box: BoundingBox, scale: float = 1.0
    ) -> BoundingBox:
        """Convert PDF BoundingBox to top-left-based Viewport BoundingBox."""
        vx, vy = self.pdf_to_viewport(box.x, box.y + box.height, scale=scale)
        vw = box.width * scale
        vh = box.height * scale
        return BoundingBox(x=vx, y=vy, width=vw, height=vh)
