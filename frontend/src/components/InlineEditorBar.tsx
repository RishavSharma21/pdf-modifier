import React, { useRef } from 'react';
import { Type, Trash2, Loader2, Palette } from 'lucide-react';
import type { EditableText } from '../types/pdf';

interface InlineEditorBarProps {
  textObject: EditableText;
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDeleteLine: () => void;
  isSubmitting?: boolean;
}

export const InlineEditorBar: React.FC<InlineEditorBarProps> = ({
  textObject,
  selectedColor,
  onSelectColor,
  onCommit,
  onCancel,
  onDeleteLine,
  isSubmitting = false,
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const origColorRgb = textObject.font.color || [0, 0, 0];
  const origColorHex = `#${Math.round(origColorRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origColorRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origColorRgb[2] * 255).toString(16).padStart(2, '0')}`;
  const currentColor = selectedColor || origColorHex;

  return (
    <div
      className="pdf-editor-subbar"
      onClick={(e) => e.stopPropagation()}
      id="pdf-editor-subbar"
    >
      {/* Left controls: Text metadata, color, delete */}
      <div className="editor-subbar-left">
        <div className="subbar-icon-badge" title="Editing Text Line">
          <Type size={15} />
        </div>

        {/* Color Swatch Picker */}
        <div
          className="subbar-color-group"
          onClick={() => colorInputRef.current?.click()}
          title={`Text Color: ${currentColor} (Click to change)`}
        >
          <span
            className="subbar-color-preview"
            style={{ backgroundColor: currentColor }}
          />
          <Palette size={13} className="subbar-color-icon" />
          <input
            ref={colorInputRef}
            type="color"
            value={currentColor}
            onChange={(e) => onSelectColor(e.target.value)}
            className="subbar-color-hidden-input"
          />
        </div>

        <div className="subbar-divider" />

        {/* Font Family & Size Pill */}
        <div className="subbar-font-info">
          <span className="subbar-font-name">{textObject.font.family || 'Helvetica'}</span>
          <span className="subbar-font-dot">•</span>
          <span className="subbar-font-size">{Math.round(textObject.font.size * 10) / 10} pt</span>
        </div>

        {/* Font Style Indicators */}
        {(textObject.font.weight === 'bold' || textObject.font.style === 'italic') && (
          <div className="subbar-font-tags">
            {textObject.font.weight === 'bold' && <span className="subbar-tag">B</span>}
            {textObject.font.style === 'italic' && <span className="subbar-tag">I</span>}
          </div>
        )}

        <div className="subbar-divider" />

        {/* Delete Line Button */}
        <button
          type="button"
          className="subbar-btn subbar-btn-delete"
          onClick={onDeleteLine}
          disabled={isSubmitting}
          title="Delete this text line from PDF"
          id="btn-subbar-delete"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Right controls: Cancel, Save & Close */}
      <div className="editor-subbar-right">
        <span className="subbar-kbd-hint">
          <kbd>↵</kbd> save <span className="subbar-kbd-sep">•</span> <kbd>Esc</kbd> cancel
        </span>

        <button
          type="button"
          className="subbar-btn subbar-btn-cancel"
          onClick={onCancel}
          disabled={isSubmitting}
          title="Discard changes (Esc)"
          id="btn-subbar-cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          className="subbar-btn subbar-btn-save"
          onClick={onCommit}
          disabled={isSubmitting}
          title="Apply edit to PDF (Enter)"
          id="btn-subbar-save"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save &amp; Close</span>
          )}
        </button>
      </div>
    </div>
  );
};

