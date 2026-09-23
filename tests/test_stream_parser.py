"""Tests for ContentStreamTokenizer and operator parsing."""
import pytest
from core.pdf.stream_parser import ContentStreamTokenizer, escape_pdf_string


def test_escape_pdf_string():
    assert escape_pdf_string("Hello World") == "Hello World"
    assert escape_pdf_string("Hello (World)") == "Hello \\(World\\)"
    assert escape_pdf_string("Line\\Break") == "Line\\\\Break"


def test_tokenize_basic_text_operators():
    stream = b"""
    BT
    /F1 12 Tf
    1 0 0 1 72 700 Tm
    (Hello World) Tj
    ET
    """
    ops = ContentStreamTokenizer.tokenize_stream(stream)
    op_names = [op.operator for op in ops]
    assert "BT" in op_names
    assert "Tf" in op_names
    assert "Tm" in op_names
    assert "Tj" in op_names
    assert "ET" in op_names


def test_tokenize_hex_and_array_operators():
    stream = b"BT /helv 14 Tf [<4c656164>]TJ ET"
    ops = ContentStreamTokenizer.tokenize_stream(stream)
    assert len(ops) >= 4
    tj_op = [op for op in ops if op.operator == "TJ"][0]
    assert len(tj_op.operands) == 1
    assert b"Lead" in tj_op.operands[0]
