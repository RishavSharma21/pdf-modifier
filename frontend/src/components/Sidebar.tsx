import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Layers, ChevronLeft, ChevronRight, RotateCw, Trash2 } from 'lucide-react';
import type { PageMeta } from '../types/pdf';

interface SidebarProps {
  pages: PageMeta[];
  currentPage: number;
  pdfUrl: string;
  pdfDoc?: any;
  modifiedPage?: number | null;
  onPageSelect: (pageNumber: number) => void;
  onRotatePage?: (pageNumber: number) => void;
  onDeletePage?: (pageNumber: number) => void;
}

const PageThumbnail: React.FC<{
  pdfDoc: any;
  pageNum: number;
  pageMeta?: PageMeta;
  isActive: boolean;
  canDelete: boolean;
  modifiedPage?: number | null;
  onClick: () => void;
  onRotate?: () => void;
  onDelete?: () => void;
}> = React.memo(({ pdfDoc, pageNum, pageMeta, isActive, canDelete, modifiedPage, onClick, onRotate, onDelete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isThumbRendered, setIsThumbRendered] = useState(false);
  const hasRenderedRef = useRef(false);
  const renderedDocRef = useRef<any>(null);
  const renderedRotationRef = useRef<number>(pageMeta?.rotation ?? 0);

  useEffect(() => {
    if (!canvasRef.current || !pdfDoc) return;

    // If already rendered once and an edit occurred on a DIFFERENT page (and rotation unchanged), skip re-render!
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

        const baseScale = 0.45;
        const pageRotation = pageMeta?.rotation ?? 0;
        const viewport = page.getViewport({ scale: baseScale, rotation: pageRotation });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.floor(viewport.width * outputScale);
        const h = Math.floor(viewport.height * outputScale);

        // Double-buffering: render to offscreen canvas so visible canvas never blanks out or flickers!
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

        // Only adjust visible canvas dimensions if they changed (resizing wipes pixels)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
        }

        // Blit offscreen buffer to visible canvas in a single instant frame
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(offscreen, 0, 0);
        }

        // Release offscreen canvas memory for WebKit/iOS immediately
        offscreen.width = 0;
        offscreen.height = 0;

        renderedDocRef.current = pdfDoc;
        renderedRotationRef.current = pageRotation;
        hasRenderedRef.current = true;
        setIsThumbRendered(true);
      } catch {
        // Task cancelled or page error
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
      className={`thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      id={`thumbnail-page-${pageNum}`}
    >
      <div className="thumb-preview" style={{ aspectRatio: targetAspect, position: 'relative' }}>
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
          <div className="thumb-skeleton" style={{ position: 'absolute', inset: 0 }}>
            <div className="thumb-skeleton-mock">
              <div className="skeleton-line" style={{ width: '45%', height: 6, marginBottom: 4 }} />
              <div className="skeleton-line" style={{ width: '90%', height: 4 }} />
              <div className="skeleton-line" style={{ width: '75%', height: 4 }} />
              <div className="skeleton-line" style={{ width: '85%', height: 4 }} />
              <div className="skeleton-line" style={{ width: '60%', height: 4 }} />
            </div>
          </div>
        )}
        <div className="thumb-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="thumb-action-btn thumb-action-rotate"
            aria-label="Rotate page"
            title="Rotate 90° clockwise"
            onClick={(e) => {
              e.stopPropagation();
              onRotate?.();
            }}
            id={`btn-rotate-page-${pageNum}`}
          >
            <RotateCw size={11} className="thumb-icon-rotate" />
          </button>
          {canDelete && (
            <>
              <div className="thumb-action-divider" />
              <button
                type="button"
                className="thumb-action-btn thumb-action-delete"
                aria-label="Delete page"
                title="Delete page"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
                id={`btn-delete-page-${pageNum}`}
              >
                <Trash2 size={11} className="thumb-icon-delete" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="thumb-label">Page {pageNum}</div>
    </div>
  );
});

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  currentPage,
  pdfUrl,
  pdfDoc: externalPdfDoc,
  modifiedPage,
  onPageSelect,
  onRotatePage,
  onDeletePage,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sharedDoc, setSharedDoc] = useState<any>(null);

  // If pdfDoc was passed from parent, use it directly (0 duplicate fetch).
  // Otherwise, load once at sidebar level as fallback.
  useEffect(() => {
    if (externalPdfDoc) {
      setSharedDoc(externalPdfDoc);
      return;
    }

    if (!pdfUrl) {
      setSharedDoc(null);
      return;
    }

    let isCancelled = false;
    const loadSharedDoc = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, disableStream: true });
        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setSharedDoc(doc);
        }
      } catch (err) {
        console.error('Sidebar error loading shared PDF doc:', err);
      }
    };
    loadSharedDoc();
    return () => {
      isCancelled = true;
    };
  }, [externalPdfDoc, pdfUrl]);

  // Keep the active page thumbnail visible in the sidebar as the user scrolls the PDF
  useEffect(() => {
    if (collapsed) return;
    const thumbEl = document.getElementById(`thumbnail-page-${currentPage}`);
    if (thumbEl) {
      thumbEl.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }, [currentPage, collapsed]);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <span>PAGES ({pages.length})</span>}
        <div className="sidebar-header-icons">
          {!collapsed && <Layers size={14} />}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            id="btn-sidebar-toggle"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="thumbnails-list">
          {pages.map((p) => (
            <PageThumbnail
              key={p.page}
              pdfDoc={sharedDoc}
              pageNum={p.page}
              pageMeta={p}
              isActive={p.page === currentPage}
              canDelete={pages.length > 1}
              modifiedPage={modifiedPage}
              onClick={() => onPageSelect(p.page)}
              onRotate={() => onRotatePage?.(p.page)}
              onDelete={() => onDeletePage?.(p.page)}
            />
          ))}
        </div>
      )}
    </aside>
  );
};

