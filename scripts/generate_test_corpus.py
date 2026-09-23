"""Generates a controlled test corpus of PDFs for Phase 0 feasibility testing."""
import os
import fitz  # PyMuPDF


def create_standard_font_pdf(output_path: str):
    """Generate a clean PDF using standard Base-14 Helvetica and Times fonts."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4

    # Title
    p1 = fitz.Point(72, 100)
    page.insert_text(p1, "PDF Edit Engine Feasibility Document", fontsize=20, fontname="helv", color=(0.1, 0.2, 0.5))

    # Subtitle / Metadata
    p2 = fitz.Point(72, 140)
    page.insert_text(p2, "Project: PDFModifier Core Feasibility", fontsize=12, fontname="helv", color=(0.3, 0.3, 0.3))

    # Target text runs for testing
    p3 = fitz.Point(72, 200)
    page.insert_text(p3, "Lead Engineer: Rishav", fontsize=14, fontname="helv", color=(0.0, 0.0, 0.0))

    p4 = fitz.Point(72, 240)
    page.insert_text(p4, "Department: Computer Science Engineering", fontsize=14, fontname="times-roman", color=(0.0, 0.0, 0.0))

    p5 = fitz.Point(72, 280)
    page.insert_text(p5, "Status: Phase 0 Feasibility in Progress", fontsize=12, fontname="helv", color=(0.2, 0.5, 0.2))

    # Surrounding paragraph
    p6 = fitz.Point(72, 340)
    para = (
        "This document verifies that genuine PDF content streams can be surgically modified "
        "without rasterizing vector layers, corrupting indirect object graphs, or converting "
        "to intermediate Word formats. All surrounding text blocks must remain identical."
    )
    rect = fitz.Rect(72, 320, 520, 420)
    page.insert_textbox(rect, para, fontsize=11, fontname="helv", color=(0.2, 0.2, 0.2))

    # Footer
    p_footer = fitz.Point(72, 800)
    page.insert_text(p_footer, "Page 1 of 1 — Confidential Document", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))

    doc.save(output_path)
    doc.close()
    print(f"Created: {output_path}")


def create_multi_run_layout_pdf(output_path: str):
    """Generate a multi-column and adjacent text run document."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)

    # Header
    page.insert_text(fitz.Point(72, 80), "Financial Performance Summary 2025", fontsize=18, fontname="helv", color=(0.1, 0.1, 0.3))

    # Two column layout
    col1 = fitz.Rect(72, 120, 280, 500)
    col2 = fitz.Rect(300, 120, 520, 500)

    text1 = (
        "Revenue for fiscal year 2025 exceeded all previous records. "
        "Total gross revenue was reported at $12,500,000 across core operations. "
        "The expansion was driven by next-generation platform services."
    )
    text2 = (
        "Operating expenses remained controlled throughout Q4. "
        "Net margin expanded by 4.2% year-over-year. "
        "Capital expenditure for cloud infrastructure was $1,800,000."
    )

    page.insert_textbox(col1, text1, fontsize=11, fontname="times-roman")
    page.insert_textbox(col2, text2, fontsize=11, fontname="times-roman")

    # Table-like adjacent runs
    y = 540
    page.insert_text(fitz.Point(72, y), "Metric", fontsize=11, fontname="helv", color=(0.2, 0.2, 0.2))
    page.insert_text(fitz.Point(250, y), "Target", fontsize=11, fontname="helv", color=(0.2, 0.2, 0.2))
    page.insert_text(fitz.Point(400, y), "Actual", fontsize=11, fontname="helv", color=(0.2, 0.2, 0.2))

    y += 25
    page.insert_text(fitz.Point(72, y), "Annual Growth", fontsize=11, fontname="times-roman")
    page.insert_text(fitz.Point(250, y), "15.0%", fontsize=11, fontname="times-roman")
    page.insert_text(fitz.Point(400, y), "18.5%", fontsize=11, fontname="times-roman")

    doc.save(output_path)
    doc.close()
    print(f"Created: {output_path}")


def main():
    target_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test-pdfs")
    os.makedirs(target_dir, exist_ok=True)

    create_standard_font_pdf(os.path.join(target_dir, "standard_font.pdf"))
    create_multi_run_layout_pdf(os.path.join(target_dir, "multi_run_layout.pdf"))


if __name__ == "__main__":
    main()
