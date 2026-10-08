import React, { useState, useRef, useEffect } from 'react';
import { Download, FilePlus, Loader2, Keyboard, Search, Sun, Moon, MoreVertical, Bug, Layers } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

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
  onOpenPagesClick?: () => void;
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
  onOpenPagesClick,
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
        aria-label="PDF Modifier home"
      >
        <div className="brand-logo">
          <BrandLogo size={24} />
        </div>
        <span className="brand-title">PDF Modifier</span>
      </div>

      {/* Center: Unified Document Title & Status Capsule */}
      <div className="header-center">
        {hasDocument && filename && (
          <div className="header-doc-capsule">
            <span className="doc-capsule-name">
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
                aria-label="Find & Replace"
              >
                <Search size={14} />
              </button>
            )}

            <button
              className="btn-utility-item btn-shortcuts-utility"
              onClick={onShortcutsClick}
              id="btn-shortcuts"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard size={14} />
            </button>

            {onToggleTheme && (
              <button
                className={`btn-utility-item theme-toggle-btn ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
                onClick={onToggleTheme}
                id="btn-theme-toggle"
                aria-label="Toggle theme"
              >
                <div className="theme-icon-track">
                  <Sun size={14} className="theme-icon sun-icon" />
                  <Moon size={14} className="theme-icon moon-icon" />
                </div>
              </button>
            )}

            <a
              className="btn-utility-item btn-report-bug"
              href="https://github.com/RishavSharma21/pdf-modifier/issues/new?labels=bug&template=bug_report.md&title=%5BBug%5D+"
              target="_blank"
              rel="noopener noreferrer"
              id="btn-report-bug"
              aria-label="Report a bug"
            >
              <Bug size={14} />
            </a>
          </div>
        )}

        {/* Report Bug on landing page too (icon-only, minimal) */}
        {!hasDocument && (
          <a
            className="btn-report-bug-landing"
            href="https://github.com/RishavSharma21/pdf-modifier/issues/new?labels=bug&template=bug_report.md&title=%5BBug%5D+"
            target="_blank"
            rel="noopener noreferrer"
            id="btn-report-bug-landing"
            aria-label="Report a bug"
          >
            <Bug size={14} />
          </a>
        )}

        {/* Mobile Overflow Menu Anchor */}
        {hasDocument && (
          <div className="mobile-more-anchor" ref={mobileMenuRef}>
            <button
              className={`btn-mobile-more ${isMobileMenuOpen ? 'active' : ''}`}
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="More options"
              id="btn-mobile-more"
            >
              <MoreVertical size={16} />
            </button>

            {isMobileMenuOpen && (
              <div className="mobile-dropdown-menu" id="mobile-dropdown-menu">
                {onOpenPagesClick && (
                  <button
                    className="mobile-dropdown-item"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenPagesClick();
                    }}
                    id="btn-mobile-pages"
                  >
                    <Layers size={15} />
                    <span>Pages (Rotate / Delete)</span>
                  </button>
                )}



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

                <a
                  className="mobile-dropdown-item"
                  href="https://github.com/RishavSharma21/pdf-modifier/issues/new?labels=bug&template=bug_report.md&title=%5BBug%5D+"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="btn-mobile-report-bug"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Bug size={15} />
                  <span>Report Bug</span>
                </a>

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
              aria-label="Open or upload a new PDF file"
            >
              <FilePlus size={13} />
              <span className="btn-text-desktop">New file</span>
            </button>

            <button
              className="btn btn-header-primary"
              onClick={onExportClick}
              disabled={isDownloading}
              id="btn-download-pdf"
              aria-label="Download modified PDF file"
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
