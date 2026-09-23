"""Visual Regression Testing Suite for comparing PDF pages before and after modification."""
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Optional, Tuple
import fitz
from PIL import Image, ImageChops, ImageDraw


@dataclass
class VisualDiffResult:
    """Result of visual comparison between two rendered PDF pages."""
    match: bool
    diff_pixels: int
    total_pixels: int
    diff_percentage: float
    original_image_path: Optional[str] = None
    modified_image_path: Optional[str] = None
    diff_image_path: Optional[str] = None

    def summary(self) -> str:
        return (
            f"Visual Diff: {'IDENTICAL' if self.match else 'CHANGED'} "
            f"({self.diff_pixels}/{self.total_pixels} pixels, {self.diff_percentage:.2f}%)"
        )


class VisualRegressionTester:
    """Renders PDF pages and computes pixel-level diffs."""

    def __init__(self, dpi: int = 150):
        self.dpi = dpi
        self.zoom = dpi / 72.0

    def render_page(self, pdf_path: str, page_index: int = 0) -> Image.Image:
        """Render a single PDF page to a PIL Image."""
        doc = fitz.open(pdf_path)
        page = doc[page_index]
        mat = fitz.Matrix(self.zoom, self.zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()
        return img

    def compare_pages(
        self,
        original_pdf: str,
        modified_pdf: str,
        page_index: int = 0,
        output_diff_dir: Optional[str] = None,
        prefix: str = "diff"
    ) -> VisualDiffResult:
        """Compare rendered pages from two PDFs and save visual artifacts."""
        orig_img = self.render_page(original_pdf, page_index)
        mod_img = self.render_page(modified_pdf, page_index)

        # Ensure same size
        if orig_img.size != mod_img.size:
            mod_img = mod_img.resize(orig_img.size, Image.Resampling.NEAREST)

        # Compute difference
        diff = ImageChops.difference(orig_img, mod_img)
        bbox = diff.getbbox()

        total_pixels = orig_img.width * orig_img.height
        diff_pixels = 0

        # Create a highlighted diff visualization (original darkened + changes highlighted in bright magenta/red)
        vis_diff = orig_img.convert("RGBA")
        vis_draw = ImageDraw.Draw(vis_diff)

        # Count changed pixels
        diff_gray = diff.convert("L")
        threshold = 10
        point_table = [0 if i < threshold else 255 for i in range(256)]
        mask = diff_gray.point(point_table)

        # Count non-zero in mask
        mask_bytes = mask.tobytes()
        diff_pixels = sum(1 for b in mask_bytes if b > 0)
        diff_pct = (diff_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0

        orig_path = None
        mod_path = None
        diff_path = None

        if output_diff_dir:
            os.makedirs(output_diff_dir, exist_ok=True)
            orig_path = os.path.join(output_diff_dir, f"{prefix}_orig.png")
            mod_path = os.path.join(output_diff_dir, f"{prefix}_modified.png")
            diff_path = os.path.join(output_diff_dir, f"{prefix}_diff.png")

            orig_img.save(orig_path)
            mod_img.save(mod_path)

            # Highlight changed pixels in diff image
            highlight = Image.new("RGBA", orig_img.size, (255, 0, 100, 160))
            vis_diff.paste(highlight, (0, 0), mask=mask)
            vis_diff.save(diff_path)

        return VisualDiffResult(
            match=(diff_pixels == 0),
            diff_pixels=diff_pixels,
            total_pixels=total_pixels,
            diff_percentage=diff_pct,
            original_image_path=orig_path,
            modified_image_path=mod_path,
            diff_image_path=diff_path,
        )
