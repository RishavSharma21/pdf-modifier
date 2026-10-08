import React, { useState, useRef, useEffect } from 'react';
import type { FontInfo } from '../types/pdf';

export interface InlineTextEditorProps {
  initialText: string;
  initialSelectionRange?: [number, number];
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
  onRelocate?: (newLeftPx: number, newTopPx: number) => void;
  isNew?: boolean;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  initialText,
  initialSelectionRange,
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
  initialWidth: _initialWidth,
  initialHeight,
  onLiveChange,
  onCommit,
  onCancel,
  isNew = false,
}) => {
  const [text, setText] = useState<string>(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isCommittedRef = useRef<boolean>(false);
  const isPointerDownInsideRef = useRef<boolean>(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Sync state if initialText changes
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  // Keep parent live ref updated without re-rendering parent
  useEffect(() => {
    onLiveChange?.(text);
  }, [text, onLiveChange]);

  // Auto-focus on mount and auto-select clicked word if provided
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      if (initialSelectionRange && initialSelectionRange[0] <= initialSelectionRange[1]) {
        el.setSelectionRange(initialSelectionRange[0], initialSelectionRange[1]);
        // Guard against browser default click caret reset
        const timer = setTimeout(() => {
          if (document.activeElement === el) {
            el.setSelectionRange(initialSelectionRange[0], initialSelectionRange[1]);
          }
        }, 20);
        return () => clearTimeout(timer);
      } else if (isNew) {
        el.setSelectionRange(0, 0);
      }
      if (isMobile) {
        const timer = setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isMobile, isNew, initialSelectionRange]);

  // Safe outside click listener: only commits when pointerdown AND pointerup happen outside
  // Ensures mouse dragging to select text across the box never prematurely commits or unmounts the editor!
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (wrapperRef.current && wrapperRef.current.contains(target)) {
        isPointerDownInsideRef.current = true;
        return;
      }
      isPointerDownInsideRef.current = false;
    };

    const handlePointerUp = (e: PointerEvent) => {
      // If pointer interaction started inside editor, user was selecting text with mouse drag!
      if (isPointerDownInsideRef.current) {
        isPointerDownInsideRef.current = false;
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Inside editor
      if (wrapperRef.current && wrapperRef.current.contains(target)) {
        return;
      }

      // Formatting subbar, modals, popovers
      if (
        target.closest('#text-formatting-subbar') ||
        target.closest('.pdf-editor-subbar') ||
        target.closest('.color-picker-popover') ||
        target.closest('.font-family-dropdown') ||
        target.closest('.font-size-control')
      ) {
        return;
      }

      // If clicked on an editable text span, let that span's click handler handle the commit & switch
      if (target.closest('.editable-span-overlay')) {
        return;
      }

      // In Add Text mode with empty text: if clicking inside PDF page, let onNewTextBoxRequest relocate it
      if (isNew && !text.trim() && target.closest('.pdf-page-wrapper')) {
        return;
      }

      if (!isCommittedRef.current) {
        isCommittedRef.current = true;
        if (isNew) {
          if (text.trim()) {
            onCommit(text);
          } else {
            onCancel();
          }
        } else {
          onCommit(text);
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [text, isNew, onCommit, onCancel]);

  // Exact matching font size. On mobile, clamp to at least 16px to prevent iOS Safari auto-zoom
  const fontSizePx = isMobile
    ? Math.max(Math.round(fontSize * scale * 10) / 10, 16)
    : Math.max(Math.round(fontSize * scale * 10) / 10, 10);

  const availableMaxWidth = Math.max(pageWidthPx - leftPx - 8, 40);

  // Exact pixel measurement using 2D canvas context
  const textWidth = React.useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSizePx}px ${fontFamily || font?.family || 'Helvetica, Arial, sans-serif'}`;
        return ctx.measureText(text || (isNew ? 'Type text here…' : '')).width;
      }
    } catch {}
    const len = (text || (isNew ? 'Type text here…' : '')).length;
    return len * fontSizePx * 0.6;
  }, [text, fontSizePx, isBold, fontFamily, font?.family, isNew]);

  // Dynamic width: expands when typing text, contracts when deleting text, scales with font size!
  const paddingAllowance = 16;
  const contentWidth = Math.min(
    Math.max(Math.ceil(textWidth + paddingAllowance), isNew ? 90 : 36),
    availableMaxWidth
  );

  // Dynamic height: scales with font size
  const contentHeight = Math.max(
    Math.round(fontSizePx * 1.35),
    isMobile ? 32 : (initialHeight ? Math.max(initialHeight + 2, 22) : 22)
  );

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    onLiveChange?.(val);
  };

  return (
    <div
      ref={wrapperRef}
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
        if (e.target !== inputRef.current) {
          inputRef.current?.focus();
        }
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
