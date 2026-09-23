"""Tests for validation and visual regression testing."""
import os
import pytest
from core.validation.visual_diff import VisualRegressionTester


@pytest.fixture
def pdf_paths():
    base = os.path.dirname(os.path.dirname(__file__))
    orig = os.path.join(base, "test-pdfs", "standard_font.pdf")
    mod = os.path.join(base, "experiments", "modified_standard.pdf")
    return orig, mod


def test_visual_regression_diff(pdf_paths, tmp_path):
    orig, mod = pdf_paths
    if not os.path.exists(mod):
        pytest.skip("Modified PDF experiment not yet generated")

    tester = VisualRegressionTester(dpi=72)
    diff_res = tester.compare_pages(
        original_pdf=orig,
        modified_pdf=mod,
        page_index=0,
        output_diff_dir=str(tmp_path),
        prefix="test_diff"
    )

    assert diff_res.total_pixels > 0
    # Modifying one text run should only alter a very small fraction (< 1%) of the page pixels
    assert diff_res.diff_percentage < 1.0
    assert os.path.exists(diff_res.diff_image_path)
