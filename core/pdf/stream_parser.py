"""PDF Content Stream Tokenizer and Operator Parser."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import List, Tuple, Any, Optional, Union


@dataclass
class PdfOperator:
    """Represents a single PDF operator with its operands."""
    operator: str
    operands: List[Any] = field(default_factory=list)
    raw_text: str = ""

    def __repr__(self) -> str:
        ops = " ".join(str(op) for op in self.operands)
        return f"{ops} {self.operator}".strip()


@dataclass
class TextBlockInstruction:
    """Represents a BT...ET block with all parsed instructions inside."""
    operators: List[PdfOperator] = field(default_factory=list)
    start_offset: int = 0
    end_offset: int = 0


class ContentStreamTokenizer:
    """Lexer/tokenizer for raw uncompressed PDF page content streams."""

    @staticmethod
    def parse_string_literal(data: bytes, start_idx: int) -> Tuple[bytes, int]:
        """Parse PDF string literal (balanced parentheses and escape sequences)."""
        result = bytearray()
        depth = 1
        idx = start_idx + 1
        length = len(data)
        while idx < length:
            b = data[idx]
            if b == ord(b'\\'):
                idx += 1
                if idx < length:
                    esc = data[idx]
                    if esc == ord(b'n'):
                        result.append(ord(b'\n'))
                    elif esc == ord(b'r'):
                        result.append(ord(b'\r'))
                    elif esc == ord(b't'):
                        result.append(ord(b'\t'))
                    elif esc == ord(b'b'):
                        result.append(ord(b'\b'))
                    elif esc == ord(b'f'):
                        result.append(ord(b'\f'))
                    elif esc == ord(b'('):
                        result.append(ord(b'('))
                    elif esc == ord(b')'):
                        result.append(ord(b')'))
                    elif esc == ord(b'\\'):
                        result.append(ord(b'\\'))
                    elif ord(b'0') <= esc <= ord(b'7'):
                        # Octal escape
                        oct_digits = [esc]
                        for _ in range(2):
                            if idx + 1 < length and ord(b'0') <= data[idx + 1] <= ord(b'7'):
                                idx += 1
                                oct_digits.append(data[idx])
                            else:
                                break
                        val = int(bytes(oct_digits).decode('ascii'), 8)
                        result.append(val)
                    else:
                        result.append(esc)
                idx += 1
                continue
            elif b == ord(b'('):
                depth += 1
                result.append(b)
            elif b == ord(b')'):
                depth -= 1
                if depth == 0:
                    idx += 1
                    break
                result.append(b)
            else:
                result.append(b)
            idx += 1
        return bytes(result), idx

    @staticmethod
    def parse_hex_string(data: bytes, start_idx: int) -> Tuple[bytes, int]:
        """Parse PDF hex string <48656c6c6f>."""
        idx = start_idx + 1
        length = len(data)
        hex_chars = bytearray()
        while idx < length:
            b = data[idx]
            if b == ord(b'>'):
                idx += 1
                break
            if not chr(b).isspace():
                hex_chars.append(b)
            idx += 1
        hex_str = hex_chars.decode('latin1', errors='replace')
        if len(hex_str) % 2 != 0:
            hex_str += '0'
        try:
            return bytes.fromhex(hex_str), idx
        except ValueError:
            return b"", idx

    @classmethod
    def parse_array(cls, data: bytes, start_idx: int) -> Tuple[List[Any], int]:
        """Parse PDF array [...]."""
        items = []
        idx = start_idx + 1
        length = len(data)
        token = bytearray()

        def commit_token():
            nonlocal token
            if token:
                s = token.decode('latin1', errors='replace').strip()
                if s:
                    try:
                        items.append(float(s) if '.' in s else int(s))
                    except ValueError:
                        items.append(s)
                token = bytearray()

        while idx < length:
            b = data[idx]
            if b == ord(b']'):
                commit_token()
                idx += 1
                break
            elif b == ord(b'('):
                commit_token()
                parsed_str, idx = cls.parse_string_literal(data, idx)
                items.append(parsed_str)
                continue
            elif b == ord(b'<'):
                if idx + 1 < length and data[idx + 1] == ord(b'<'):
                    # Nested dictionary (skip for array parsing)
                    idx += 2
                    continue
                commit_token()
                parsed_hex, idx = cls.parse_hex_string(data, idx)
                items.append(parsed_hex)
                continue
            elif chr(b).isspace():
                commit_token()
            else:
                token.append(b)
            idx += 1

        return items, idx

    @classmethod
    def tokenize_stream(cls, stream_bytes: bytes) -> List[PdfOperator]:
        """Tokenize content stream bytes into high-level PDF operators and operands."""
        operators: List[PdfOperator] = []
        operands: List[Any] = []
        idx = 0
        length = len(stream_bytes)
        token = bytearray()

        def commit_simple_token():
            nonlocal token
            if token:
                s = token.decode('latin1', errors='replace').strip()
                if s:
                    # Check if number
                    try:
                        if '.' in s:
                            operands.append(float(s))
                        else:
                            operands.append(int(s))
                    except ValueError:
                        operands.append(s)
                token = bytearray()

        while idx < length:
            b = stream_bytes[idx]

            # Comments
            if b == ord(b'%'):
                commit_simple_token()
                while idx < length and stream_bytes[idx] not in (ord(b'\r'), ord(b'\n')):
                    idx += 1
                continue

            # Strings
            if b == ord(b'('):
                commit_simple_token()
                s_bytes, idx = cls.parse_string_literal(stream_bytes, idx)
                operands.append(s_bytes)
                continue

            # Hex string or Dict
            if b == ord(b'<'):
                commit_simple_token()
                if idx + 1 < length and stream_bytes[idx + 1] == ord(b'<'):
                    # Dictionary start <<
                    operands.append("<<")
                    idx += 2
                    continue
                else:
                    h_bytes, idx = cls.parse_hex_string(stream_bytes, idx)
                    operands.append(h_bytes)
                    continue

            # Dict end >>
            if b == ord(b'>') and idx + 1 < length and stream_bytes[idx + 1] == ord(b'>'):
                commit_simple_token()
                operands.append(">>")
                idx += 2
                continue

            # Array
            if b == ord(b'['):
                commit_simple_token()
                arr, idx = cls.parse_array(stream_bytes, idx)
                operands.append(arr)
                continue

            # Whitespace
            if chr(b).isspace():
                commit_simple_token()
                idx += 1
                continue

            token.append(b)
            idx += 1

            # Check if token is a recognized operator keyword
            s = token.decode('latin1', errors='replace')
            # List of standard text and state operators
            known_ops = {
                "BT", "ET", "Tf", "Tm", "Td", "TD", "T*", "Tj", "TJ", "'", "\"",
                "q", "Q", "cm", "rg", "RG", "g", "G", "k", "K", "cs", "CS", "sc", "SC", "scn", "SCN",
                "w", "J", "j", "M", "d", "ri", "i", "gs", "m", "l", "c", "v", "y", "h", "re",
                "S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n", "W", "W*", "Do", "DP", "MP", "BDC", "EMC"
            }
            if s in known_ops:
                # peek next char to ensure it is whitespace or delimiter
                if idx >= length or chr(stream_bytes[idx]).isspace() or stream_bytes[idx] in b"()<>[]/%":
                    operators.append(PdfOperator(operator=s, operands=list(operands)))
                    operands.clear()
                    token.clear()

        commit_simple_token()
        return operators


def escape_pdf_string(s: str) -> str:
    """Escape text for PDF literal string format (text)."""
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
