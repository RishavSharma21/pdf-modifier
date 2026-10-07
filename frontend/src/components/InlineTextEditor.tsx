import React, { useState, useRef, useEffect } from 'react';
import { Type, Bold, Underline, Trash2, EyeOff, Check, X, ChevronDown } from 'lucide-react';
import type { FontInfo } from '../types/pdf';
import { ColorPickerPopover } from './ColorPickerPopover';
import { FontPickerPopover } from './FontPickerPopover';
import { FontSizeControl } from './FontSizeControl';

interface InlineTextEditorProps {
  initialText: string;
  font: FontInfo;
  scale: number;
  color: string;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isUnderlined: boolean;
  onColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: string) => void;
  onToggleBold: () => void;
  onToggleUnderline: () => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onRedact?: () => void;
  isNew?: boolean;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  initialText,
  font,
  scale,
  color,
  fontSize,
  fontFamily,
  isBold,
  isUnderlined,
  onColorChange,
  onFontSizeChange,
  onFontFamilyChange,
  onToggleBold,
  onToggleUnderline,
  onCommit,
  onCancel,
  onDelete,
  onRedact,
  isNew = false,
}) => {
  // Local state for 0ms instantaneous, zero-lag typing!
  const [text, setText] = useState<string>(initialText);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus with cursor at end
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  const displayFontName = (fontFamily || font.family || 'Helvetica')
    .split(',')[0]
    .replace(/['"]/g, '')
    .trim();

  const fontSizePx = Math.max(fontSize * scale, 12);

  // Measure text width locally for smooth auto-expanding input width
  const approximateCharWidth = fontSizePx * 0.58;
  const contentWidth = Math.max((text.length + 2) * approximateCharWidth, 120);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="inline-text-editor-container"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Sleek Floating Formatting Capsule above the text box */}
      <div
        className="inline-text-floating-toolbar"
        id="inline-text-floating-toolbar"
      >
        {/* Font Picker */}
        <div className="floating-tool-anchor">
          <button
            type="button"
            className="floating-tool-btn font-btn"
            onClick={() => {
              setIsFontPickerOpen((v) => !v);
              setIsColorPickerOpen(false);
            }}
            title="Font Family"
            aria-label="Select font"
          >
            <Type size={13} />
            <span className="floating-font-name">{displayFontName}</span>
            <ChevronDown size={11} className="floating-chevron" />
          </button>
          <FontPickerPopover
            currentFont={fontFamily || font.family || 'Helvetica'}
            documentFont={font.family}
            onSelectFont={(fam) => {
              onFontFamilyChange(fam);
              setIsFontPickerOpen(false);
            }}
            isOpen={isFontPickerOpen}
            onClose={() => setIsFontPickerOpen(false)}
          />
        </div>

        <div className="floating-tool-divider" />

        {/* Font Size Stepper */}
        <FontSizeControl
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          min={6}
          max={96}
        />

        <div className="floating-tool-divider" />

        {/* Bold Toggle */}
        <button
          type="button"
          className={`floating-tool-btn icon-btn ${isBold ? 'active' : ''}`}
          onClick={onToggleBold}
          title="Bold (Ctrl+B)"
          aria-label="Toggle Bold"
        >
          <Bold size={13} />
        </button>

        {/* Underline Toggle */}
        <button
          type="button"
          className={`floating-tool-btn icon-btn ${isUnderlined ? 'active' : ''}`}
          onClick={onToggleUnderline}
          title="Underline (Ctrl+U)"
          aria-label="Toggle Underline"
        >
          <Underline size={13} />
        </button>

        <div className="floating-tool-divider" />

        {/* Color Picker Swatch */}
        <div className="floating-tool-anchor">
          <button
            type="button"
            className="floating-tool-btn color-btn"
            onClick={() => {
              setIsColorPickerOpen((v) => !v);
              setIsFontPickerOpen(false);
            }}
            title="Text Color"
            aria-label="Select text color"
          >
            <span
              className="floating-color-dot"
              style={{ backgroundColor: color || '#000000' }}
            />
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

        {/* Optional Actions for Existing Text */}
        {!isNew && onRedact && (
          <button
            type="button"
            className="floating-tool-btn icon-btn redact-btn"
            onClick={onRedact}
            title="Redact this text area"
            aria-label="Redact text"
          >
            <EyeOff size={13} />
          </button>
        )}

        {!isNew && onDelete && (
          <button
            type="button"
            className="floating-tool-btn icon-btn delete-btn"
            onClick={onDelete}
            title="Delete this text"
            aria-label="Delete text"
          >
            <Trash2 size={13} />
          </button>
        )}

        <div className="floating-tool-divider" />

        {/* Done / Commit Button */}
        <button
          type="button"
          className="floating-tool-btn action-commit"
          onClick={() => onCommit(text)}
          title="Save changes (Enter)"
          aria-label="Done"
        >
          <Check size={14} />
          <span>{isNew ? 'Add' : 'Done'}</span>
        </button>

        {/* Cancel Button */}
        <button
          type="button"
          className="floating-tool-btn action-cancel"
          onClick={onCancel}
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Direct In-Place Text Input Box */}
      <div
        className="inline-text-input-frame"
        style={{
          width: `${contentWidth}px`,
          minHeight: `${fontSizePx * 1.3}px`,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="inline-text-wysiwyg-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isNew ? 'Type text here…' : ''}
          style={{
            fontSize: `${fontSizePx}px`,
            fontFamily: fontFamily || font.family || 'Helvetica',
            fontWeight: isBold ? 700 : 400,
            fontStyle: font.style === 'italic' ? 'italic' : 'normal',
            textDecoration: isUnderlined ? 'underline' : 'none',
            color: color || '#000000',
            textUnderlineOffset: '2.5px',
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
};
