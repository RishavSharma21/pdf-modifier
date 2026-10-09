import os
import fitz
from core.modification.engine import PDFModificationEngine
from core.models.text_object import BoundingBox

def test_bold_request_does_not_reuse_non_bold_embedded_font(tmp_path):
    # Create a PDF with regular (non-bold) text
    input_pdf = str(tmp_path / "test_regular.pdf")
    output_pdf = str(tmp_path / "test_bold_out.pdf")

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    # Insert regular Helvetica text
    page.insert_text(fitz.Point(72, 100), "Hello World", fontsize=14, fontname="helv")
    doc.save(input_pdf)
    doc.close()

    engine = PDFModificationEngine()
    result = engine.modify_text(
        input_pdf_path=input_pdf,
        output_pdf_path=output_pdf,
        search_text="Hello World",
        replacement_text="Hello Bold World",
        page_number=1,
        font_weight="bold"
    )

    assert result.success is True

    # Inspect the output PDF fonts
    out_doc = fitz.open(output_pdf)
    out_page = out_doc[0]
    fonts = out_page.get_fonts()
    out_doc.close()

    # Verify that a bold font was used (e.g. F_... containing bold TrueType or hebo)
    font_names = [f[3].lower() for f in fonts if f[3]]
    # Must contain a bold indicator (arialbd, bold, or hebo)
    assert any("bold" in fn or "hebo" in fn or "bd" in fn for fn in font_names)
