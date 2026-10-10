import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Move, Check, X } from 'lucide-react';
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
  origin?: [number, number];
  onLiveChange?: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onRelocate?: (newLeftPx: number, newTopPx: number) => void;
  isNew?: boolean;
}

/**
 * Resolve any PDF font name into standard web/system font families so bold (700)
 * and normal (400) font weights render cleanly and visibly in the browser.
 */
function resolveCssFontFamily(fontName?: string): string {
  if (!fontName) return 'Helvetica, Arial, sans-serif';
  const clean = fontName.replace(/['"]/g, '').trim();
  const lower = clean.toLowerCase();
  if (lower.includes('times')) {
    return `"${clean}", "Times New Roman", Times, Georgia, serif`;
  }
  if (lower.includes('courier')) {
    return `"${clean}", "Courier New", Courier, monospace`;
  }
  if (lower.includes('calibri')) {
    return `"${clean}", Calibri, Candara, Arial, sans-serif`;
  }
  if (lower.includes('segoe')) {
    return `"${clean}", "Segoe UI", Arial, sans-serif`;
  }
  if (lower.includes('georgia')) {
    return `"${clean}", Georgia, Cambria, serif`;
  }
  if (lower.includes('verdana')) {
    return `"${clean}", Verdana, Geneva, sans-serif`;
  }
  if (lower.includes('arial') || lower.includes('helvetica')) {
    return `"${clean}", Arial, Helvetica, sans-serif`;
  }
  return `"${clean}", Helvetica, Arial, sans-serif`;
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
  origin,
  onLiveChange,
  onCommit,
  onCancel,
  onRelocate,
  isNew = false,
}) => {
  const [text, setText] = useState<string>(initialText);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isCommittedRef = useRef<boolean>(false);
  const isPointerDownInsideRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const [coords, setCoords] = useState<{ x: number; y: number }>({
    x: Math.round(leftPx / scale),
    y: Math.round(topPx / scale),
  });
  const finalPosRef = useRef<{ left: number; top: number }>({ left: leftPx, top: topPx });

  useEffect(() => {
    finalPosRef.current = { left: leftPx, top: topPx };
    setCoords({ x: Math.round(leftPx / scale), y: Math.round(topPx / scale) });
  }, [leftPx, topPx, scale]);

  // Sync state if initialText changes
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  // Keep parent live ref updated without re-rendering parent
  useEffect(() => {
    onLiveChange?.(text);
  }, [text, onLiveChange]);

  // Auto-focus on mount with preventScroll to eliminate laggy viewport jumps
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      if (initialSelectionRange && initialSelectionRange[0] <= initialSelectionRange[1]) {
        el.setSelectionRange(initialSelectionRange[0], initialSelectionRange[1]);
        const timer = setTimeout(() => {
          if (document.activeElement === el) {
            el.setSelectionRange(initialSelectionRange[0], initialSelectionRange[1]);
          }
        }, 20);
        return () => clearTimeout(timer);
      } else if (isNew) {
        el.setSelectionRange(0, 0);
      }
    }
  }, [isNew, initialSelectionRange]);

  // Safe outside click listener: only commits when pointerdown AND pointerup happen outside
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (isDraggingRef.current || (wrapperRef.current && wrapperRef.current.contains(target))) {
        isPointerDownInsideRef.current = true;
        return;
      }
      isPointerDownInsideRef.current = false;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingRef.current) return;

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
        target.closest('.pro-font-popover') ||
        target.closest('.font-family-dropdown') ||
        target.closest('.font-size-control') ||
        target.closest('.canvas-inline-drag-header') ||
        target.closest('.canvas-inline-side-grab')
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

  // Buttery-smooth 60fps drag to reposition text without triggering heavy PDF re-renders during mouse move
  const handleDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    isPointerDownInsideRef.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = finalPosRef.current.left;
    const initialTop = finalPosRef.current.top;

    const onPointerMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = ev.clientX - startX;
      const deltaY = ev.clientY - startY;
      const nextLeft = Math.max(0, Math.min(initialLeft + deltaX, pageWidthPx - 50));
      const nextTop = Math.max(0, initialTop + deltaY);
      finalPosRef.current = { left: nextLeft, top: nextTop };
      if (wrapperRef.current) {
        wrapperRef.current.style.left = `${nextLeft}px`;
        wrapperRef.current.style.top = `${nextTop}px`;
      }
      setCoords({ x: Math.round(nextLeft / scale), y: Math.round(nextTop / scale) });
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      setTimeout(() => {
        isPointerDownInsideRef.current = false;
      }, 60);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      onRelocate?.(finalPosRef.current.left, finalPosRef.current.top);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Exact matching font size. On mobile, clamp to at least 16px to prevent iOS Safari auto-zoom
  const fontSizePx = isMobile
    ? Math.max(Math.round(fontSize * scale * 10) / 10, 16)
    : Math.max(Math.round(fontSize * scale * 10) / 10, 10);

  const availableMaxWidth = Math.max(pageWidthPx - leftPx - 8, 40);
  const resolvedFamily = useMemo(
    () => resolveCssFontFamily(fontFamily || font?.family),
    [fontFamily, font?.family]
  );

  // Split into lines for multi-line support
  const lines = useMemo(() => {
    const raw = text || (isNew ? 'Type text here…' : '');
    return raw.split('\n');
  }, [text, isNew]);
  const lineCount = Math.max(lines.length, 1);
  const longestLine = useMemo(() => {
    return lines.reduce((longest, curr) => (curr.length > longest.length ? curr : longest), '');
  }, [lines]);

  // Exact pixel measurement of the longest line using 2D canvas context
  const textWidth = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSizePx}px ${resolvedFamily}`;
        return ctx.measureText(longestLine || (isNew ? 'Type text here…' : '')).width;
      }
    } catch {}
    const len = longestLine.length;
    return len * fontSizePx * 0.6;
  }, [longestLine, fontSizePx, isBold, resolvedFamily, isNew]);

  // Dynamic width & height calculations
  // For Add Text (isNew): comfortable typing padding with auto-expansion
  // For in-place editing (!isNew): zero-displacement exact baseline alignment
  const textInsetX = isNew ? 6 : 1;

  // Exact baseline preservation:
  // In PDF typography, origin[1] is the exact baseline Y.
  // Distance from bbox top to baseline:
  const baselineOffsetPx = useMemo(() => {
    if (origin && origin[1] !== undefined) {
      return (origin[1] * scale) - topPx;
    }
    return initialHeight ? (initialHeight * 0.80) : (fontSizePx * 0.82);
  }, [origin, scale, topPx, initialHeight, fontSizePx]);

  // For in-place editing (!isNew):
  // Line-height is fontSizePx (1.0em em-box, zero half-leading!).
  // Font ascent in web typography is ~0.78 * fontSizePx.
  // To place the textarea glyphs at exactly baselineOffsetPx:
  // paddingTop + 0.78 * fontSizePx = baselineOffsetPx
  // => textInsetY = Math.max(0, baselineOffsetPx - (fontSizePx * 0.78))
  const textInsetY = isNew
    ? 4
    : Math.max(0, Math.round((baselineOffsetPx - (fontSizePx * 0.78)) * 10) / 10);

  const paddingAllowance = isNew ? 24 : 4;
  const minWidth = isNew
    ? 96
    : (initialWidth ? Math.min(initialWidth, availableMaxWidth) : 24);
  const contentWidth = Math.min(
    Math.max(Math.ceil(textWidth + paddingAllowance), minWidth),
    availableMaxWidth
  );

  const lineHeightPx = isNew
    ? Math.max(Math.round(fontSizePx * 1.25), 18)
    : Math.round(fontSizePx); // 1.0em line height eliminates vertical half-leading shift!

  const contentHeight = isNew
    ? (lineCount * lineHeightPx + textInsetY * 2)
    : (initialHeight || Math.round(fontSizePx * 1.15));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Pixel-perfect precision nudging using Ctrl/Alt + Arrow keys
    if ((e.ctrlKey || e.altKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let nextLeft = finalPosRef.current.left;
      let nextTop = finalPosRef.current.top;
      if (e.key === 'ArrowUp') nextTop = Math.max(0, nextTop - step);
      if (e.key === 'ArrowDown') nextTop = Math.max(0, nextTop + step);
      if (e.key === 'ArrowLeft') nextLeft = Math.max(0, nextLeft - step);
      if (e.key === 'ArrowRight') nextLeft = Math.min(pageWidthPx - 50, nextLeft + step);
      finalPosRef.current = { left: nextLeft, top: nextTop };
      if (wrapperRef.current) {
        wrapperRef.current.style.left = `${nextLeft}px`;
        wrapperRef.current.style.top = `${nextTop}px`;
      }
      setCoords({ x: Math.round(nextLeft / scale), y: Math.round(nextTop / scale) });
      onRelocate?.(nextLeft, nextTop);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
          try {
            inputRef.current?.focus({ preventScroll: true });
          } catch {
            inputRef.current?.focus();
          }
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Side Move Grab Handle for Effortless Dragging */}
      {isNew && (
        <div
          className="canvas-inline-side-grab"
          onPointerDown={handleDragStart}
          title="Drag to reposition text (Ctrl+Arrows to nudge)"
        >
          <Move size={11} />
        </div>
      )}

      {/* Sleek Floating Drag Header for Add Text mode with live coordinates */}
      {isNew && (
        <div
          className="canvas-inline-drag-header"
          onPointerDown={handleDragStart}
          title="Drag to reposition text (Ctrl+Arrows to nudge)"
        >
          <Move size={12} className="canvas-inline-drag-icon" />
          <span className="canvas-inline-drag-label">Drag to move</span>
          <span className="canvas-inline-coord-badge">
            {coords.x}, {coords.y}
          </span>
          <span className="canvas-inline-nudge-hint">Ctrl+Arrows</span>
          <div style={{ width: 4 }} />
          <button
            type="button"
            className="canvas-inline-header-btn btn-commit-done"
            title="Place text (Enter)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCommittedRef.current) {
                isCommittedRef.current = true;
                onCommit(text);
              }
            }}
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            className="canvas-inline-header-btn"
            title="Cancel (Esc)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              isCommittedRef.current = true;
              onCancel();
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Crisp Editing Box Frame */}
      <div
        className={`canvas-inline-input-frame ${isNew ? 'is-new-box' : 'is-inline-edit'}`}
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <textarea
          ref={inputRef}
          rows={isNew ? lineCount : 1}
          className="canvas-inline-wysiwyg-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onDoubleClick={(e) => {
            e.stopPropagation();
          }}
          placeholder={isNew ? 'Type text here…' : ''}
          style={{
            width: '100%',
            height: '100%',
            fontSize: `${fontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            fontFamily: resolvedFamily,
            fontWeight: isBold ? 700 : 400,
            fontStyle: font?.style === 'italic' ? 'italic' : 'normal',
            textDecoration: isUnderlined ? 'underline' : 'none',
            color: color || '#000000',
            textUnderlineOffset: '2px',
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre',
            background: 'transparent',
            outline: 'none',
            border: 'none',
            padding: `${textInsetY}px ${textInsetX}px`,
            margin: 0,
            boxSizing: 'border-box',
            display: 'block',
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />

        {/* Elegant Corner Anchors for Placed Elements */}
        {isNew && (
          <>
            <span className="canvas-inline-corner-node canvas-inline-corner-nw" />
            <span className="canvas-inline-corner-node canvas-inline-corner-ne" />
            <span className="canvas-inline-corner-node canvas-inline-corner-se" />
            <span className="canvas-inline-corner-node canvas-inline-corner-sw" />
          </>
        )}
      </div>
    </div>
  );
};
