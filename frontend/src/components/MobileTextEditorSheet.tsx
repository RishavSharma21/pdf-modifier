import React, { useRef, useEffect, useState } from 'react';
import { X, Check, Trash2, Palette, RotateCcw, Loader2, Quote } from 'lucide-react';
import type { EditableText } from '../types/pdf';

interface MobileTextEditorSheetProps {
  textObject: EditableText;
  activeText: string;
  onChangeText: (text: string) => void;
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDeleteLine: () => void;
  isSubmitting?: boolean;
}

const COLOR_PRESETS = [
  { label: 'Black', hex: '#000000' },
  { label: 'White', hex: '#ffffff' },
  { label: 'Blue', hex: '#2563eb' },
  { label: 'Red', hex: '#dc2626' },
  { label: 'Slate', hex: '#475569' },
];

export const MobileTextEditorSheet: React.FC<MobileTextEditorSheetProps> = ({
  textObject,
  activeText,
  onChangeText,
  selectedColor,
  onSelectColor,
  onCommit,
  onCancel,
  onDeleteLine,
  isSubmitting = false,
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [viewportBottom, setViewportBottom] = useState<number>(0);

  const origColorRgb = textObject.font.color || [0, 0, 0];
  const origColorHex = `#${Math.round(origColorRgb[0] * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(origColorRgb[1] * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(origColorRgb[2] * 255)
    .toString(16)
    .padStart(2, '0')}`.toLowerCase();
  const currentColor = (selectedColor || origColorHex).toLowerCase();

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

  const hasChanges = activeText !== textObject.text || (selectedColor && selectedColor.toLowerCase() !== origColorHex);

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
        {/* Subtle Pill Grab Handle */}
        <div className="mobile-sheet-handle" />

        {/* Top Action Header: Cancel on Left, Title in Center, Save on Right */}
        <div className="mobile-sheet-header">
          <button
            type="button"
            className="mobile-sheet-btn-cancel"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Cancel editing"
          >
            <X size={16} />
            <span>Cancel</span>
          </button>

          <div className="mobile-sheet-title-group">
            <span className="mobile-sheet-title">Edit Text</span>
            <span className="mobile-sheet-subtitle">
              {textObject.font.family || 'Standard'} • {Math.round(textObject.font.size * 10) / 10} pt
            </span>
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
              <>
                <Check size={16} />
                <span>Save</span>
              </>
            )}
          </button>
        </div>

        {/* Original Text Reference Snippet */}
        <div className="mobile-sheet-original-ref">
          <Quote size={13} className="mobile-sheet-ref-icon" />
          <div className="mobile-sheet-ref-content">
            <span className="mobile-sheet-ref-label">Original:</span>
            <span className="mobile-sheet-ref-text">{textObject.text}</span>
          </div>
        </div>

        {/* Main Textarea Area with High Contrast & Color Accent */}
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
          {/* Subtle Color Indicator Accent Line */}
          <div
            className="mobile-sheet-color-bar"
            style={{ backgroundColor: currentColor }}
            title={`Active Color: ${currentColor}`}
          />
        </div>

        {/* Quick Color Presets & Actions */}
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
                }}
                title="Reset to original"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
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
