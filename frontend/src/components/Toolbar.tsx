import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Minimize2,
  Undo2,
  Redo2,
} from 'lucide-react';

interface ToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  onPageChange: (newPage: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetScale?: (scale: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
}

const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

export const Toolbar: React.FC<ToolbarProps> = ({
  currentPage,
  totalPages,
  scale,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onSetScale,
  onFitWidth,
  onFitPage,
  onUndo,
  canUndo = false,
  onRedo,
  canRedo = false,
}) => {
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
  const pageMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    if (!isZoomMenuOpen && !isPageMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setIsZoomMenuOpen(false);
      }
      if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setIsPageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isZoomMenuOpen, isPageMenuOpen]);

  return (
    <div className="floating-toolbar" id="floating-toolbar">
      {/* Undo / Redo Buttons */}
      {onUndo && (
        <button
          className="toolbar-btn"
          onClick={onUndo}
          disabled={!canUndo}
          id="btn-undo"
          aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
      )}

      {onRedo && (
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!canRedo}
          id="btn-redo"
          aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>
      )}

      {(onUndo || onRedo) && <div className="toolbar-divider" />}

      {/* Page Stepper */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          id="btn-prev-page"
          aria-label="Previous Page"
        >
          <ChevronLeft size={15} />
        </button>

        <div className="page-menu-anchor" ref={pageMenuRef}>
          <button
            className={`page-indicator-btn ${totalPages > 1 ? 'is-interactive' : ''}`}
            id="page-indicator"
            onClick={() => {
              if (totalPages > 1) setIsPageMenuOpen((v) => !v);
            }}
            title={totalPages > 1 ? 'Jump to page' : undefined}
            type="button"
          >
            {currentPage} <span className="page-indicator-sep">/</span> {totalPages}
          </button>

          {isPageMenuOpen && (
            <div className="page-dropdown-menu" id="page-dropdown-menu">
              <div className="page-dropdown-header">Jump to page</div>
              <div className="page-dropdown-grid">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`page-grid-pill ${p === currentPage ? 'active' : ''}`}
                    onClick={() => {
                      onPageChange(p);
                      setIsPageMenuOpen(false);
                    }}
                    type="button"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="toolbar-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          id="btn-next-page"
          aria-label="Next Page"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Zoom Controls */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={onZoomOut}
          id="btn-zoom-out"
          aria-label="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>

        {/* Interactive Zoom Indicator with Presets Dropdown */}
        <div className="zoom-menu-anchor" ref={zoomMenuRef}>
          <button
            className="zoom-indicator-btn"
            id="zoom-indicator"
            onClick={() => setIsZoomMenuOpen((v) => !v)}
            aria-expanded={isZoomMenuOpen}
          >
            <span>{Math.round(scale * 100)}%</span>
            <ChevronDown size={11} className={`zoom-chevron ${isZoomMenuOpen ? 'open' : ''}`} />
          </button>

          {isZoomMenuOpen && (
            <div className="zoom-dropdown-menu" id="zoom-dropdown-menu">
              <div className="zoom-dropdown-header">Zoom & Fit</div>
              <button
                className="zoom-dropdown-item zoom-item-highlight"
                onClick={() => {
                  onFitWidth();
                  setIsZoomMenuOpen(false);
                }}
              >
                <div className="zoom-item-left">
                  <Maximize2 size={13} />
                  <span>Fit Width</span>
                </div>
                <kbd className="kbd-mini">Ctrl 0</kbd>
              </button>
              <button
                className="zoom-dropdown-item"
                onClick={() => {
                  onFitPage();
                  setIsZoomMenuOpen(false);
                }}
              >
                <div className="zoom-item-left">
                  <Minimize2 size={13} />
                  <span>Fit Page</span>
                </div>
                <kbd className="kbd-mini">Ctrl 9</kbd>
              </button>
              <div className="zoom-dropdown-divider" />
              <div className="zoom-presets-grid">
                {ZOOM_PRESETS.map((preset) => {
                  const isCurrent = Math.abs(scale - preset) < 0.03;
                  return (
                    <button
                      key={preset}
                      className={`zoom-preset-pill ${isCurrent ? 'active' : ''}`}
                      onClick={() => {
                        onSetScale?.(preset);
                        setIsZoomMenuOpen(false);
                      }}
                    >
                      <span>{Math.round(preset * 100)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          className="toolbar-btn"
          onClick={onZoomIn}
          id="btn-zoom-in"
          aria-label="Zoom In"
        >
          <ZoomIn size={15} />
        </button>
      </div>

      <div className="toolbar-divider toolbar-divider-desktop-fit" />

      {/* Quick Fit Actions */}
      <div className="toolbar-group toolbar-group-desktop-fit">
        <button
          className="toolbar-btn"
          onClick={onFitWidth}
          id="btn-fit-width"
          aria-label="Fit to Width"
        >
          <Maximize2 size={14} />
        </button>

        <button
          className="toolbar-btn"
          onClick={onFitPage}
          id="btn-fit-page"
          aria-label="Fit to Page"
        >
          <Minimize2 size={14} />
        </button>
      </div>
    </div>
  );
};
