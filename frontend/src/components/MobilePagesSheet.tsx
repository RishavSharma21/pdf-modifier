import React, { useEffect, useRef, useState } from 'react';
import { Layers, X, RotateCw, Trash2, Check } from 'lucide-react';
import type { PageMeta } from '../types/pdf';

interface MobilePagesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageMeta[];
  currentPage: number;
  pdfDoc?: any;
  modifiedPage?: number | null;
  onPageSelect: (pageNumber: number) => void;
  onRotatePage?: (pageNumber: number) => void;
  onDeletePage?: (pageNumber: number) => void;
}

const MobilePageThumbnail: React.FC<{
  pdfDoc: any;
  pageNum: number;
  pageMeta?: PageMeta;
  isActive: boolean;
  canDelete: boolean;
  modifiedPage?: number | null;
  onSelect: () => void;
  onRotate: () => void;
  onDelete: () => void;
}> = React.memo(({ pdfDoc, pageNum, pageMeta, isActive, canDelete, modifiedPage, onSelect, onRotate, onDelete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isThumbRendered, setIsThumbRendered] = useState(false);
  const hasRenderedRef = useRef(false);
  const renderedDocRef = useRef<any>(null);
  const renderedRotationRef = useRef<number>(pageMeta?.rotation ?? 0);

  useEffect(() => {
    if (!canvasRef.current || !pdfDoc) return;

    if (
      hasRenderedRef.current &&
      renderedDocRef.current !== pdfDoc &&
      renderedRotationRef.current === (pageMeta?.rotation ?? 0) &&
      modifiedPage !== null &&
      modifiedPage !== undefined &&
      modifiedPage !== pageNum
    ) {
      renderedDocRef.current = pdfDoc;
      return;
    }

    let cancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        // Keep thumbnail lightweight for mobile memory
        const baseScale = 0.35;
        const pageRotation = pageMeta?.rotation ?? 0;
        const viewport = page.getViewport({ scale: baseScale, rotation: pageRotation });
        const outputScale = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.floor(viewport.width * outputScale);
        const h = Math.floor(viewport.height * outputScale);

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;
        offCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const renderTask = page.render({ canvasContext: offCtx, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(offscreen, 0, 0);
        }

        // Deallocate offscreen buffer immediately
        offscreen.width = 0;
        offscreen.height = 0;

        renderedDocRef.current = pdfDoc;
        renderedRotationRef.current = pageRotation;
        hasRenderedRef.current = true;
        setIsThumbRendered(true);
      } catch {
        // Render cancelled or page error
      }
    };

    render();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, pageNum, pageMeta?.rotation, modifiedPage]);

  const isLandscape = (pageMeta?.width || 595) > (pageMeta?.height || 842);
  const targetAspect = isLandscape ? '1.414 / 1' : '1 / 1.414';

  return (
    <div
      className={`mobile-page-card ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      id={`mobile-page-card-${pageNum}`}
    >
      <div className="mobile-page-preview-wrapper" style={{ aspectRatio: targetAspect }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            opacity: isThumbRendered ? 1 : 0,
          }}
        />
        {!isThumbRendered && (
          <div className="mobile-page-skeleton">
            <div className="mobile-page-skeleton-shimmer" />
          </div>
        )}
        {isActive && (
          <div className="mobile-page-active-badge">
            <Check size={11} strokeWidth={3} />
            <span>Current</span>
          </div>
        )}
      </div>

      <div className="mobile-page-card-footer" onClick={(e) => e.stopPropagation()}>
        <span className="mobile-page-number-label">Page {pageNum}</span>
        <div className="mobile-page-actions-group">
          <button
            type="button"
            className="mobile-page-action-btn rotate-btn"
            onClick={onRotate}
            aria-label={`Rotate page ${pageNum}`}
            title="Rotate 90° clockwise"
            id={`btn-mobile-rotate-page-${pageNum}`}
          >
            <RotateCw size={13} />
          </button>
          {canDelete && (
            <button
              type="button"
              className="mobile-page-action-btn delete-btn"
              onClick={onDelete}
              aria-label={`Delete page ${pageNum}`}
              title="Delete page"
              id={`btn-mobile-delete-page-${pageNum}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export const MobilePagesSheet: React.FC<MobilePagesSheetProps> = ({
  isOpen,
  onClose,
  pages,
  currentPage,
  pdfDoc,
  modifiedPage,
  onPageSelect,
  onRotatePage,
  onDeletePage,
}) => {
  const sheetContentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active page when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const activeEl = document.getElementById(`mobile-page-card-${currentPage}`);
      if (activeEl && sheetContentRef.current) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen, currentPage]);

  if (!isOpen) return null;

  return (
    <div
      className="mobile-pages-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="mobile-pages-sheet" id="mobile-pages-sheet">
        {/* Grab Handle */}
        <div className="mobile-sheet-handle" />

        {/* Header */}
        <div className="mobile-pages-header">
          <div className="mobile-pages-title-group">
            <Layers size={16} className="mobile-pages-title-icon" />
            <span className="mobile-pages-title">Pages</span>
            <span className="mobile-pages-count-pill">{pages.length}</span>
          </div>

          <button
            type="button"
            className="mobile-pages-close-btn"
            onClick={onClose}
            aria-label="Close pages sheet"
          >
            <X size={18} />
          </button>
        </div>

        {/* Instruction Note */}
        <div className="mobile-pages-note">
          Tap a page to jump, or use buttons to rotate and manage pages.
        </div>

        {/* Scrollable Page Grid */}
        <div className="mobile-pages-grid" ref={sheetContentRef}>
          {pages.map((p) => (
            <MobilePageThumbnail
              key={p.page}
              pdfDoc={pdfDoc}
              pageNum={p.page}
              pageMeta={p}
              isActive={p.page === currentPage}
              canDelete={pages.length > 1}
              modifiedPage={modifiedPage}
              onSelect={() => {
                onPageSelect(p.page);
                onClose();
              }}
              onRotate={() => onRotatePage?.(p.page)}
              onDelete={() => onDeletePage?.(p.page)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
