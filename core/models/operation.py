"""Edit operations and modification tracking models."""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any
from .text_object import BoundingBox, FontInfo


class ModificationStrategy(str, Enum):
    ORIGINAL_FONT_REUSED = "ORIGINAL_FONT_REUSED"
    ORIGINAL_FONT_PATCHED = "ORIGINAL_FONT_PATCHED"
    FONT_SUBSTITUTED = "FONT_SUBSTITUTED"
    UNSUPPORTED = "UNSUPPORTED"


@dataclass
class EditOperation:
    """Represents an intended modification of a text object."""
    page_number: int  # 1-indexed
    target_text_id: str
    original_text: str
    new_text: str
    original_bounding_box: Optional[BoundingBox] = None
    original_font: Optional[FontInfo] = None
    target_run_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pageNumber": self.page_number,
            "targetTextId": self.target_text_id,
            "originalText": self.original_text,
            "newText": self.new_text,
            "originalBoundingBox": self.original_bounding_box.to_dict() if self.original_bounding_box else None,
            "originalFont": self.original_font.to_dict() if self.original_font else None,
            "targetRunId": self.target_run_id,
        }


@dataclass
class ModificationResult:
    """Outcome of applying an EditOperation."""
    success: bool
    operation: EditOperation
    strategy: ModificationStrategy
    details: str = ""
    new_bounding_box: Optional[BoundingBox] = None
    metrics_delta_width: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "strategy": self.strategy.value,
            "details": self.details,
            "metricsDeltaWidth": round(self.metrics_delta_width, 2),
            "newBoundingBox": self.new_bounding_box.to_dict() if self.new_bounding_box else None,
            "error": self.error,
        }
