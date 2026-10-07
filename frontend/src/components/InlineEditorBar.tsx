import React, { useState } from 'react';
import { Trash2, Loader2, ChevronDown, EyeOff, Underline, Type } from 'lucide-react';
import type { EditableText } from '../types/pdf';
import { ColorPickerPopover } from './ColorPickerPopover';
import { FontPickerPopover } from './FontPickerPopover';
import { FontSizeControl } from './FontSizeControl';

interface InlineEditorBarProps {
  textObject: EditableText;
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  fontSize: number;
  onFontSizeChange: (newSize: number) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDeleteLine: () => void;
  onRedactLine?: () => void;
  isSubmitting?: boolean;
  isUnderlined?: boolean;
  onToggleUnderline?: () => void;
  onAddTextClick?: () => void;
}

export const InlineEditorBar: React.FC<InlineEditorBarProps> = ({
  textObject,
  selectedColor,
  onSelectColor,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  onCommit,
  onCancel,
  onDeleteLine,
  onRedactLine,
  isSubmitting = false,
  isUnderlined = false,
  onToggleUnderline,
  onAddTextClick,
}) => {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState<boolean>(false);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState<boolean>(false);

  const origColorRgb = textObject.font.color || [0, 0, 0];
  const origColorHex = `#${Math.round(origColorRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origColorRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origColorRgb[2] * 255).toString(16).padStart(2, '0')}`;
  const currentColor = selectedColor || origColorHex;
  const currentFontFamily = fontFamily || textObject.font.family || 'Helvetica';
  const displayFontName = currentFontFamily.split(',')[0].replace(/['"]/g, '').trim();

  return (
    <div
      className="pdf-editor-subbar"
      onClick={(e) => e.stopPropagation()}
      id="pdf-editor-subbar"
    >
      {/* Left controls: Color, font family, font size stepper, formatting, redact, delete */}
      <div className="editor-subbar-left">
        {/* Professional Color Swatch Picker */}
        <div className="subbar-color-anchor">
          <button
            type="button"
            className={`subbar-color-group ${isColorPickerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsColorPickerOpen((prev) => !prev);
              setIsFontPickerOpen(false);
            }}
            id="btn-subbar-color-picker"
            aria-label="Text color"
          >
            <span
              className="subbar-color-preview"
              style={{ backgroundColor: currentColor }}
            />
            <span className="subbar-color-hex-label">{currentColor.toUpperCase()}</span>
            <ChevronDown size={12} className={`subbar-color-chevron ${isColorPickerOpen ? 'open' : ''}`} />
          </button>

          <ColorPickerPopover
            currentColor={currentColor}
            originalColor={origColorHex}
            onSelectColor={(hex) => {
              onSelectColor(hex);
            }}
            isOpen={isColorPickerOpen}
            onClose={() => setIsColorPickerOpen(false)}
          />
        </div>

        <div className="subbar-divider" />

        {/* Professional Typography Font Dropdown */}
        <div className="subbar-font-anchor">
          <button
            type="button"
            className={`subbar-font-trigger ${isFontPickerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsFontPickerOpen((prev) => !prev);
              setIsColorPickerOpen(false);
            }}
            id="btn-subbar-font-picker"
            aria-label="Font family"
          >
            <Type size={12} className="subbar-font-icon" />
            <span className="subbar-font-name">{displayFontName}</span>
            <ChevronDown size={12} className={`subbar-font-chevron ${isFontPickerOpen ? 'open' : ''}`} />
          </button>

          <FontPickerPopover
            currentFont={currentFontFamily}
            documentFont={textObject.font.family}
            onSelectFont={(newFamily) => {
              onFontFamilyChange(newFamily);
            }}
            isOpen={isFontPickerOpen}
            onClose={() => setIsFontPickerOpen(false)}
          />
        </div>

        {/* Font Size Control (Stepper + Direct Input) */}
        <FontSizeControl
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          min={6}
          max={96}
          idPrefix="subbar"
        />

        {/* Font Style Indicators & Underline Toggle */}
        <div className="subbar-font-tags">
          {textObject.font.weight === 'bold' && <span className="subbar-tag">B</span>}
          {textObject.font.style === 'italic' && <span className="subbar-tag">I</span>}
          {onToggleUnderline && (
            <button
              type="button"
              className={`subbar-tag-btn ${isUnderlined ? 'active' : ''}`}
              onClick={onToggleUnderline}
              aria-label="Toggle Underline"
              id="btn-subbar-underline"
            >
              <Underline size={11} />
            </button>
          )}
        </div>

        <div className="subbar-divider" />

        {/* Redact / Blackout Line Button */}
        {onRedactLine && (
          <button
            type="button"
            className="subbar-btn subbar-btn-redact"
            onClick={onRedactLine}
            disabled={isSubmitting}
            aria-label="Redact text"
            id="btn-subbar-redact"
          >
            <EyeOff size={15} />
          </button>
        )}

        {/* Delete Line Button */}
        <button
          type="button"
          className="subbar-btn subbar-btn-delete"
          onClick={onDeleteLine}
          disabled={isSubmitting}
          aria-label="Delete line"
          id="btn-subbar-delete"
        >
          <Trash2 size={15} />
        </button>

        {/* Add Text Quick Action on Subbar */}
        {onAddTextClick && (
          <>
            <div className="subbar-divider" />
            <button
              type="button"
              className="subbar-btn subbar-btn-add-text"
              onClick={onAddTextClick}
              aria-label="Add text"
              id="btn-subbar-add-text-inline"
            >
              <Type size={13} />
              <span>Add Text</span>
            </button>
          </>
        )}
      </div>

      {/* Right controls: Clean, professional Cancel & Save actions */}
      <div className="editor-subbar-right">
        <button
          type="button"
          className="subbar-action-cancel"
          onClick={onCancel}
          disabled={isSubmitting}
          id="btn-subbar-cancel"
          aria-label="Cancel editing"
        >
          Cancel
        </button>

        <button
          type="button"
          className="subbar-action-save"
          onClick={onCommit}
          disabled={isSubmitting}
          id="btn-subbar-save"
          aria-label="Save changes"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={13} className="spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save</span>
          )}
        </button>
      </div>
    </div>
  );
};
