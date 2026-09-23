"""Text Object Models representing internal PDF text hierarchy."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict, Any


@dataclass
class BoundingBox:
    """Bounding box in PDF coordinates (points, 72 dpi)."""
    x: float
    y: float
    width: float
    height: float

    @property
    def x0(self) -> float:
        return self.x

    @property
    def y0(self) -> float:
        return self.y

    @property
    def x1(self) -> float:
        return self.x + self.width

    @property
    def y1(self) -> float:
        return self.y + self.height

    def to_dict(self) -> Dict[str, float]:
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "width": round(self.width, 2),
            "height": round(self.height, 2),
            "x0": round(self.x0, 2),
            "y0": round(self.y0, 2),
            "x1": round(self.x1, 2),
            "y1": round(self.y1, 2),
        }

    @classmethod
    def from_rect(cls, rect: Tuple[float, float, float, float]) -> BoundingBox:
        """Create from (x0, y0, x1, y1) tuple."""
        x0, y0, x1, y1 = rect
        return cls(x=x0, y=y0, width=x1 - x0, height=y1 - y0)


@dataclass
class FontInfo:
    """Font metadata and resource references."""
    family: str
    size: float
    weight: str = "normal"  # normal, bold
    style: str = "normal"   # normal, italic
    color: Tuple[float, float, float] = (0.0, 0.0, 0.0)  # RGB (0.0-1.0)
    embedded: bool = False
    subsetted: bool = False
    resource_name: Optional[str] = None  # e.g., /F1
    encoding: Optional[str] = None       # e.g., WinAnsiEncoding, Identity-H
    is_cid: bool = False
    base_font: Optional[str] = None      # Raw BaseFont name from PDF dict
    char_to_code: Dict[str, str] = field(default_factory=dict)  # char -> hex code in subset
    code_to_char: Dict[str, str] = field(default_factory=dict)  # hex code -> char

    def to_dict(self) -> Dict[str, Any]:
        return {
            "family": self.family,
            "size": round(self.size, 2),
            "weight": self.weight,
            "style": self.style,
            "color": [round(c, 3) for c in self.color],
            "embedded": self.embedded,
            "subsetted": self.subsetted,
            "resourceName": self.resource_name,
            "encoding": self.encoding,
            "isCid": self.is_cid,
            "baseFont": self.base_font,
        }


@dataclass
class TextRun:
    """A contiguous run of text with uniform styling inside a PDF content stream."""
    id: str
    text: str
    bounding_box: BoundingBox
    font: FontInfo
    origin: Tuple[float, float]  # (x, y) baseline origin
    matrix: List[float] = field(default_factory=lambda: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0])  # Tm
    raw_operator_index: Optional[int] = None
    stream_index: int = 0
    raw_bytes: Optional[bytes] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "boundingBox": self.bounding_box.to_dict(),
            "font": self.font.to_dict(),
            "origin": [round(self.origin[0], 2), round(self.origin[1], 2)],
            "matrix": [round(m, 4) for m in self.matrix],
        }


@dataclass
class EditableText:
    """High-level editable text unit (word, phrase, or line) presented to the user/client."""
    id: str
    page_number: int  # 1-indexed
    text: str
    bounding_box: BoundingBox
    font: FontInfo
    runs: List[TextRun] = field(default_factory=list)
    source_object_id: Optional[str] = None
    source_content_stream: Optional[str] = None
    rotation: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "pageNumber": self.page_number,
            "text": self.text,
            "boundingBox": self.bounding_box.to_dict(),
            "font": self.font.to_dict(),
            "rotation": self.rotation,
            "sourceObjectId": self.source_object_id,
            "runs": [r.to_dict() for r in self.runs],
        }
