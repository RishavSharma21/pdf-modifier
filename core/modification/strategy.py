"""Text Modification Strategy interface."""
from abc import ABC, abstractmethod
from ..models.operation import EditOperation, ModificationResult


class TextModificationStrategy(ABC):
    """Abstract strategy for modifying PDF text."""

    @abstractmethod
    def apply_edit(
        self,
        input_pdf_path: str,
        output_pdf_path: str,
        operation: EditOperation
    ) -> ModificationResult:
        """Apply an edit operation and return a ModificationResult."""
        pass
