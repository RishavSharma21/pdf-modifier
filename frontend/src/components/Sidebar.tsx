import React from 'react';
import { Layers } from 'lucide-react';
import type { PageMeta } from '../types/pdf';

interface SidebarProps {
  pages: PageMeta[];
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  currentPage,
  onPageSelect,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Pages ({pages.length})</span>
        <Layers size={14} />
      </div>

      <div className="thumbnails-list">
        {pages.map((p) => (
          <div
            key={p.page}
            className={`thumbnail-item ${p.page === currentPage ? 'active' : ''}`}
            onClick={() => onPageSelect(p.page)}
            id={`thumbnail-page-${p.page}`}
          >
            <div className="thumb-preview">
              <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                {p.page}
              </span>
            </div>
            <div className="thumb-label">Page {p.page}</div>
          </div>
        ))}
      </div>
    </aside>
  );
};
