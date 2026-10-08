"""PDF Modification Engine Orchestrator."""
from __future__ import annotations
import os
from typing import Optional, List, Tuple
from ..models.operation import EditOperation, ModificationResult, ModificationStrategy
from ..models.text_object import EditableText, BoundingBox
from ..pdf.analyzer import PDFAnalyzer
from .strategy import TextModificationStrategy
from .true_content_strategy import TrueContentModificationStrategy


class PDFModificationEngine:
    """High-level engine orchestrating PDF inspection and surgical modification."""

    def __init__(self, strategy: Optional[TextModificationStrategy] = None):
        self.strategy = strategy or TrueContentModificationStrategy()

    def modify_text(
        self,
        input_pdf_path: str,
        output_pdf_path: str,
        search_text: str,
        replacement_text: str,
        page_number: int = 1,
        color: Optional[Tuple[float, float, float]] = None,
        target_text_id: Optional[str] = None,
        bounding_box: Optional[BoundingBox] = None,
        origin: Optional[Tuple[float, float]] = None,
        underlined: Optional[bool] = None,
        font_size: Optional[float] = None,
        font_family: Optional[str] = None,
    ) -> ModificationResult:
        """Find a target text run on the specified page and replace it in the content stream."""
        if not os.path.exists(input_pdf_path):
            op = EditOperation(
                page_number=page_number,
                target_text_id=target_text_id or "unknown",
                original_text=search_text,
                new_text=replacement_text,
                original_bounding_box=bounding_box,
                origin=origin,
            )
            return ModificationResult(
                success=False,
                operation=op,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Input file not found: {input_pdf_path}"
            )

        # Analyze PDF to find matching EditableText and TextRun
        analyzer = PDFAnalyzer(input_pdf_path)
        try:
            page_objects = analyzer.analyze_page(page_number - 1)
        except Exception as e:
            op = EditOperation(
                page_number=page_number,
                target_text_id=target_text_id or "unknown",
                original_text=search_text,
                new_text=replacement_text,
                original_bounding_box=bounding_box,
                origin=origin,
            )
            return ModificationResult(
                success=False,
                operation=op,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Failed to analyze PDF page: {e}"
            )

        matched_obj: Optional[EditableText] = None

        # Priority 1: Match by exact target_text_id AND text content agreement
        clean_search = (search_text or "").strip()
        if target_text_id:
            for obj in page_objects:
                if obj.id == target_text_id:
                    if not clean_search or clean_search in obj.text or obj.text in clean_search:
                        matched_obj = obj
                        break

        # Priority 2: Match by nearest bounding box with text agreement
        if not matched_obj and bounding_box:
            best_dist = float("inf")
            for obj in page_objects:
                dist = (obj.bounding_box.x - bounding_box.x)**2 + (obj.bounding_box.y - bounding_box.y)**2
                text_agrees = not clean_search or (clean_search in obj.text or obj.text in clean_search)
                if text_agrees and dist < best_dist and dist < 2500:  # within ~50 points
                    best_dist = dist
                    matched_obj = obj

        # Priority 3: Fallback content search (exact or substring)
        if not matched_obj and clean_search:
            for obj in page_objects:
                if obj.text.strip() == clean_search:
                    matched_obj = obj
                    break
            if not matched_obj:
                for obj in page_objects:
                    if clean_search in obj.text or obj.text in clean_search:
                        matched_obj = obj
                        break

        # Priority 4: Nearest bounding box without strict text match
        if not matched_obj and bounding_box:
            best_dist = float("inf")
            for obj in page_objects:
                dist = (obj.bounding_box.x - bounding_box.x)**2 + (obj.bounding_box.y - bounding_box.y)**2
                if dist < best_dist and dist < 900:  # within ~30 points
                    best_dist = dist
                    matched_obj = obj

        # Priority 5: Fallback to target_text_id if nothing else matched
        if not matched_obj and target_text_id:
            for obj in page_objects:
                if obj.id == target_text_id:
                    matched_obj = obj
                    break

        target_id = target_text_id or (matched_obj.id if matched_obj else "unknown")
        target_bbox = bounding_box or (matched_obj.bounding_box if matched_obj else None)
        target_font = matched_obj.font if matched_obj else None
        target_origin = origin or (matched_obj.origin if matched_obj else None)
        target_runs = matched_obj.runs if matched_obj else None

        if color is not None and target_font is not None:
            target_font.color = color

        if font_size is not None and target_font is not None:
            target_font.size = font_size

        if font_family is not None and target_font is not None:
            target_font.family = font_family

        # If search_text is a substring of the matched line, preserve the full line context
        if matched_obj and search_text in matched_obj.text and search_text != matched_obj.text:
            orig_text_to_use = matched_obj.text
            new_text_to_use = matched_obj.text.replace(search_text, replacement_text, 1)
        else:
            orig_text_to_use = search_text
            new_text_to_use = replacement_text

        operation = EditOperation(
            page_number=page_number,
            target_text_id=target_id,
            original_text=orig_text_to_use,
            new_text=new_text_to_use,
            original_bounding_box=target_bbox,
            original_font=target_font,
            origin=target_origin,
            original_runs=target_runs,
            underlined=underlined,
            font_size=font_size,
            font_family=font_family,
        )

        return self.strategy.apply_edit(input_pdf_path, output_pdf_path, operation)

