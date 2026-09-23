"""Tests for surgical PDF modification."""
import os
import pytest
from core.modification.engine import PDFModificationEngine
from core.models.operation import ModificationStrategy
from core.validation.validator import PDFValidator


@pytest.fixture
def test_files(tmp_path):
    src = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test-pdfs", "standard_font.pdf")
    dest = os.path.join(tmp_path, "modified.pdf")
    return src, dest


def test_modify_text_replaces_target_successfully(test_files):
    src, dest = test_files
    engine = PDFModificationEngine()

    result = engine.modify_text(
        input_pdf_path=src,
        output_pdf_path=dest,
        search_text="Rishav",
        replacement_text="Rishav Sharma",
        page_number=1
    )

    assert result.success is True
    assert result.strategy == ModificationStrategy.ORIGINAL_FONT_REUSED
    assert os.path.exists(dest)

    # Validate output
    validator = PDFValidator()
    report = validator.validate_modification(
        original_pdf_path=src,
        modified_pdf_path=dest,
        expected_text="Rishav Sharma",
        original_text="Rishav",
        target_page_num=1
    )
    assert report.is_valid is True
    assert report.expected_text_found is True
    assert report.can_open_pymupdf is True
    assert report.can_open_pikepdf is True


def test_modify_preserves_unrelated_content(test_files):
    src, dest = test_files
    engine = PDFModificationEngine()

    engine.modify_text(
        input_pdf_path=src,
        output_pdf_path=dest,
        search_text="Computer Science Engineering",
        replacement_text="Computer Science & Engineering",
        page_number=1
    )

    validator = PDFValidator()
    report = validator.validate_modification(
        original_pdf_path=src,
        modified_pdf_path=dest,
        expected_text="Computer Science & Engineering",
        original_text="Computer Science Engineering",
        target_page_num=1
    )
    assert report.is_valid is True
    assert report.unrelated_text_preserved is True
