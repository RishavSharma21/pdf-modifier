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
  initialWidth?: number;
  initialHeight?: number;
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
  initialWidth,
  initialHeight,
  onLiveChange,
  onCommit,
  onCancel,
  isNew = false,
}) => {
  // Local state for 0ms instantaneous, zero-lag typing
  const [text, setText] = useState<string>(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Keep parent live ref updated without re-rendering parent
  useEffect(() => {
    onLiveChange?.(text);
  }, [text, onLiveChange]);

  // Auto-focus on mount and scroll smoothly above virtual keyboard on mobile
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      if (isMobile) {
        const timer = setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isMobile]);

  // Exact matching font size. On mobile, clamp to at least 16px to prevent iOS Safari auto-zoom
  const fontSizePx = isMobile
    ? Math.max(Math.round(fontSize * scale * 10) / 10, 16)
    : Math.max(Math.round(fontSize * scale * 10) / 10, 10);

  // Strictly clamp width within PDF page bounds so text NEVER escapes the PDF
  const availableMaxWidth = Math.max(pageWidthPx - leftPx - 8, 40);
  const approxCharWidth = fontSizePx * 0.58;
  const measuredWidth = Math.round((text.length + 1) * approxCharWidth);
  const minWidth = initialWidth
    ? Math.min(initialWidth + 6, availableMaxWidth)
    : (isNew ? (isMobile ? 140 : 110) : 36);

  const contentWidth = Math.min(
    Math.max(measuredWidth, minWidth),
    availableMaxWidth
  );

  const contentHeight = initialHeight
    ? Math.max(initialHeight + 2, fontSizePx * 1.25)
    : Math.max(fontSizePx * 1.35, isMobile ? 32 : 20);

  const isCommittedRef = useRef<boolean>(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isCommittedRef.current) {
        isCommittedRef.current = true;
        onCommit(text);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isCommittedRef.current = true;
      onCancel();
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    // Don't auto-commit if the user clicked inside the text formatting subbar
    if (related && (related.closest('#text-formatting-subbar') || related.closest('.canvas-inline-text-wrapper'))) {
      return;
    }
    setTimeout(() => {
      if (!isCommittedRef.current) {
        isCommittedRef.current = true;
        if (text.trim()) {
          onCommit(text);
        } else if (isNew) {
          onCancel();
        } else {
          onCommit(text);
        }
      }
    }, 120);
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
        width: `${contentWidth}px`,
        height: `${contentHeight}px`,
        maxWidth: `${availableMaxWidth}px`,
        zIndex: 65,
      }}
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
      }}
    >
      <div
        className="canvas-inline-input-frame"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="canvas-inline-wysiwyg-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={isNew ? 'Type text here…' : ''}
          style={{
            width: '100%',
            height: '100%',
            fontSize: `${fontSizePx}px`,
            fontFamily: fontFamily || font?.family || 'Helvetica',
            fontWeight: isBold ? 700 : 400,
            fontStyle: font?.style === 'italic' ? 'italic' : 'normal',
            textDecoration: isUnderlined ? 'underline' : 'none',
            color: color || '#000000',
            textUnderlineOffset: '2px',
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
