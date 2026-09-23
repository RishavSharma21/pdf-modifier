"""Tests for PDFAnalyzer and font inspection."""
import os
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.fonts.inspector import FontInspector


@pytest.fixture(scope="module")
def standard_pdf_path():
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test-pdfs", "standard_font.pdf")
    assert os.path.exists(path), f"Test PDF does not exist at {path}"
    return path


def test_analyze_page_finds_text_objects(standard_pdf_path):
    analyzer = PDFAnalyzer(standard_pdf_path)
    objects = analyzer.analyze_page(0)
    assert len(objects) > 0

    all_text = " ".join(obj.text for obj in objects)
    assert "PDF Edit Engine Feasibility Document" in all_text
    assert "Rishav" in all_text
    assert "Computer Science Engineering" in all_text


def test_bounding_box_and_font_extraction(standard_pdf_path):
    analyzer = PDFAnalyzer(standard_pdf_path)
    objects = analyzer.analyze_page(0)

    rishav_obj = [o for o in objects if "Rishav" in o.text][0]
    assert rishav_obj.bounding_box.width > 0
    assert rishav_obj.bounding_box.height > 0
    assert rishav_obj.font.size == 14.0
    assert rishav_obj.font.family.lower() == "helvetica"


def test_font_inspector(standard_pdf_path):
    inspector = FontInspector(standard_pdf_path)
    fonts = inspector.inspect_page_fonts(0)
    assert len(fonts) > 0
    font_names = [f.family.lower() for f in fonts.values()]
    assert any("helvetica" in fn for fn in font_names)
