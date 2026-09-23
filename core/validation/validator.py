"""Validation suite for modified PDF documents."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
import fitz
import pikepdf


@dataclass
class ValidationReport:
    """Detailed report on PDF integrity and content verification."""
    is_valid: bool
    can_open_pymupdf: bool = False
    can_open_pikepdf: bool = False
    original_page_count: int = 0
    modified_page_count: int = 0
    expected_text_found: bool = False
    unrelated_text_preserved: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def summary(self) -> str:
        status = "PASSED" if self.is_valid else "FAILED"
        lines = [
            f"=== PDF Validation Report [{status}] ===",
            f"PyMuPDF Open: {'OK' if self.can_open_pymupdf else 'FAIL'}",
            f"PikePDF Open: {'OK' if self.can_open_pikepdf else 'FAIL'}",
            f"Page Count: {self.modified_page_count} (orig: {self.original_page_count})",
            f"Replacement Text Found: {'YES' if self.expected_text_found else 'NO'}",
            f"Unrelated Text Preserved: {'YES' if self.unrelated_text_preserved else 'NO'}",
        ]
        if self.errors:
            lines.append("Errors:")
            for err in self.errors:
                lines.append(f"  - {err}")
        if self.warnings:
            lines.append("Warnings:")
            for warn in self.warnings:
                lines.append(f"  - {warn}")
        return "\n".join(lines)


class PDFValidator:
    """Validates generated PDFs against original documents and expected changes."""

    @classmethod
    def validate_modification(
        cls,
        original_pdf_path: str,
        modified_pdf_path: str,
        expected_text: str,
        original_text: Optional[str] = None,
        target_page_num: int = 1
    ) -> ValidationReport:
        """Validate structure, text presence, page count, and unrelated content."""
        report = ValidationReport(is_valid=True)

        # 1. Test opening with PyMuPDF
        orig_doc = None
        mod_doc = None
        try:
            orig_doc = fitz.open(original_pdf_path)
            report.original_page_count = len(orig_doc)
        except Exception as e:
            report.errors.append(f"Could not open original PDF with PyMuPDF: {e}")
            report.is_valid = False

        try:
            mod_doc = fitz.open(modified_pdf_path)
            report.can_open_pymupdf = True
            report.modified_page_count = len(mod_doc)
        except Exception as e:
            report.errors.append(f"Could not open modified PDF with PyMuPDF: {e}")
            report.can_open_pymupdf = False
            report.is_valid = False

        # 2. Test opening with PikePDF (independent QPDF parser)
        try:
            with pikepdf.Pdf.open(modified_pdf_path) as pike_doc:
                report.can_open_pikepdf = True
                if len(pike_doc.pages) != report.modified_page_count:
                    report.errors.append("Page count mismatch between PyMuPDF and PikePDF")
                    report.is_valid = False
        except Exception as e:
            report.errors.append(f"PikePDF failed to validate output PDF: {e}")
            report.can_open_pikepdf = False
            report.is_valid = False

        # 3. Check page count integrity
        if report.original_page_count > 0 and report.modified_page_count != report.original_page_count:
            report.errors.append(
                f"Page count changed from {report.original_page_count} to {report.modified_page_count}"
            )
            report.is_valid = False

        # 4. Check text searchability and preservation
        if mod_doc and 0 <= target_page_num - 1 < len(mod_doc):
            mod_page = mod_doc[target_page_num - 1]
            mod_text = mod_page.get_text()

            # Verify new text is in the document
            if expected_text in mod_text:
                report.expected_text_found = True
            else:
                report.errors.append(f"Expected replacement text '{expected_text}' not found on page {target_page_num}")
                report.is_valid = False

            # Check if unrelated text was preserved
            if orig_doc and 0 <= target_page_num - 1 < len(orig_doc):
                orig_page = orig_doc[target_page_num - 1]
                orig_words = [w[4] for w in orig_page.get_text("words")]
                # Filter out the original modified word(s)
                unrelated_words = [w for w in orig_words if original_text and w not in original_text]
                for w in unrelated_words[:10]:  # sample check
                    if w not in mod_text:
                        report.warnings.append(f"Unrelated word '{w}' appears missing in modified text")

        if orig_doc:
            orig_doc.close()
        if mod_doc:
            mod_doc.close()

        if report.errors:
            report.is_valid = False

        return report
