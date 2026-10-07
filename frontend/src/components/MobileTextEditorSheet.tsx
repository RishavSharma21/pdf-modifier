import React, { useRef, useEffect, useState } from 'react';
import { Trash2, Palette, RotateCcw, Loader2, Quote, EyeOff, Type, Underline } from 'lucide-react';
import type { EditableText } from '../types/pdf';

interface MobileTextEditorSheetProps {
  textObject: EditableText;
  activeText: string;
  onChangeText: (text: string) => void;
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  fontFamily?: string;
  onFontFamilyChange?: (family: string) => void;
  isUnderlined?: boolean;
  onToggleUnderline?: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onDeleteLine: () => void;
  onRedactLine?: () => void;
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
  { label: 'White', hex: '#ffffff' },
  { label: 'Blue', hex: '#2563eb' },
  { label: 'Red', hex: '#dc2626' },
  { label: 'Emerald', hex: '#16a34a' },
];

export const MobileTextEditorSheet: React.FC<MobileTextEditorSheetProps> = ({
  textObject,
  activeText,
  onChangeText,
  selectedColor,
  onSelectColor,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  isUnderlined = false,
  onToggleUnderline,
  onCommit,
  onCancel,
  onDeleteLine,
  onRedactLine,
  isSubmitting = false,
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [viewportBottom, setViewportBottom] = useState<number>(0);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);

  const origColorRgb = textObject.font.color || [0, 0, 0];
  const origColorHex = `#${Math.round(origColorRgb[0] * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(origColorRgb[1] * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(origColorRgb[2] * 255)
    .toString(16)
    .padStart(2, '0')}`.toLowerCase();
  const currentColor = (selectedColor || origColorHex).toLowerCase();

  const currentSize = fontSize !== undefined ? fontSize : Math.round(textObject.font.size * 10) / 10;
  const currentFontFamily = fontFamily || textObject.font.family || 'Helvetica';
  const displayFontName = currentFontFamily.split(',')[0].replace(/['"]/g, '').trim();

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

  // Auto-focus and place cursor at end
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [textObject.id]);

  const hasChanges =
    activeText !== textObject.text ||
    (selectedColor && selectedColor.toLowerCase() !== origColorHex) ||
    (fontSize !== undefined && fontSize !== Math.round(textObject.font.size * 10) / 10) ||
    (fontFamily && fontFamily !== (textObject.font.family || 'Helvetica'));

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
        className="mobile-text-edit-sheet"
        style={{
          transform: viewportBottom > 0 ? `translateY(-${viewportBottom}px)` : undefined,
          maxHeight: viewportBottom > 0 ? `calc(100dvh - ${viewportBottom + 16}px)` : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        id="mobile-text-edit-sheet"
      >
        {/* Grab Handle */}
        <div className="mobile-sheet-handle" />

        {/* Top Action Header */}
        <div className="mobile-sheet-header">
          <button
            type="button"
            className="mobile-sheet-btn-cancel"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Cancel editing"
          >
            Cancel
          </button>

          <div className="mobile-sheet-title-group">
            <span className="mobile-sheet-title">Edit Text</span>
            <div className="mobile-sheet-font-pill">
              <span>{displayFontName}</span>
              <span className="font-pill-dot">·</span>
              <span>{currentSize} pt</span>
            </div>
          </div>

          <button
            type="button"
            className="mobile-sheet-btn-save"
            onClick={onCommit}
            disabled={isSubmitting}
            aria-label="Save changes"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="spin-fast" />
                <span>Saving</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>

        {/* Original Text Reference Snippet */}
        <div className="mobile-sheet-original-ref">
          <Quote size={13} className="mobile-sheet-ref-icon" />
          <div className="mobile-sheet-ref-content">
            <span className="mobile-sheet-ref-label">Original Text</span>
            <span className="mobile-sheet-ref-text">{textObject.text}</span>
          </div>
        </div>

        {/* Main Textarea Area */}
        <div className="mobile-sheet-input-wrapper">
          <textarea
            ref={textareaRef}
            className="mobile-sheet-textarea"
            value={activeText}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="Type replacement text..."
            rows={2}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
          />
          <div
            className="mobile-sheet-color-bar"
            style={{ backgroundColor: currentColor }}
            title={`Active Color: ${currentColor}`}
          />
        </div>

        {/* Typography Controls (Font Family, Size Stepper, Underline) */}
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
          {onFontSizeChange && (
            <div className="mobile-stepper-group">
              <button
                type="button"
                className="mobile-stepper-btn"
                onClick={() => onFontSizeChange(Math.max(6, Math.round((currentSize - 1) * 10) / 10))}
                disabled={currentSize <= 6}
                aria-label="Decrease font size"
              >
                -
              </button>
              <span className="mobile-stepper-val">{currentSize} pt</span>
              <button
                type="button"
                className="mobile-stepper-btn"
                onClick={() => onFontSizeChange(Math.min(96, Math.round((currentSize + 1) * 10) / 10))}
                disabled={currentSize >= 96}
                aria-label="Increase font size"
              >
                +
              </button>
            </div>
          )}

          {/* Underline Toggle */}
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

        {/* Font Family Selection Pills (when opened) */}
        {isFontMenuOpen && onFontFamilyChange && (
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

        {/* Bottom Tool Strip: Colors & Actions */}
        <div className="mobile-sheet-footer">
          <div className="mobile-sheet-tools-left">
            <span className="mobile-sheet-tools-label">Color:</span>
            <div className="mobile-color-preset-group">
              {COLOR_PRESETS.map((p) => {
                const isSelected = currentColor === p.hex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    type="button"
                    className={`mobile-color-preset-dot ${isSelected ? 'active' : ''}`}
                    style={{ backgroundColor: p.hex }}
                    onClick={() => onSelectColor(p.hex)}
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
                  value={currentColor}
                  onChange={(e) => onSelectColor(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                />
              </button>
            </div>
          </div>

          <div className="mobile-sheet-tools-right">
            {/* Reset Button */}
            {hasChanges && (
              <button
                type="button"
                className="mobile-sheet-btn-reset"
                onClick={() => {
                  onChangeText(textObject.text);
                  onSelectColor(origColorHex);
                  onFontSizeChange?.(Math.round(textObject.font.size * 10) / 10);
                  onFontFamilyChange?.(textObject.font.family || 'Helvetica');
                }}
                title="Reset to original"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}

            {/* Redact Line */}
            {onRedactLine && (
              <button
                type="button"
                className="mobile-sheet-btn-redact"
                onClick={onRedactLine}
                disabled={isSubmitting}
                title="Redact / Blackout"
              >
                <EyeOff size={13} />
                <span>Redact</span>
              </button>
            )}

            {/* Delete Line */}
            <button
              type="button"
              className="mobile-sheet-btn-delete"
              onClick={onDeleteLine}
              disabled={isSubmitting}
              title="Delete line"
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
