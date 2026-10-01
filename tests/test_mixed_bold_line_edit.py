import os
import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.modification.engine import PDFModificationEngine

def test_mixed_bold_regular_line_preserves_boldness(tmp_path):
    # 1. Create a PDF with a line containing mixed regular and bold text
    pdf_path = str(tmp_path / "mixed_test.pdf")
    out_path = str(tmp_path / "mixed_test_out.pdf")

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)

    # Insert regular prefix
    p1 = fitz.Point(72, 150)
    page.insert_text(p1, "te a ", fontsize=11, fontname="helv")
    w1 = fitz.get_text_length("te a ", fontname="helv", fontsize=11)

    # Insert bold middle
    p2 = fitz.Point(72 + w1, 150)
    page.insert_text(p2, "high-fidelity PDF modifier/editor", fontsize=11, fontname="hebo")
    w2 = fitz.get_text_length("high-fidelity PDF modifier/editor", fontname="hebo", fontsize=11)

    # Insert regular suffix
    p3 = fitz.Point(72 + w1 + w2, 150)
    page.insert_text(p3, " that a", fontsize=11, fontname="helv")

    doc.save(pdf_path)
    doc.close()

    # 2. Analyze page
    analyzer = PDFAnalyzer(pdf_path)
    objects = analyzer.analyze_page(0)
    assert len(objects) >= 1

    # Find the line object
    target_obj = None
    for obj in objects:
        if "high-fidelity" in obj.text:
            target_obj = obj
            break

    assert target_obj is not None
    assert len(target_obj.runs) >= 2
    # Check that runs have distinct weights
    weights = [r.font.weight for r in target_obj.runs]
    assert "bold" in weights
    assert "normal" in weights

    # 3. Apply edit to the bold word: 'modifier/editor' -> 'editor'
    engine = PDFModificationEngine()
    result = engine.modify_text(
        input_pdf_path=pdf_path,
        output_pdf_path=out_path,
        search_text=target_obj.text,
        replacement_text=target_obj.text.replace("modifier/editor", "editor"),
        page_number=1,
        target_text_id=target_obj.id,
        bounding_box=target_obj.bounding_box,
        origin=target_obj.origin,
    )

    assert result.success is True
    assert os.path.exists(out_path)

    # 4. Verify modified PDF: bold text MUST remain bold!
    doc_out = fitz.open(out_path)
    page_out = doc_out[0]
    blocks = page_out.get_text("dict")["blocks"]

    found_bold = False
    found_regular = False

    for b in blocks:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                txt = s.get("text", "")
                font_name = s.get("font", "").lower()
                flags = s.get("flags", 0)
                is_bold = ("bold" in font_name or "hebo" in font_name or bool(flags & 16))
                print(f"SPAN: text={repr(txt)}, font={font_name}, flags={flags}, is_bold={is_bold}")

                norm_txt = txt.replace('\xa0', ' ')
                if "high-fidelity" in norm_txt or "editor" in norm_txt:
                    if is_bold:
                        found_bold = True
                if "that a" in norm_txt or "te a" in norm_txt:
                    if not is_bold:
                        found_regular = True

    doc_out.close()
    assert found_bold is True, "The bold text in the edited line lost its boldness!"
    assert found_regular is True, "The regular text in the edited line became bold!"


def test_mixed_bold_regular_line_when_regular_word_edited(tmp_path):
    # Test editing the regular text in a mixed line
    pdf_path = str(tmp_path / "mixed_test2.pdf")
    out_path = str(tmp_path / "mixed_test2_out.pdf")

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)

    p1 = fitz.Point(72, 150)
    page.insert_text(p1, "te a ", fontsize=11, fontname="helv")
    w1 = fitz.get_text_length("te a ", fontname="helv", fontsize=11)

    p2 = fitz.Point(72 + w1, 150)
    page.insert_text(p2, "high-fidelity PDF modifier/editor", fontsize=11, fontname="hebo")
    w2 = fitz.get_text_length("high-fidelity PDF modifier/editor", fontname="hebo", fontsize=11)

    p3 = fitz.Point(72 + w1 + w2, 150)
    page.insert_text(p3, " that a", fontsize=11, fontname="helv")

    doc.save(pdf_path)
    doc.close()

    analyzer = PDFAnalyzer(pdf_path)
    objects = analyzer.analyze_page(0)
    target_obj = next(obj for obj in objects if "high-fidelity" in obj.text)

    # Edit the regular word 'te a' -> 'Write a'
    engine = PDFModificationEngine()
    result = engine.modify_text(
        input_pdf_path=pdf_path,
        output_pdf_path=out_path,
        search_text=target_obj.text,
        replacement_text=target_obj.text.replace("te a", "Write a"),
        page_number=1,
        target_text_id=target_obj.id,
        bounding_box=target_obj.bounding_box,
        origin=target_obj.origin,
    )

    assert result.success is True

    doc_out = fitz.open(out_path)
    page_out = doc_out[0]
    blocks = page_out.get_text("dict")["blocks"]

    found_bold = False
    found_regular = False

    for b in blocks:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                txt = s.get("text", "")
                font_name = s.get("font", "").lower()
                flags = s.get("flags", 0)
                is_bold = ("bold" in font_name or "hebo" in font_name or bool(flags & 16))
                print(f"TEST2 SPAN: text={repr(txt)}, font={font_name}, flags={flags}, is_bold={is_bold}")

                norm_txt = txt.replace('\xa0', ' ').replace('\xad', '-')
                if "high-fidelity" in norm_txt:
                    if is_bold:
                        found_bold = True
                if "Write a" in norm_txt or "that a" in norm_txt:
                    if not is_bold:
                        found_regular = True

    doc_out.close()
    assert found_bold is True, "Bold text lost its boldness when normal text was edited!"
    assert found_regular is True, "Regular text became bold!"
