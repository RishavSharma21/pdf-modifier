import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FilePlus, Loader2, Keyboard, Search, Sun, Moon, MoreVertical } from 'lucide-react';

interface HeaderProps {
  filename: string | null;
  onExportClick: () => void;
  onHomeClick: () => void;
  hasDocument: boolean;
  isProcessing?: boolean;
  isDownloading?: boolean;
  onFindReplaceClick?: () => void;
  onShortcutsClick?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  filename,
  onExportClick,
  onHomeClick,
  hasDocument,
  isProcessing = false,
  isDownloading = false,
  onFindReplaceClick,
  onShortcutsClick,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);
  return (
    <header className={`app-header ${hasDocument ? 'has-document' : 'is-landing'}`}>
      <div
        className="brand clickable-brand"
        onClick={onHomeClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onHomeClick();
          }
        }}
        title="Go to landing page / upload new file"
      >
        <div className="brand-logo">
          <FileText size={16} />
        </div>
        <span className="brand-title">PDF Modifier</span>
      </div>

      {/* Center: Unified Document Title & Status Capsule */}
      <div className="header-center">
        {hasDocument && filename && (
          <div className="header-doc-capsule">
            <span className="doc-capsule-name" title={filename}>
              {filename}
            </span>
            <div className="doc-capsule-divider" />
            <div className={`doc-capsule-status ${isProcessing ? 'status-processing' : 'status-saved'}`}>
              <span className="status-indicator-dot" />
              <span className="status-text">{isProcessing ? 'Processing…' : 'Saved'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Actions & Tools */}
      <div className="header-actions">
        {/* On Landing Page (no document open), always show Theme Toggle on both mobile and desktop! */}
        {!hasDocument && onToggleTheme && (
          <button
            className={`btn-utility-item theme-toggle-btn landing-theme-toggle ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
            onClick={onToggleTheme}
            id="btn-landing-theme-toggle"
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle theme"
          >
            <div className="theme-icon-track">
              <Sun size={15} className="theme-icon sun-icon" />
              <Moon size={15} className="theme-icon moon-icon" />
            </div>
          </button>
        )}

        {/* Unified Utility Island for Desktop when document is open */}
        {hasDocument && (
          <div className="header-utility-group">
            {onFindReplaceClick && (
              <button
                className="btn-utility-item"
                onClick={onFindReplaceClick}
                id="btn-find-replace"
                title="Find & Replace (Ctrl+F)"
                aria-label="Find & Replace"
              >
                <Search size={14} />
              </button>
            )}

            <button
              className="btn-utility-item btn-shortcuts-utility"
              onClick={onShortcutsClick}
              id="btn-shortcuts"
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard size={14} />
            </button>

            {onToggleTheme && (
              <button
                className={`btn-utility-item theme-toggle-btn ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
                onClick={onToggleTheme}
                id="btn-theme-toggle"
                title={theme === 'dark' ? 'Switch to Light theme (Ctrl+Shift+L)' : 'Switch to Dark theme (Ctrl+Shift+L)'}
                aria-label="Toggle theme"
              >
                <div className="theme-icon-track">
                  <Sun size={14} className="theme-icon sun-icon" />
                  <Moon size={14} className="theme-icon moon-icon" />
                </div>
              </button>
            )}
          </div>
        )}

        {/* Mobile Overflow Menu Anchor */}
        {hasDocument && (
          <div className="mobile-more-anchor" ref={mobileMenuRef}>
            <button
              className={`btn-mobile-more ${isMobileMenuOpen ? 'active' : ''}`}
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="More options"
              title="More options"
              id="btn-mobile-more"
            >
              <MoreVertical size={16} />
            </button>

            {isMobileMenuOpen && (
              <div className="mobile-dropdown-menu" id="mobile-dropdown-menu">
                {onFindReplaceClick && (
                  <button
                    className="mobile-dropdown-item"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onFindReplaceClick();
                    }}
                    id="btn-mobile-find-replace"
                  >
                    <Search size={15} />
                    <span>Find & Replace</span>
                  </button>
                )}

                {onToggleTheme && (
                  <button
                    className="mobile-dropdown-item"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onToggleTheme();
                    }}
                    id="btn-mobile-theme"
                  >
                    {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                )}

                <div className="mobile-dropdown-divider" />

                <button
                  className="mobile-dropdown-item"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onHomeClick();
                  }}
                  id="btn-mobile-new-file"
                >
                  <FilePlus size={15} />
                  <span>Open New PDF</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Primary & Secondary Action Group */}
        {hasDocument && (
          <div className="header-primary-actions">
            <button
              className="btn btn-header-secondary"
              onClick={onHomeClick}
              id="btn-new-file"
              title="Open or upload a new PDF file"
            >
              <FilePlus size={13} />
              <span className="btn-text-desktop">New file</span>
            </button>

            <button
              className="btn btn-header-primary"
              onClick={onExportClick}
              disabled={isDownloading}
              id="btn-download-pdf"
              title="Download modified PDF file"
            >
              {isDownloading ? (
                <>
                  <Loader2 size={13} className="spin-icon" />
                  <span className="btn-text-desktop">Downloading…</span>
                  <span className="btn-text-mobile">Saving…</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span className="btn-text-desktop">Download PDF</span>
                  <span className="btn-text-mobile">Download</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
