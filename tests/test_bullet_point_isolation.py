import os
import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.modification.engine import PDFModificationEngine

def test_bullet_point_and_bold_label_isolation(tmp_path):
    """Verify that bullet point dots are isolated and bold labels are separated from regular text."""
    pdf_path = str(tmp_path / "resume_bullet_test.pdf")
    out_path = str(tmp_path / "resume_bullet_out.pdf")

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)

    # Insert bullet dot
    p0 = fitz.Point(72, 100)
    page.insert_text(p0, "• ", fontsize=10, fontname="helv")
    w0 = fitz.get_text_length("• ", fontname="helv", fontsize=10)

    # Insert bold label: "Languages: "
    p1 = fitz.Point(72 + w0, 100)
    page.insert_text(p1, "Languages: ", fontsize=10, fontname="hebo")
    w1 = fitz.get_text_length("Languages: ", fontname="hebo", fontsize=10)

    # Insert regular skills: "Java, JavaScript, TypeScript, C++, Python, SQL"
    p2 = fitz.Point(72 + w0 + w1, 100)
    page.insert_text(p2, "Java, JavaScript, TypeScript, C++, Python, SQL", fontsize=10, fontname="helv")

    doc.save(pdf_path)
    doc.close()

    # 1. Analyze page
    analyzer = PDFAnalyzer(pdf_path)
    objects = analyzer.analyze_page(0)

    # Should have 3 separate objects on this line:
    # 1: Bullet dot "•"
    # 2: Bold label "Languages:"
    # 3: Regular text "Java, JavaScript, TypeScript, C++, Python, SQL"
    assert len(objects) == 3

    bullet_obj = objects[0]
    label_obj = objects[1]
    skills_obj = objects[2]

    assert bullet_obj.text.strip() in ("•", "\xb7", "\u2022")
    assert "Languages:" in label_obj.text
    assert label_obj.font.weight == "bold"

    assert "Java, JavaScript" in skills_obj.text
    assert skills_obj.font.weight == "normal"

    # 2. Modify ONLY the skills (regular text): "SQL" -> "PostgreSQL"
    engine = PDFModificationEngine()
    result = engine.modify_text(
        input_pdf_path=pdf_path,
        output_pdf_path=out_path,
        search_text=skills_obj.text,
        replacement_text=skills_obj.text.replace("SQL", "PostgreSQL"),
        page_number=1,
        target_text_id=skills_obj.id,
        bounding_box=skills_obj.bounding_box,
        origin=skills_obj.origin,
    )

    assert result.success is True

    # 3. Verify in output PDF:
    # - Bullet dot is intact
    # - "Languages:" is still BOLD
    # - "Java... PostgreSQL" is REGULAR (NEVER bold!)
    doc_out = fitz.open(out_path)
    page_out = doc_out[0]
    blocks = page_out.get_text("dict")["blocks"]

    found_bullet = False
    found_label_bold = False
    found_skills_regular = False

    for b in blocks:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                t = s.get("text", "")
                font = s.get("font", "").lower()
                flags = s.get("flags", 0)
                is_bold = "bold" in font or "hebo" in font or bool(flags & 16)

                if "•" in t or "\xb7" in t or "\u2022" in t:
                    found_bullet = True
                if "Languages" in t and is_bold:
                    found_label_bold = True
                if "PostgreSQL" in t and not is_bold:
                    found_skills_regular = True

    doc_out.close()

    assert found_bullet is True, "Bullet dot was lost!"
    assert found_label_bold is True, "Label lost its bold styling!"
    assert found_skills_regular is True, "Skills incorrectly became bold instead of regular!"
