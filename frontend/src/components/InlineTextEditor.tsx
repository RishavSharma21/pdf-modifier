import React, { useState, useRef, useEffect } from 'react';
import type { FontInfo } from '../types/pdf';

export interface InlineTextEditorProps {
  initialText: string;
  font?: FontInfo;
  scale: number;
  color: string;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isUnderlined: boolean;
  leftPx: number;
  topPx: number;
  pageWidthPx: number;
  onLiveChange?: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
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
  leftPx,
  topPx,
  pageWidthPx,
  onLiveChange,
  onCommit,
  onCancel,
  isNew = false,
}) => {
  // Local state for 0ms instantaneous, zero-lag typing
  const [text, setText] = useState<string>(initialText);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep parent live ref updated without re-rendering parent
  useEffect(() => {
    onLiveChange?.(text);
  }, [text, onLiveChange]);

  // Auto-focus with cursor at end
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  const fontSizePx = Math.max(fontSize * scale, 11);

  // Strictly clamp width within PDF page bounds so text NEVER escapes the PDF
  const availableMaxWidth = Math.max(pageWidthPx - leftPx - 10, 50);
  const approximateCharWidth = fontSizePx * 0.58;
  const contentWidth = Math.min(
    Math.max((text.length + 2) * approximateCharWidth, isNew ? 100 : 36),
    availableMaxWidth
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    onLiveChange?.(val);
  };

  return (
    <div
      className="canvas-inline-text-wrapper"
      style={{
        position: 'absolute',
        left: `${leftPx}px`,
        top: `${topPx}px`,
        maxWidth: `${availableMaxWidth}px`,
        zIndex: 65,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="canvas-inline-input-frame"
        style={{
          width: `${contentWidth}px`,
          maxWidth: `${availableMaxWidth}px`,
          minHeight: `${Math.round(fontSizePx * 1.25)}px`,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="canvas-inline-wysiwyg-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isNew ? 'Type text here…' : ''}
          style={{
            fontSize: `${fontSizePx}px`,
            fontFamily: fontFamily || font?.family || 'Helvetica',
            fontWeight: isBold ? 700 : 400,
            fontStyle: font?.style === 'italic' ? 'italic' : 'normal',
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
