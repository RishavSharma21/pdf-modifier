import React, { useEffect, useRef, useState } from 'react';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '../types/pdf';

interface SidebarProps {
  pages: PageMeta[];
  currentPage: number;
  pdfUrl: string;
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

  useEffect(() => {
    if (!canvasRef.current || !pdfDoc) return;
    let cancelled = false;

    // Fast, staggered rendering sharing the single master document
    const delay = Math.min((pageNum - 1) * 40, 400);
    const timer = setTimeout(() => {
      const render = async () => {
        try {
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const baseScale = 0.85;
          const viewport = page.getViewport({ scale: baseScale });
          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
          if (renderTaskRef.current) renderTaskRef.current.cancel();
          await renderTaskRef.current.promise;
          if (!cancelled) {
            setIsThumbRendered(true);
          }
        } catch {
          // cancelled or error
        }
      };
      render();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pdfDoc, pageNum]);

  const [isThumbRendered, setIsThumbRendered] = useState(false);

  return (
    <div
      className={`thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      id={`thumbnail-page-${pageNum}`}
    >
      <div className="thumb-preview">
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', display: isThumbRendered ? 'block' : 'none' }} />
        {!isThumbRendered && (
          <div className="thumb-skeleton">
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

export const Sidebar: React.FC<SidebarProps> = ({ pages, currentPage, pdfUrl, onPageSelect }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sharedDoc, setSharedDoc] = useState<any>(null);

  // Load PDF document ONCE at the sidebar level and share across all thumbnail workers
  useEffect(() => {
    if (!pdfUrl) {
      setSharedDoc(null);
      return;
    }
    let isCancelled = false;
    const loadSharedDoc = async () => {
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) return;
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
  }, [pdfUrl]);

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
