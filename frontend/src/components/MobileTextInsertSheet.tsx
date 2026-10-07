import React, { useRef, useEffect, useState } from 'react';
import { Type, Bold, Underline, Palette, Loader2 } from 'lucide-react';

interface MobileTextInsertSheetProps {
  initialText?: string;
  pageNum?: number;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  isBold: boolean;
  onToggleBold: () => void;
  isUnderlined?: boolean;
  onToggleUnderline?: () => void;
  color: string;
  onColorChange: (hex: string) => void;
  onLiveTextChange?: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const COMMON_FONTS = [
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, Georgia, serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
  { label: 'Inter', value: 'Inter, -apple-system, sans-serif' },
];

const COLOR_PRESETS = [
  { label: 'Black', hex: '#000000' },
  { label: 'Blue', hex: '#2563eb' },
  { label: 'Red', hex: '#dc2626' },
  { label: 'Emerald', hex: '#16a34a' },
  { label: 'White', hex: '#ffffff' },
];

export const MobileTextInsertSheet: React.FC<MobileTextInsertSheetProps> = ({
  initialText = '',
  pageNum,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  isBold,
  onToggleBold,
  isUnderlined = false,
  onToggleUnderline,
  color,
  onColorChange,
  onLiveTextChange,
  onCommit,
  onCancel,
  isSubmitting = false,
}) => {
  const [text, setText] = useState(initialText);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [viewportBottom, setViewportBottom] = useState<number>(0);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic visual viewport adjustment for mobile software keyboards
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      const offset = window.innerHeight - window.visualViewport.height;
      setViewportBottom(Math.max(0, offset));
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
    handleViewportChange();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  // Auto-focus textarea on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const displayFontName = (fontFamily || 'Helvetica').split(',')[0].replace(/['"]/g, '').trim();

  const handleInsertClick = () => {
    if (!text.trim() || isSubmitting) return;
    onCommit(text);
  };

  return (
    <div
      className="mobile-text-edit-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <div
        className="mobile-text-edit-sheet mobile-text-insert-sheet"
        style={{
          transform: viewportBottom > 0 ? `translateY(-${viewportBottom}px)` : undefined,
          maxHeight: viewportBottom > 0 ? `calc(100dvh - ${viewportBottom + 16}px)` : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        id="mobile-text-insert-sheet"
      >
        {/* Grab Handle */}
        <div className="mobile-sheet-handle" />

        {/* Header */}
        <div className="mobile-sheet-header">
          <button
            type="button"
            className="mobile-sheet-btn-cancel"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Cancel inserting text"
          >
            Cancel
          </button>

          <div className="mobile-sheet-title-group">
            <span className="mobile-sheet-title">Insert Text {pageNum ? `· Page ${pageNum}` : ''}</span>
            <div className="mobile-sheet-font-pill">
              <span>{displayFontName}</span>
              <span className="font-pill-dot">·</span>
              <span>{fontSize} pt</span>
            </div>
          </div>

          <button
            type="button"
            className="mobile-sheet-btn-save"
            onClick={handleInsertClick}
            disabled={!text.trim() || isSubmitting}
            aria-label="Insert text"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="spin-fast" />
                <span>Inserting</span>
              </>
            ) : (
              <span>Insert</span>
            )}
          </button>
        </div>

        {/* Location Hint */}
        <div className="mobile-insert-location-hint">
          📍 Placed on document. Tap anywhere on page to move position.
        </div>

        {/* Text Input */}
        <div className="mobile-sheet-input-wrapper">
          <textarea
            ref={textareaRef}
            className="mobile-sheet-textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onLiveTextChange?.(e.target.value);
            }}
            placeholder="Type your text to insert..."
            rows={2}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div
            className="mobile-sheet-color-bar"
            style={{ backgroundColor: color }}
            title={`Active Color: ${color}`}
          />
        </div>

        {/* Typography Controls Row */}
        <div className="mobile-typography-row">
          {/* Font Family Selector */}
          <div className="mobile-font-family-selector">
            <button
              type="button"
              className={`mobile-font-btn ${isFontMenuOpen ? 'active' : ''}`}
              onClick={() => setIsFontMenuOpen((v) => !v)}
              aria-label="Select font family"
            >
              <Type size={13} />
              <span>{displayFontName}</span>
            </button>
          </div>

          {/* Font Size Stepper */}
          <div className="mobile-stepper-group">
            <button
              type="button"
              className="mobile-stepper-btn"
              onClick={() => onFontSizeChange(Math.max(6, fontSize - 1))}
              disabled={fontSize <= 6}
              aria-label="Decrease font size"
            >
              -
            </button>
            <span className="mobile-stepper-val">{fontSize} pt</span>
            <button
              type="button"
              className="mobile-stepper-btn"
              onClick={() => onFontSizeChange(Math.min(96, fontSize + 1))}
              disabled={fontSize >= 96}
              aria-label="Increase font size"
            >
              +
            </button>
          </div>

          {/* Style Toggles: Bold & Underline */}
          <div className="mobile-style-toggles">
            <button
              type="button"
              className={`mobile-style-toggle-btn ${isBold ? 'active' : ''}`}
              onClick={onToggleBold}
              aria-label="Toggle Bold"
            >
              <Bold size={13} />
            </button>
            {onToggleUnderline && (
              <button
                type="button"
                className={`mobile-style-toggle-btn ${isUnderlined ? 'active' : ''}`}
                onClick={onToggleUnderline}
                aria-label="Toggle Underline"
              >
                <Underline size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Font Family Selection Pills (when opened) */}
        {isFontMenuOpen && (
          <div className="mobile-font-pills-scroll">
            {COMMON_FONTS.map((f) => {
              const isSelected = displayFontName.toLowerCase() === f.label.toLowerCase();
              return (
                <button
                  key={f.label}
                  type="button"
                  className={`mobile-font-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    onFontFamilyChange(f.value);
                    setIsFontMenuOpen(false);
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Color Presets Row */}
        <div className="mobile-sheet-footer">
          <div className="mobile-sheet-tools-left">
            <span className="mobile-sheet-tools-label">Color:</span>
            <div className="mobile-color-preset-group">
              {COLOR_PRESETS.map((p) => {
                const isSelected = color.toLowerCase() === p.hex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    type="button"
                    className={`mobile-color-preset-dot ${isSelected ? 'active' : ''}`}
                    style={{ backgroundColor: p.hex }}
                    onClick={() => onColorChange(p.hex)}
                    title={p.label}
                    aria-label={`Select ${p.label}`}
                  />
                );
              })}

              {/* Custom Native Color Picker */}
              <button
                type="button"
                className="mobile-color-custom-btn"
                onClick={() => colorInputRef.current?.click()}
                title="Custom Color"
              >
                <Palette size={13} />
                <input
                  ref={colorInputRef}
                  type="color"
                  value={color}
                  onChange={(e) => onColorChange(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
