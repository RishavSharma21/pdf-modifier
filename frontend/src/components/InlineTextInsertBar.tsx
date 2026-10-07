import React, { useState } from 'react';
import { Type, Bold, Underline, ChevronDown, Loader2 } from 'lucide-react';
import { ColorPickerPopover } from './ColorPickerPopover';
import { FontPickerPopover } from './FontPickerPopover';
import { FontSizeControl } from './FontSizeControl';

interface InlineTextInsertBarProps {
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  isBold: boolean;
  onToggleBold: () => void;
  isUnderlined?: boolean;
  onToggleUnderline?: () => void;
  color: string;
  onColorChange: (hex: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  detectedFontFamily?: string;
  availableDocumentFonts?: string[];
  isSameAsPdf?: boolean;
  onToggleSameAsPdf?: (same: boolean) => void;
}

export const InlineTextInsertBar: React.FC<InlineTextInsertBarProps> = ({
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  isBold,
  onToggleBold,
  isUnderlined = false,
  onToggleUnderline,
  color,
  onColorChange,
  onCommit,
  onCancel,
  isSubmitting = false,
  detectedFontFamily = 'Helvetica',
  onToggleSameAsPdf,
}) => {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);

  const displayFontName = (fontFamily || detectedFontFamily || 'Helvetica').split(',')[0].replace(/['"]/g, '').trim();

  return (
    <div
      className="pdf-editor-subbar inline-text-insert-bar"
      onClick={(e) => e.stopPropagation()}
      id="inline-text-insert-bar"
    >
      {/* Left controls: Typography settings */}
      <div className="editor-subbar-left">
        <div className="subbar-icon-badge insert-text-badge">
          <Type size={15} />
        </div>

        <span className="insert-subbar-title">Add Text</span>

        <div className="subbar-divider" />

        {/* Font Family Selector Dropdown using FontPickerPopover */}
        <div className="subbar-font-anchor">
          <button
            type="button"
            className={`subbar-font-trigger ${isFontPickerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsFontPickerOpen((prev) => !prev);
              setIsColorPickerOpen(false);
            }}
            id="btn-insert-font-picker"
            aria-label="Font family"
          >
            <Type size={12} className="subbar-font-icon" />
            <span className="subbar-font-name">{displayFontName}</span>
            <ChevronDown size={12} className={`subbar-font-chevron ${isFontPickerOpen ? 'open' : ''}`} />
          </button>

          <FontPickerPopover
            currentFont={fontFamily || detectedFontFamily}
            documentFont={detectedFontFamily}
            onSelectFont={(newFamily) => {
              onFontFamilyChange(newFamily);
              onToggleSameAsPdf?.(false);
            }}
            isOpen={isFontPickerOpen}
            onClose={() => setIsFontPickerOpen(false)}
          />
        </div>

        {/* Font Size Control (Stepper + Direct Input) */}
        <FontSizeControl
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          min={8}
          max={72}
          step={2}
          idPrefix="insert"
        />

        {/* Bold & Underline Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <button
            type="button"
            className={`subbar-btn-toggle ${isBold ? 'active' : ''}`}
            onClick={onToggleBold}
            aria-label="Toggle Bold"
            id="btn-insert-bold"
          >
            <Bold size={13} />
          </button>
          {onToggleUnderline && (
            <button
              type="button"
              className={`subbar-btn-toggle ${isUnderlined ? 'active' : ''}`}
              onClick={onToggleUnderline}
              aria-label="Toggle Underline"
              id="btn-insert-underline"
            >
              <Underline size={13} />
            </button>
          )}
        </div>

        <div className="subbar-divider" />

        {/* Professional Color Swatch Picker */}
        <div className="subbar-color-anchor">
          <button
            type="button"
            className={`subbar-color-group ${isColorPickerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsColorPickerOpen((prev) => !prev);
              setIsFontPickerOpen(false);
            }}
            id="btn-insert-color-picker"
            aria-label="Text color"
          >
            <span
              className="subbar-color-preview"
              style={{ backgroundColor: color }}
            />
            <span className="subbar-color-hex-label">{color.toUpperCase()}</span>
            <ChevronDown size={12} className={`subbar-color-chevron ${isColorPickerOpen ? 'open' : ''}`} />
          </button>

          <ColorPickerPopover
            currentColor={color}
            originalColor="#000000"
            onSelectColor={(hex) => onColorChange(hex)}
            isOpen={isColorPickerOpen}
            onClose={() => setIsColorPickerOpen(false)}
          />
        </div>
      </div>

      {/* Right controls: Clean, professional Cancel & Insert actions */}
      <div className="editor-subbar-right">
        <button
          type="button"
          className="subbar-action-cancel"
          onClick={onCancel}
          disabled={isSubmitting}
          id="btn-insert-cancel"
          aria-label="Cancel text insertion"
        >
          Cancel
        </button>

        <button
          type="button"
          className="subbar-action-save"
          onClick={onCommit}
          disabled={isSubmitting}
          id="btn-insert-commit"
          aria-label="Place text into document"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={13} className="spin" />
              <span>Inserting…</span>
            </>
          ) : (
            <span>Insert</span>
          )}
        </button>
      </div>
    </div>
  );
};
