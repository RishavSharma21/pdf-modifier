import React, { useState, useRef, useEffect } from 'react';
import { GripHorizontal } from 'lucide-react';
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
  onRelocate?: (newLeftPx: number, newTopPx: number) => void;
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
  onRelocate,
  isNew = false,
}) => {
  const [text, setText] = useState<string>(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isCommittedRef = useRef<boolean>(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Keep parent live ref updated without re-rendering parent
  useEffect(() => {
    onLiveChange?.(text);
  }, [text, onLiveChange]);

  // Auto-focus on mount
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      if (isNew) {
        el.setSelectionRange(0, 0);
      }
      if (isMobile) {
        const timer = setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isMobile, isNew]);

  // Click outside listener: commits on background click, ignores subbars / modals / other words
  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
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

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [text, isNew, onCommit, onCancel]);

  // Font size calculation
  const fontSizePx = isMobile
    ? Math.max(Math.round(fontSize * scale * 10) / 10, 16)
    : Math.max(Math.round(fontSize * scale * 10) / 10, 10);

  // Clamp width within PDF page bounds
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
      onClick={(e) => {
        e.stopPropagation();
        if (e.target !== inputRef.current) {
          inputRef.current?.focus();
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
