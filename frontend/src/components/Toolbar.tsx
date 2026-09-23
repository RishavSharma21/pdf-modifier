import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Minimize2,
} from 'lucide-react';

interface ToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  onPageChange: (newPage: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentPage,
  totalPages,
  scale,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
}) => {
  return (
    <div className="floating-toolbar" id="floating-toolbar">
      {/* Page Stepper */}
      <button
        className="btn btn-icon"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        id="btn-prev-page"
        title="Previous Page"
      >
        <ChevronLeft size={16} />
      </button>

      <span className="page-indicator" id="page-indicator">
        {currentPage} / {totalPages}
      </span>

      <button
        className="btn btn-icon"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        id="btn-next-page"
        title="Next Page"
      >
        <ChevronRight size={16} />
      </button>

      <div className="toolbar-divider" />

      {/* Zoom Controls */}
      <button className="btn btn-icon" onClick={onZoomOut} id="btn-zoom-out" title="Zoom Out">
        <ZoomOut size={16} />
      </button>

      <span className="page-indicator" id="zoom-indicator">
        {Math.round(scale * 100)}%
      </span>

      <button className="btn btn-icon" onClick={onZoomIn} id="btn-zoom-in" title="Zoom In">
        <ZoomIn size={16} />
      </button>

      <div className="toolbar-divider" />

      <button className="btn btn-icon" onClick={onFitWidth} id="btn-fit-width" title="Fit to Width">
        <Maximize2 size={15} />
      </button>

      <button className="btn btn-icon" onClick={onFitPage} id="btn-fit-page" title="Fit to Page">
        <Minimize2 size={15} />
      </button>
    </div>
  );
};
