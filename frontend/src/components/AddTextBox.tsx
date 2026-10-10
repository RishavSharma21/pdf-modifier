import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GripHorizontal, Check, Trash2, Move } from 'lucide-react';

export interface AddTextBoxProps {
  initialText: string;
  x: number; // in PDF points
  y: number; // in PDF points
  pageNum: number;
  scale: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  isUnderlined: boolean;
  color: string;
  pageWidth: number; // in PDF points
  pageHeight: number; // in PDF points
  onLiveChange?: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onRelocate: (newX: number, newY: number) => void;
}

/**
 * Resolve any PDF font name into standard web/system font families.
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

export const AddTextBox: React.FC<AddTextBoxProps> = ({
  initialText,
  x,
  y,
  scale,
  fontSize,
  fontFamily,
  fontWeight,
  isUnderlined,
  color,
  pageWidth,
  pageHeight,
  onLiveChange,
  onCommit,
  onCancel,
  onRelocate,
}) => {
  const [text, setText] = useState<string>(initialText);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({
    x: Math.round(x),
    y: Math.round(y),
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<{ x: number; y: number }>({ x, y });
  const isCommittedRef = useRef<boolean>(false);
  const isPointerDownInsideRef = useRef<boolean>(false);

  // Sync incoming coordinates
  useEffect(() => {
    posRef.current = { x, y };
    setCoords({ x: Math.round(x), y: Math.round(y) });
    if (wrapperRef.current) {
      wrapperRef.current.style.left = `${x * scale}px`;
      wrapperRef.current.style.top = `${y * scale}px`;
    }
  }, [x, y, scale]);

  // Sync text updates
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    onLiveChange?.(text);
  }, [text, onLiveChange]);

  // Focus textarea on mount without causing viewport scroll jumps
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const resolvedFamily = useMemo(() => resolveCssFontFamily(fontFamily), [fontFamily]);
  const fontSizePx = Math.max(Math.round(fontSize * scale * 10) / 10, 10);
  const lineHeightPx = Math.max(Math.round(fontSizePx * 1.25), 18);

  const lines = useMemo(() => {
    const raw = text || 'Type text here…';
    return raw.split('\n');
  }, [text]);
  const lineCount = Math.max(lines.length, 1);
  const longestLine = useMemo(() => {
    return lines.reduce((longest, curr) => (curr.length > longest.length ? curr : longest), '');
  }, [lines]);

  // Measure text width using 2D canvas
  const textWidth = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontWeight === 'bold' ? 'bold' : 'normal'} ${fontSizePx}px ${resolvedFamily}`;
        return ctx.measureText(longestLine || 'Type text here…').width;
      }
    } catch {}
    return (longestLine.length || 15) * fontSizePx * 0.6;
  }, [longestLine, fontSizePx, fontWeight, resolvedFamily]);

  const textInsetX = 1;
  // Match exact backend insertion baseline (0.85 * fontSize):
  const baselineOffsetPx = fontSizePx * 0.85;
  const textInsetY = Math.max(0, Math.round((baselineOffsetPx - (fontSizePx * 0.78)) * 10) / 10);
  const maxAllowedWidthPx = Math.max((pageWidth - x) * scale - 4, 60);
  const boxWidthPx = customWidth
    ? Math.min(Math.max(customWidth, 60), maxAllowedWidthPx)
    : Math.min(Math.max(Math.ceil(textWidth + 12), 90), maxAllowedWidthPx);
  const boxHeightPx = Math.max(lineCount * lineHeightPx, 18);
  const isNearTop = (y * scale) < 44;

  // Commit text helper
  const handleCommit = useCallback(() => {
    if (isCommittedRef.current) return;
    isCommittedRef.current = true;
    const trimmed = text.trim();
    if (trimmed) {
      onCommit(text);
    } else {
      onCancel();
    }
  }, [text, onCommit, onCancel]);

  // Safe outside click listener
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
      if (isDragging) return;
      if (isPointerDownInsideRef.current) {
        isPointerDownInsideRef.current = false;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Inside subbar, formatting dropdowns, color picker, etc.
      if (
        target.closest('#text-formatting-subbar') ||
        target.closest('.pdf-editor-subbar') ||
        target.closest('.color-picker-popover') ||
        target.closest('.pro-font-popover') ||
        target.closest('.font-family-dropdown') ||
        target.closest('.font-size-control') ||
        target.closest('.pro-add-text-header') ||
        target.closest('.pro-add-text-handle')
      ) {
        return;
      }

      // If user clicked another part of the PDF page, let onNewTextBoxRequest relocate it
      if (target.closest('.pdf-page-wrapper')) {
        return;
      }

      handleCommit();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, handleCommit]);

  // 60 FPS Lag-Free Dragging using direct DOM translation
  const handleDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    isPointerDownInsideRef.current = true;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = posRef.current.x;
    const startY = posRef.current.y;

    const onPointerMove = (ev: PointerEvent) => {
      const deltaX = (ev.clientX - startClientX) / scale;
      const deltaY = (ev.clientY - startClientY) / scale;
      const nextX = Math.round(Math.max(10, Math.min(startX + deltaX, pageWidth - 40)));
      const nextY = Math.round(Math.max(10, Math.min(startY + deltaY, pageHeight - 20)));

      posRef.current = { x: nextX, y: nextY };
      if (wrapperRef.current) {
        wrapperRef.current.style.left = `${nextX * scale}px`;
        wrapperRef.current.style.top = `${nextY * scale}px`;
      }
      setCoords({ x: nextX, y: nextY });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      setTimeout(() => {
        isPointerDownInsideRef.current = false;
      }, 50);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      onRelocate(posRef.current.x, posRef.current.y);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Keyboard navigation & precision nudging
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Precision nudging with Arrow keys (Ctrl / Alt)
    if (
      (e.ctrlKey || e.altKey) &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let nextX = posRef.current.x;
      let nextY = posRef.current.y;

      if (e.key === 'ArrowUp') nextY = Math.max(10, nextY - step);
      if (e.key === 'ArrowDown') nextY = Math.min(pageHeight - 20, nextY + step);
      if (e.key === 'ArrowLeft') nextX = Math.max(10, nextX - step);
      if (e.key === 'ArrowRight') nextX = Math.min(pageWidth - 40, nextX + step);

      posRef.current = { x: nextX, y: nextY };
      if (wrapperRef.current) {
        wrapperRef.current.style.left = `${nextX * scale}px`;
        wrapperRef.current.style.top = `${nextY * scale}px`;
      }
      setCoords({ x: nextX, y: nextY });
      onRelocate(nextX, nextY);
      return;
    }

    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        e.preventDefault();
        handleCommit();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isCommittedRef.current = true;
      onCancel();
    }
  };

  // Width resize handle
  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isPointerDownInsideRef.current = true;
    const startClientX = e.clientX;
    const initialW = boxWidthPx;

    const onPointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startClientX;
      const nextW = Math.max(80, Math.min(initialW + deltaX, maxAllowedWidthPx));
      setCustomWidth(nextW);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      {/* Dynamic Alignment Crosshairs during Dragging (Canva / Figma style) */}
      {isDragging && (
        <div className="pro-add-text-guidelines" style={{ pointerEvents: 'none' }}>
          {/* Horizontal alignment guideline across entire page */}
          <div
            className="pro-add-text-guide-h"
            style={{
              position: 'absolute',
              top: `${posRef.current.y * scale}px`,
              left: 0,
              right: 0,
              height: '1px',
              borderTop: '1px dashed #3b82f6',
              zIndex: 70,
              opacity: 0.85,
            }}
          />
          {/* Vertical alignment guideline across entire page */}
          <div
            className="pro-add-text-guide-v"
            style={{
              position: 'absolute',
              left: `${posRef.current.x * scale}px`,
              top: 0,
              bottom: 0,
              width: '1px',
              borderLeft: '1px dashed #3b82f6',
              zIndex: 70,
              opacity: 0.85,
            }}
          />
        </div>
      )}

      {/* Main Movable Text Box Container */}
      <div
        ref={wrapperRef}
        className={`pro-add-text-box-container ${isDragging ? 'is-dragging' : ''}`}
        style={{
          position: 'absolute',
          left: `${x * scale}px`,
          top: `${y * scale}px`,
          width: `${boxWidthPx}px`,
          height: `${boxHeightPx}px`,
          zIndex: 80,
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target !== textareaRef.current) {
            try {
              textareaRef.current?.focus({ preventScroll: true });
            } catch {
              textareaRef.current?.focus();
            }
          }
        }}
      >
        {/* Floating Apple/Figma Island Control Header */}
        <div
          className="pro-add-text-header"
          style={{
            top: isNearTop ? 'auto' : '-34px',
            bottom: isNearTop ? '-34px' : 'auto',
          }}
          onPointerDown={handleDragStart}
          title="Drag anywhere to move text (Ctrl+Arrows to nudge)"
        >
          <div className="pro-add-text-drag-grip">
            <GripHorizontal size={13} className="drag-grip-icon" />
            <span className="drag-grip-label">Move</span>
          </div>

          <div className="pro-add-text-coord-chip">
            {coords.x}, {coords.y}
          </div>

          <span className="pro-add-text-nudge-hint">Ctrl+Arrows</span>

          <div className="pro-add-text-header-actions">
            <button
              type="button"
              className="pro-add-text-btn btn-place"
              title="Place text (Enter)"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleCommit();
              }}
            >
              <Check size={12} strokeWidth={2.5} />
              <span>Place</span>
            </button>
            <button
              type="button"
              className="pro-add-text-btn btn-cancel"
              title="Cancel (Esc)"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                isCommittedRef.current = true;
                onCancel();
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Side Grab Move Handle */}
        <div
          className="pro-add-text-side-handle"
          onPointerDown={handleDragStart}
          title="Click & drag to reposition"
        >
          <Move size={12} />
        </div>

        {/* Crisp Movable Box Frame - 100% Transparent */}
        <div
          className="pro-add-text-frame"
          onPointerDown={(e) => {
            // If clicking near border edges, initiate drag
            if (e.target !== textareaRef.current) {
              handleDragStart(e);
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            boxSizing: 'border-box',
            background: 'transparent',
          }}
        >
          <textarea
            ref={textareaRef}
            rows={lineCount}
            className="pro-add-text-input"
            value={text}
            onChange={(e) => {
              const val = e.target.value;
              setText(val);
              onLiveChange?.(val);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type text here…"
            style={{
              width: '100%',
              height: '100%',
              fontSize: `${fontSizePx}px`,
              lineHeight: `${lineHeightPx}px`,
              fontFamily: resolvedFamily,
              fontWeight: fontWeight === 'bold' ? 700 : 400,
              textDecoration: isUnderlined ? 'underline' : 'none',
              color: color || '#000000',
              padding: `${textInsetY}px ${textInsetX}px`,
              margin: 0,
              boxSizing: 'border-box',
              display: 'block',
              resize: 'none',
              outline: 'none',
              border: 'none',
              background: 'transparent',
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
          />

          {/* 4 Corner Anchors for Precision Framing */}
          <span className="pro-box-corner corner-nw" />
          <span className="pro-box-corner corner-ne" />
          <span className="pro-box-corner corner-se" />
          <span className="pro-box-corner corner-sw" />

          {/* Right-Edge Resizer Handle */}
          <div
            className="pro-add-text-width-resizer"
            onPointerDown={handleResizeStart}
            title="Drag to adjust width"
          />
        </div>
      </div>
    </>
  );
};
