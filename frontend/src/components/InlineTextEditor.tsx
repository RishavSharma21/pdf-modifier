import React, { useState, useRef, useEffect } from 'react';
import { GripHorizontal } from 'lucide-react';
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
  initialWidth,
  initialHeight,
  onLiveChange,
  onCommit,
  onCancel,
  onRelocate,
  isNew = false,
}) => {
  const [text, setText] = useState<string>(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Auto-focus on mount and set initial word selection range if provided
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      if (initialSelectionRange && initialSelectionRange[0] <= initialSelectionRange[1]) {
        el.setSelectionRange(initialSelectionRange[0], initialSelectionRange[1]);
        requestAnimationFrame(() => {
          if (document.activeElement === el) {
            el.setSelectionRange(initialSelectionRange[0], initialSelectionRange[1]);
          }
        });
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
  // This guarantees user can drag across words to select text without the editor closing!
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
      // If pointer interaction started inside editor, user was selecting text with drag!
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

      // Formatting subbar, modals, popovers, or drag handle
      if (
        target.closest('#text-formatting-subbar') ||
        target.closest('.pdf-editor-subbar') ||
        target.closest('.color-picker-popover') ||
        target.closest('.font-family-dropdown') ||
        target.closest('.font-size-control') ||
        target.closest('.canvas-inline-drag-handle')
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

  // Dynamic multi-line width & height measurement based on text lines and font size
  const textLines = text.split('\n');

  // Exact matching font size. On mobile, clamp to at least 16px to prevent iOS Safari auto-zoom
  const fontSizePx = isMobile
    ? Math.max(Math.round(fontSize * scale * 10) / 10, 16)
    : Math.max(Math.round(fontSize * scale * 10) / 10, 10);

  const availableMaxWidth = Math.max(pageWidthPx - leftPx - 8, 40);

  // Measure exact pixel width of each line using 2D canvas context
  const maxLineWidth = React.useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSizePx}px ${fontFamily || font?.family || 'Helvetica, Arial, sans-serif'}`;
        let maxW = 0;
        for (const l of textLines) {
          const w = ctx.measureText(l).width;
          if (w > maxW) maxW = w;
        }
        return maxW;
      }
    } catch {}
    const maxLen = Math.max(...textLines.map((l) => l.length), 0);
    return maxLen * fontSizePx * 0.6;
  }, [text, fontSizePx, isBold, fontFamily, font?.family]);

  // Dynamic width: scales with longest line length AND font size
  const placeholderWidth = isNew && !text ? fontSizePx * 7.5 : 0;
  const neededWidth = Math.ceil(Math.max(maxLineWidth, placeholderWidth) + 16);
  const minWidth = isNew
    ? Math.max(Math.round(fontSizePx * 5), 80)
    : Math.min((initialWidth || 36) + 6, availableMaxWidth);

  const contentWidth = Math.min(
    Math.max(neededWidth, minWidth),
    availableMaxWidth
  );

  // Dynamic height: scales with number of lines AND font size
  const lineCount = Math.max(textLines.length, 1);
  const lineHeightPx = Math.round(fontSizePx * 1.35);
  const contentHeight = Math.max(
    lineCount * lineHeightPx + 8,
    isNew ? lineHeightPx + 8 : (initialHeight ? Math.max(initialHeight + 2, lineHeightPx + 6) : 24)
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Enter without shift commits single-line edits, or Ctrl+Enter always commits
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (!isCommittedRef.current) {
          isCommittedRef.current = true;
          onCommit(text);
        }
      } else if (!isNew && !e.shiftKey) {
        e.preventDefault();
        if (!isCommittedRef.current) {
          isCommittedRef.current = true;
          onCommit(text);
        }
      }
      // In Add Text mode, Enter naturally creates new lines, auto-expanding the box!
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isCommittedRef.current = true;
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    onLiveChange?.(val);
  };

  // Drag to move handle for new text insertion box
  const handleDragPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onRelocate) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialLeft = leftPx;
    const initialTop = topPx;

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const deltaX = moveEvt.clientX - startClientX;
      const deltaY = moveEvt.clientY - startClientY;
      const newLeft = Math.max(0, initialLeft + deltaX);
      const newTop = Math.max(0, initialTop + deltaY);
      onRelocate(newLeft, newTop);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
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
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        isPointerDownInsideRef.current = true;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target !== textareaRef.current) {
          textareaRef.current?.focus();
        }
      }}
    >
      {/* Draggable move bar for Add Text boxes */}
      {isNew && onRelocate && (
        <div
          className="canvas-inline-drag-handle"
          onPointerDown={handleDragPointerDown}
          title="Drag to relocate text box"
          style={{
            position: 'absolute',
            top: '-24px',
            left: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            background: 'var(--accent, #2563eb)',
            color: '#ffffff',
            borderRadius: '4px 4px 0 0',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'grab',
            userSelect: 'none',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.12)',
            zIndex: 70,
          }}
        >
          <GripHorizontal size={13} />
          <span>Move</span>
        </div>
      )}

      <div
        className="canvas-inline-input-frame"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <textarea
          ref={textareaRef}
          className="canvas-inline-wysiwyg-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          placeholder={isNew ? 'Type text here…' : ''}
          rows={lineCount}
          style={{
            width: '100%',
            height: '100%',
            fontSize: `${fontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            fontFamily: fontFamily || font?.family || 'Helvetica',
            fontWeight: isBold ? 700 : 400,
            fontStyle: font?.style === 'italic' ? 'italic' : 'normal',
            textDecoration: isUnderlined ? 'underline' : 'none',
            color: color || '#000000',
            textUnderlineOffset: '2px',
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre',
            padding: '2px 3px',
            margin: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            boxSizing: 'border-box',
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
