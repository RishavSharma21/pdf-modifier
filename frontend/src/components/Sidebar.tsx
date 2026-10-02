import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '../types/pdf';

interface SidebarProps {
  pages: PageMeta[];
  currentPage: number;
  pdfUrl: string;
  pdfDoc?: any;
  onPageSelect: (pageNumber: number) => void;
}

const PageThumbnail: React.FC<{
  pdfDoc: any;
  pageNum: number;
  isActive: boolean;
  onClick: () => void;
}> = React.memo(({ pdfDoc, pageNum, isActive, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isThumbRendered, setIsThumbRendered] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !pdfDoc) return;
    let cancelled = false;

    // Stagger initial render so page 1 renders immediately (0ms), followed quickly by subsequent pages
    const delay = pageNum === 1 ? 0 : Math.min((pageNum - 1) * 35, 300);
    const timer = setTimeout(() => {
      const render = async () => {
        try {
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;

          const baseScale = 0.45;
          const viewport = page.getViewport({ scale: baseScale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = '100%';
          canvas.style.height = '100%';

          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
            } catch {}
          }

          const renderTask = page.render({ canvasContext: ctx, viewport });
          renderTaskRef.current = renderTask;
          await renderTask.promise;

          if (!cancelled) {
            setIsThumbRendered(true);
          }
        } catch {
          // Task cancelled or page error
        }
      };
      render();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, pageNum]);

  return (
    <div
      className={`thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      id={`thumbnail-page-${pageNum}`}
    >
      <div className="thumb-preview" style={{ position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'block',
            opacity: isThumbRendered ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        />
        {!isThumbRendered && (
          <div className="thumb-skeleton" style={{ position: 'absolute', inset: 0 }}>
            <div className="skeleton-shimmer-wave" />
            <div className="thumb-skeleton-mock">
              <div className="skeleton-line" style={{ width: '45%', height: 6, marginBottom: 4 }} />
              <div className="skeleton-line" style={{ width: '90%', height: 4 }} />
              <div className="skeleton-line" style={{ width: '75%', height: 4 }} />
              <div className="skeleton-line" style={{ width: '85%', height: 4 }} />
              <div className="skeleton-line" style={{ width: '60%', height: 4 }} />
            </div>
          </div>
        )}
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
  onPageSelect,
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
      thumbEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
              isActive={p.page === currentPage}
              onClick={() => onPageSelect(p.page)}
            />
          ))}
        </div>
      )}
    </aside>
  );
};

