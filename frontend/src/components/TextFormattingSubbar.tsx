import React, { useState } from 'react';
import { Type, Bold, Underline, ChevronDown, Trash2, EyeOff, Check, X, Loader2 } from 'lucide-react';
import { ColorPickerPopover } from './ColorPickerPopover';
import { FontPickerPopover } from './FontPickerPopover';
import { FontSizeControl } from './FontSizeControl';

export interface TextFormattingSubbarProps {
  mode: 'edit' | 'insert';
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  isBold: boolean;
  onToggleBold: () => void;
  isUnderlined: boolean;
  onToggleUnderline: () => void;
  color: string;
  onColorChange: (color: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onRedact?: () => void;
  isSubmitting?: boolean;
  detectedFontFamily?: string;
}

export const TextFormattingSubbar: React.FC<TextFormattingSubbarProps> = ({
  mode,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  isBold,
  onToggleBold,
  isUnderlined,
  onToggleUnderline,
  color,
  onColorChange,
  onCommit,
  onCancel,
  onDelete,
  onRedact,
  isSubmitting = false,
  detectedFontFamily = 'Helvetica',
}) => {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);

  const displayFontName = (fontFamily || detectedFontFamily || 'Helvetica')
    .split(',')[0]
    .replace(/['"]/g, '')
    .trim();

  return (
    <div
      className="pdf-editor-subbar text-formatting-subbar"
      onClick={(e) => e.stopPropagation()}
      id="text-formatting-subbar"
    >
      {/* Left / Center: All typography tools responsive and cleanly aligned */}
      <div className="editor-subbar-left">
        {/* Mode Chip */}
        <div className={`subbar-icon-badge ${mode === 'insert' ? 'insert-text-badge' : 'edit-text-badge'}`}>
          <Type size={14} />
        </div>
        <span className="subbar-mode-title">
          {mode === 'insert' ? 'Add Text' : 'Edit Text'}
        </span>

        <div className="subbar-divider" />

        {/* Font Family Dropdown */}
        <div className="subbar-font-anchor">
          <button
            type="button"
            className={`subbar-font-trigger ${isFontPickerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsFontPickerOpen((prev) => !prev);
              setIsColorPickerOpen(false);
            }}
            id="subbar-font-picker-btn"
            aria-label="Font family"
            title="Font Family"
          >
            <Type size={12} className="subbar-font-icon" />
            <span className="subbar-font-name">{displayFontName}</span>
            <ChevronDown size={11} className={`subbar-font-chevron ${isFontPickerOpen ? 'open' : ''}`} />
          </button>

          <FontPickerPopover
            currentFont={fontFamily || detectedFontFamily}
            documentFont={detectedFontFamily}
            onSelectFont={(newFamily) => {
              onFontFamilyChange(newFamily);
              setIsFontPickerOpen(false);
            }}
            isOpen={isFontPickerOpen}
            onClose={() => setIsFontPickerOpen(false)}
          />
        </div>

        {/* Font Size Stepper */}
        <FontSizeControl
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          min={6}
          max={96}
          step={1}
          idPrefix="text-subbar"
        />

        {/* Bold & Underline Toggles */}
        <div className="subbar-style-toggles">
          <button
            type="button"
            className={`subbar-btn-toggle ${isBold ? 'active' : ''}`}
            onClick={onToggleBold}
            title="Bold (Ctrl+B)"
            aria-label="Toggle Bold"
            id="subbar-bold-btn"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            className={`subbar-btn-toggle ${isUnderlined ? 'active' : ''}`}
            onClick={onToggleUnderline}
            title="Underline (Ctrl+U)"
            aria-label="Toggle Underline"
            id="subbar-underline-btn"
          >
            <Underline size={13} />
          </button>
        </div>

        <div className="subbar-divider" />

        {/* Color Swatch Picker */}
        <div className="subbar-color-anchor">
          <button
            type="button"
            className={`subbar-color-group ${isColorPickerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsColorPickerOpen((prev) => !prev);
              setIsFontPickerOpen(false);
            }}
            id="subbar-color-picker-btn"
            title="Text Color"
            aria-label="Text color"
          >
            <span
              className="subbar-color-swatch-circle"
              style={{ backgroundColor: color || '#000000' }}
            />
            <ChevronDown size={11} className="subbar-color-chevron" />
          </button>

          <ColorPickerPopover
            currentColor={color || '#000000'}
            originalColor="#000000"
            onSelectColor={(hex) => {
              onColorChange(hex);
            }}
            isOpen={isColorPickerOpen}
            onClose={() => setIsColorPickerOpen(false)}
          />
        </div>

        {/* Redact & Delete actions for existing text */}
        {mode === 'edit' && (
          <>
            <div className="subbar-divider" />
            {onRedact && (
              <button
                type="button"
                className="subbar-action-tool subbar-redact-tool"
                onClick={onRedact}
                title="Redact this text area"
                aria-label="Redact text"
              >
                <EyeOff size={13} />
                <span className="subbar-action-label">Redact</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="subbar-action-tool subbar-delete-tool"
                onClick={onDelete}
                title="Delete this line"
                aria-label="Delete text"
              >
                <Trash2 size={13} />
                <span className="subbar-action-label">Delete</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Right: Commit & Cancel Actions */}
      <div className="editor-subbar-right">
        <button
          type="button"
          className="subbar-action-cancel"
          onClick={onCancel}
          disabled={isSubmitting}
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <X size={13} />
          <span>Cancel</span>
        </button>

        <button
          type="button"
          className="subbar-action-save"
          onClick={onCommit}
          disabled={isSubmitting}
          title="Save changes (Enter)"
          aria-label="Done"
        >
          {isSubmitting ? (
            <Loader2 size={13} className="spin" />
          ) : (
            <Check size={14} />
          )}
          <span>{mode === 'insert' ? 'Add' : 'Done'}</span>
        </button>
      </div>
    </div>
  );
};
