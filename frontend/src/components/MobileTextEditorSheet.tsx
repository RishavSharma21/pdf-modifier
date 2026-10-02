import React, { useRef, useEffect } from 'react';
import { X, Check, Trash2, Palette, RotateCcw, Loader2 } from 'lucide-react';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const origColorRgb = textObject.font.color || [0, 0, 0];
  const origColorHex = `#${Math.round(origColorRgb[0] * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(origColorRgb[1] * 255)
    .toString(16)
    .padStart(2, '0')}${Math.round(origColorRgb[2] * 255)
    .toString(16)
    .padStart(2, '0')}`;
  const currentColor = selectedColor || origColorHex;

  // Auto-focus and place cursor at end
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [textObject.id]);

  const hasChanges = activeText !== textObject.text || (selectedColor && selectedColor !== origColorHex);

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
        onClick={(e) => e.stopPropagation()}
        id="mobile-text-edit-sheet"
      >
        {/* Grab Handle */}
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
            <X size={18} />
            <span>Cancel</span>
          </button>

          <div className="mobile-sheet-title-group">
            <span className="mobile-sheet-title">Edit Line</span>
            <span className="mobile-sheet-subtitle">
              {textObject.font.family || 'Helvetica'} • {Math.round(textObject.font.size * 10) / 10}pt
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
                <Loader2 size={16} className="spin-fast" />
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
          <span className="mobile-sheet-ref-label">Original:</span>
          <span className="mobile-sheet-ref-text">"{textObject.text}"</span>
        </div>

        {/* Main Text Input Area */}
        <div className="mobile-sheet-input-wrapper">
          <textarea
            ref={inputRef}
            className="mobile-sheet-textarea"
            value={activeText}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="Type replacement text..."
            rows={2}
            autoFocus
            style={{ color: currentColor }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
          />
        </div>

        {/* Bottom Tool Strip: Color swatch, Reset text, Delete line */}
        <div className="mobile-sheet-footer">
          <div className="mobile-sheet-tools-left">
            {/* Color Swatch */}
            <div
              className="mobile-sheet-color-pill"
              onClick={() => colorInputRef.current?.click()}
              title={`Color: ${currentColor}`}
            >
              <span
                className="mobile-sheet-color-dot"
                style={{ backgroundColor: currentColor }}
              />
              <Palette size={13} />
              <span>Color</span>
              <input
                ref={colorInputRef}
                type="color"
                value={currentColor}
                onChange={(e) => onSelectColor(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              />
            </div>

            {/* Reset Text Button */}
            {hasChanges && (
              <button
                type="button"
                className="mobile-sheet-btn-reset"
                onClick={() => {
                  onChangeText(textObject.text);
                  onSelectColor(origColorHex);
                }}
                title="Reset to original text"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Delete Line Button */}
          <button
            type="button"
            className="mobile-sheet-btn-delete"
            onClick={onDeleteLine}
            disabled={isSubmitting}
            title="Delete this line from PDF"
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
