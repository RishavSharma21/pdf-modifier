import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Check, Search } from 'lucide-react';

export interface FontOption {
  label: string;
  value: string;
  category: 'Sans' | 'Serif' | 'Mono' | 'Document';
}

interface FontPickerPopoverProps {
  currentFont: string;
  documentFont?: string;
  onSelectFont: (fontFamily: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_FONTS: FontOption[] = [
  // Modern Sans-Serif
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif', category: 'Sans' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif', category: 'Sans' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, Geneva, sans-serif', category: 'Sans' },
  { label: 'Inter', value: 'Inter, -apple-system, sans-serif', category: 'Sans' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif', category: 'Sans' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", "Lucida Grande", sans-serif', category: 'Sans' },
  // Classical Serif
  { label: 'Times New Roman', value: '"Times New Roman", Times, Georgia, serif', category: 'Serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif', category: 'Serif' },
  { label: 'Garamond', value: 'Garamond, "Hoefler Text", "Times New Roman", serif', category: 'Serif' },
  // Monospace
  { label: 'Courier New', value: '"Courier New", Courier, monospace', category: 'Mono' },
  { label: 'Consolas', value: 'Consolas, Monaco, monospace', category: 'Mono' },
];

export const FontPickerPopover: React.FC<FontPickerPopoverProps> = ({
  currentFont,
  documentFont,
  onSelectFont,
  isOpen,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Click outside and Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  // Normalization helper
  const cleanFontName = (str: string = '') =>
    (str || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();

  const normalizedCurrent = cleanFontName(currentFont);

  // Group fonts
  const fontGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const docOption: FontOption | null = documentFont
      ? {
          label: documentFont,
          value: documentFont,
          category: 'Document',
        }
      : null;

    const all = docOption
      ? [docOption, ...AVAILABLE_FONTS.filter((f) => cleanFontName(f.label) !== cleanFontName(documentFont || ''))]
      : AVAILABLE_FONTS;

    const filtered = q ? all.filter((f) => f.label.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) : all;

    const groups: { [key: string]: FontOption[] } = {};
    filtered.forEach((font) => {
      const groupKey =
        font.category === 'Document'
          ? 'Matching Document'
          : font.category === 'Sans'
          ? 'Sans-Serif'
          : font.category === 'Serif'
          ? 'Serif'
          : 'Monospace';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(font);
    });

    return groups;
  }, [documentFont, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="pro-font-popover" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
      {/* Search Header */}
      <div className="pro-font-search-box">
        <Search size={13} className="pro-font-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          className="pro-font-search-input"
          placeholder="Filter typography..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          spellCheck={false}
        />
        {searchQuery && (
          <button
            type="button"
            className="pro-font-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear filter"
          >
            ×
          </button>
        )}
      </div>

      {/* Font Options List */}
      <div className="pro-font-list">
        {Object.entries(fontGroups).map(([groupTitle, fonts]) => (
          <div key={groupTitle} className="pro-font-group">
            <div className="pro-font-group-title">{groupTitle}</div>
            <div className="pro-font-group-items">
              {fonts.map((font) => {
                const isSelected = cleanFontName(font.label) === normalizedCurrent;
                return (
                  <button
                    key={font.value}
                    type="button"
                    className={`pro-font-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onSelectFont(font.label);
                      onClose();
                    }}
                  >
                    <div className="pro-font-item-left">
                      <span className="pro-font-item-name">{font.label}</span>
                      <span className="pro-font-item-preview" style={{ fontFamily: font.value }}>
                        Ag 123
                      </span>
                    </div>

                    <div className="pro-font-item-right">
                      <span className={`pro-font-badge badge-${font.category.toLowerCase()}`}>
                        {font.category}
                      </span>
                      {isSelected && <Check size={14} className="pro-font-check" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {Object.keys(fontGroups).length === 0 && (
          <div className="pro-font-empty">No matching fonts found</div>
        )}
      </div>
    </div>
  );
};
