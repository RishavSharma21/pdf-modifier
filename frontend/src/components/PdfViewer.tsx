import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EditableText, ImageObject, PageMeta } from '../types/pdf';
import { InlineEditorBar } from './InlineEditorBar';
import { InlineTextEditor } from './InlineTextEditor';
import { ImageEditorSubbar } from './ImageEditorSubbar';
import { ImageCropModal } from './ImageCropModal';
import { Image as ImageIcon, Type } from 'lucide-react';
import { useToast } from './Toast';

// Set up worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Helper: map font attributes to CSS
const getFontTypography = (font: any) => {
  const clean = (font.family || '').toLowerCase().trim();
  const isBold = font.weight === 'bold' || /bold|heavy|black/i.test(clean);
  const isItalic = font.style === 'italic' || /italic|oblique/i.test(clean);

  let family = 'sans-serif';
  if (/times|georgia|serif|garamond|minion/i.test(clean)) {
    family = '"Times New Roman", Times, Georgia, serif';
  } else if (/helvetica|arial|sans/i.test(clean)) {
    family = 'Arial, Helvetica, sans-serif';
  } else if (/courier|mono|code|consolas/i.test(clean)) {
    family = '"Courier New", Courier, monospace';
  } else if (/segoe/i.test(clean)) {
    family = '"Segoe UI", Tahoma, sans-serif';
  } else if (/georgia/i.test(clean)) {
    family = 'Georgia, serif';
  }

  return {
    family,
    fontWeight: isBold ? 700 : 400,
    fontStyle: (isItalic ? 'italic' : 'normal') as 'italic' | 'normal',
  };
};

// Word-level search highlight calculator
const computeWordHighlights = (
  text: string,
  query: string,
  font: any,
  totalBoxWidth: number,
  scale: number
): Array<{ left: number; width: number }> => {
  if (!query || !query.trim() || !text) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const qLen = lowerQuery.length;
  if (qLen === 0) return [];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const typo = getFontTypography(font || {});
  const isItalic = typo.fontStyle === 'italic';
  const isBold = typo.fontWeight >= 700;
  const fontSize = Math.max((font?.size || 10) * scale, 1);
  ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${fontSize}px ${typo.family}`;

  const measuredTotal = ctx.measureText(text).width || 1;
  const ratio = (totalBoxWidth * scale) / measuredTotal;

  const highlights: Array<{ left: number; width: number }> = [];
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
    const beforeStr = text.substring(0, pos);
    const matchStr = text.substring(pos, pos + qLen);
    const beforeW = ctx.measureText(beforeStr).width * ratio;
    const matchW = ctx.measureText(matchStr).width * ratio;

    highlights.push({
      left: Math.max(0, beforeW - 0.5),
      width: Math.max(matchW + 1, 8),
    });
    pos += qLen;
  }
  return highlights;
};

export interface ImageAdjustmentState {
  x: number;
  y: number;
  width: number;
  height: number;
  replacementFile: File | Blob | null;
  previewUrl: string | null;
  cropBox: any | null;
  isModified: boolean;
}

// ---------------------------------------------------------------------------
// Single PDF Page Component (Stacked continuously in the document)
// ---------------------------------------------------------------------------
interface PdfPageItemProps {
  pageNum: number;
  pageMeta?: PageMeta;
  totalPages: number;
  pdfDoc: any;
  scale: number;
  editableObjects: EditableText[];
  imageObjects: ImageObject[];
  activeObj: EditableText | null;
  activeText: string;
  activeColor: string;
  selectedImage: ImageObject | null;
  adjustmentState: ImageAdjustmentState | null;
  activeSnapshotUrl: string | null;
  activeMatchKey: string | null;
  allSearchMatchIds?: string[];
  searchQuery?: string;
  onStartEdit: (obj: EditableText) => void;
  onSelectImageWithSnapshot: (img: ImageObject, snapshotUrl: string | null) => void;
  onPointerDownImage: (
    e: React.PointerEvent,
    type: 'move' | 'nw' | 'ne' | 'se' | 'sw'
  ) => void;
  isAddTextMode?: boolean;
  isUnderlined?: boolean;
  activeFontSize?: number;
  activeFontFamily?: string;
  pendingInsert?: {
    x: number;
    y: number;
    pageNum: number;
    text: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    fontFamily: string;
    color: string;
    isUnderlined: boolean;
  } | null;
  modifiedPage?: number | null;
  onNewTextBoxRequest?: (x: number, y: number, pageNum: number) => void;
  onCommitPendingText?: (overrideText?: string) => void;
  onCancelPendingText?: () => void;
  onCommitEdit?: (newText: string) => void;
  onCancelEdit?: () => void;
  onDeleteLine?: () => void;
  onRedactLine?: () => void;
  onColorChange?: (hex: string) => void;
  onFontSizeChange?: (size: number) => void;
  onFontFamilyChange?: (fam: string) => void;
  onToggleUnderline?: () => void;
  onUpdatePendingColor?: (color: string) => void;
  onUpdatePendingFontSize?: (size: number) => void;
  onUpdatePendingFontFamily?: (family: string) => void;
  onTogglePendingBold?: () => void;
  onTogglePendingUnderline?: () => void;
}

const PdfPageItem: React.FC<PdfPageItemProps> = ({
  pageNum,
  pageMeta,
  totalPages,
  pdfDoc,
  scale,
  editableObjects,
  imageObjects,
  activeObj,
  activeText,
  activeColor,
  activeFontSize,
  activeFontFamily,
  selectedImage,
  adjustmentState,
  activeSnapshotUrl,
  activeMatchKey,
  allSearchMatchIds,
  searchQuery,
  onStartEdit,
  onSelectImageWithSnapshot,
  onPointerDownImage,
  isAddTextMode = false,
  isUnderlined = false,
  pendingInsert,
  modifiedPage,
  onNewTextBoxRequest,
  onCommitPendingText,
  onCancelPendingText,
  onCommitEdit,
  onCancelEdit,
  onDeleteLine,
  onRedactLine,
  onColorChange,
  onFontSizeChange,
  onFontFamilyChange,
  onToggleUnderline,
  onUpdatePendingColor,
  onUpdatePendingFontSize,
  onUpdatePendingFontFamily,
  onTogglePendingBold,
  onTogglePendingUnderline,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchHandledRef = useRef<boolean>(false);
  const [isNearViewport, setIsNearViewport] = useState<boolean>(pageNum <= 4);
  const [isRendered, setIsRendered] = useState<boolean>(false);
  const renderedDocRef = useRef<any>(null);
  const renderedScaleRef = useRef<number>(scale);
  const renderedRotationRef = useRef<number>(pageMeta?.rotation ?? 0);

  // Exact dimensions calculated from PageMeta so scrollbar height is physically 100% accurate
  const baseWidth = pageMeta?.width || 595.28;
  const baseHeight = pageMeta?.height || 841.89;
  const targetWidthPx = Math.round(baseWidth * scale);
  const targetHeightPx = Math.round(baseHeight * scale);

  // IntersectionObserver to lazy-render pages near the viewport (blazing fast, buttery 60fps)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const viewportEl = el.closest('.canvas-viewport') || null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsNearViewport(true);
          }
        });
      },
      { root: viewportEl, rootMargin: '1800px 0px 1800px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render Page on Canvas via PDF.js with double-buffering
  useEffect(() => {
    if (!isNearViewport || !pdfDoc || !canvasRef.current) return;

    // If already rendered at this scale, and a document edit occurred on a DIFFERENT page (and rotation unchanged), skip re-render!
    if (
      isRendered &&
      renderedDocRef.current !== pdfDoc &&
      renderedScaleRef.current === scale &&
      renderedRotationRef.current === (pageMeta?.rotation ?? 0) &&
      modifiedPage !== null &&
      modifiedPage !== undefined &&
      modifiedPage !== pageNum
    ) {
      renderedDocRef.current = pdfDoc;
      return;
    }

    let renderTask: any = null;
    let isCancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const pageRotation = pageMeta?.rotation ?? 0;
        const viewport = page.getViewport({ scale, rotation: pageRotation });

        // iOS Safari and mobile devices have strict canvas memory & dimension limits (max 4096px, 12MP total area).
        // Standard iPhone DPR is 3.0, which at 1.5-2.0 scale produces ~18-32MP canvases that iOS Safari silently drops.
        const isIOS =
          typeof navigator !== 'undefined' &&
          (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
        const maxDpr = isIOS ? 1.5 : 2.0;
        let outputScale = Math.min(window.devicePixelRatio || 1, maxDpr);

        let w = Math.floor(viewport.width * outputScale);
        let h = Math.floor(viewport.height * outputScale);

        // Hardware safety clamp for iOS Safari WebKit
        const MAX_DIM = isIOS ? 4096 : 8192;
        const MAX_AREA = isIOS ? 12_000_000 : 16_777_216;
        if (w > MAX_DIM || h > MAX_DIM || w * h > MAX_AREA) {
          const downscale = Math.min(MAX_DIM / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h)));
          outputScale *= downscale;
          w = Math.floor(viewport.width * outputScale);
          h = Math.floor(viewport.height * outputScale);
        }

        let offscreen: HTMLCanvasElement | null = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) {
          offscreen.width = 0;
          offscreen.height = 0;
          offscreen = null;
          return;
        }
        offCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        renderTask = page.render({ canvasContext: offCtx, viewport });
        await renderTask.promise;
        if (isCancelled) {
          offscreen.width = 0;
          offscreen.height = 0;
          offscreen = null;
          return;
        }

        const visibleCanvas = canvasRef.current;
        if (!visibleCanvas) {
          offscreen.width = 0;
          offscreen.height = 0;
          offscreen = null;
          return;
        }
        if (visibleCanvas.width !== w || visibleCanvas.height !== h) {
          visibleCanvas.width = w;
          visibleCanvas.height = h;
          visibleCanvas.style.width = Math.floor(viewport.width) + 'px';
          visibleCanvas.style.height = Math.floor(viewport.height) + 'px';
        }

        const visibleCtx = visibleCanvas.getContext('2d');
        if (visibleCtx) {
          visibleCtx.setTransform(1, 0, 0, 1, 0, 0);
          visibleCtx.drawImage(offscreen, 0, 0);
        }

        // CRITICAL FOR IOS SAFARI: Immediately release offscreen GPU backing store!
        offscreen.width = 0;
        offscreen.height = 0;
        offscreen = null;

        renderedDocRef.current = pdfDoc;
        renderedScaleRef.current = scale;
        renderedRotationRef.current = pageRotation;
        setIsRendered(true);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      } finally {
        if (!isCancelled) {
          setIsRendered(true);
        }
      }
    };

    render();
    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [isNearViewport, pdfDoc, pageNum, scale, pageMeta?.rotation, modifiedPage]);

  // Filter text & image objects belonging to this page
  const pageObjects = editableObjects.filter((o) => (o.pageNumber || 1) === pageNum);
  const pageImages = imageObjects.filter((img: any) => (img.pageNumber || 1) === pageNum);

  return (
    <div
      className={`pdf-page-wrapper ${isAddTextMode ? 'is-add-text-mode' : ''}`}
      ref={containerRef}
      id={`pdf-page-${pageNum}`}
      data-page-num={pageNum}
      style={{
        width: `${targetWidthPx}px`,
        height: `${targetHeightPx}px`,
        cursor: isAddTextMode ? 'crosshair' : 'default',
      }}
      onTouchStart={(e) => {
        if (isAddTextMode && e.touches.length === 1) {
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }}
      onTouchEnd={(e) => {
        if (isAddTextMode && onNewTextBoxRequest && touchStartRef.current && e.changedTouches.length === 1) {
          const touch = e.changedTouches[0];
          const dist = Math.hypot(touch.clientX - touchStartRef.current.x, touch.clientY - touchStartRef.current.y);
          if (dist < 15) {
            touchHandledRef.current = true;
            setTimeout(() => {
              touchHandledRef.current = false;
            }, 450);
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              const clickX = Math.round(((touch.clientX - rect.left) / scale) * 10) / 10;
              const clickY = Math.round(((touch.clientY - rect.top) / scale) * 10) / 10;
              onNewTextBoxRequest(clickX, clickY, pageNum);
            }
          }
          touchStartRef.current = null;
        }
      }}
      onClick={(e) => {
        if (touchHandledRef.current) return;
        if (isAddTextMode && onNewTextBoxRequest) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const clickX = Math.round(((e.clientX - rect.left) / scale) * 10) / 10;
            const clickY = Math.round(((e.clientY - rect.top) / scale) * 10) / 10;
            onNewTextBoxRequest(clickX, clickY, pageNum);
          }
        }
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('.editable-span-overlay') ||
          target.closest('.image-box-overlay') ||
          target.closest('.active-inline-editor-wrapper') ||
          target.closest('.insert-text-canvas-wrapper')
        ) {
          return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && onNewTextBoxRequest) {
          const clickX = Math.round(((e.clientX - rect.left) / scale) * 10) / 10;
          const clickY = Math.round(((e.clientY - rect.top) / scale) * 10) / 10;
          onNewTextBoxRequest(clickX, clickY, pageNum);
        }
      }}
    >
      {/* Page Number Badge (clean document separation like Google Drive) */}
      <div className="page-number-tag">
        Page {pageNum} of {totalPages}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="pdf-canvas"
        id={`pdf-canvas-${pageNum}`}
        style={{
          width: `${targetWidthPx}px`,
          height: `${targetHeightPx}px`,
        }}
      />

      {/* Rich document skeleton with animated shimmer wave while page is loading */}
      {!isRendered && (
        <div className="page-paper-placeholder">
          <div className="skeleton-shimmer-wave" />
          <div className="skeleton-content-mock">
            <div className="skeleton-line skeleton-title" style={{ width: '42%' }} />
            <div className="skeleton-line skeleton-subtitle" style={{ width: '65%' }} />
            <div className="skeleton-gap" />
            <div className="skeleton-line skeleton-p1" />
            <div className="skeleton-line skeleton-p2" />
            <div className="skeleton-line skeleton-p3" />
            <div className="skeleton-gap" />
            <div className="skeleton-line skeleton-p2" />
            <div className="skeleton-line skeleton-p1" />
            <div className="skeleton-gap" />
            <div className="skeleton-line skeleton-p3" />
            <div className="skeleton-line skeleton-p2" />
            <div className="skeleton-gap" />
            <div className="skeleton-line skeleton-p1" />
            <div className="skeleton-line skeleton-p3" />
          </div>
          <div className="placeholder-page-label">Page {pageNum}</div>
        </div>
      )}

      {/* Interactive Image / Logo Overlays */}
      {pageImages.map((img) => {
        const bbox = img.boundingBox;
        const isSelected = selectedImage?.id === img.id;

        const curX = isSelected && adjustmentState ? adjustmentState.x : bbox.x;
        const curY = isSelected && adjustmentState ? adjustmentState.y : bbox.y;
        const curW = isSelected && adjustmentState ? adjustmentState.width : bbox.width;
        const curH = isSelected && adjustmentState ? adjustmentState.height : bbox.height;

        const left = curX * scale;
        const top = curY * scale;
        const width = curW * scale;
        const height = curH * scale;

        const isMovedOrReplaced = isSelected && (
          Math.abs(curX - bbox.x) > 0.5 ||
          Math.abs(curY - bbox.y) > 0.5 ||
          Math.abs(curW - bbox.width) > 0.5 ||
          Math.abs(curH - bbox.height) > 0.5 ||
          Boolean(adjustmentState?.replacementFile)
        );

        return (
          <React.Fragment key={img.id}>
            {/* White cover mask over original location to prevent ghosting/double-image bleed-through when moved or replaced */}
            {isMovedOrReplaced && (
              <div
                style={{
                  position: 'absolute',
                  left: `${bbox.x * scale}px`,
                  top: `${bbox.y * scale}px`,
                  width: `${bbox.width * scale}px`,
                  height: `${bbox.height * scale}px`,
                  background: '#ffffff',
                  border: '1.5px dashed #94a3b8',
                  borderRadius: '2px',
                  zIndex: 25,
                  pointerEvents: 'none',
                  boxSizing: 'border-box',
                }}
              />
            )}

            <div
              className={`image-object-overlay ${isSelected ? 'selected-image' : ''}`}
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: isSelected ? 35 : 15,
                cursor: isSelected ? 'move' : 'pointer',
                touchAction: isSelected ? 'none' : 'auto',
                background: isSelected ? '#ffffff' : undefined,
                boxSizing: 'border-box',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSelected) {
                  // Capture snapshot of this logo from the rendered canvas for smooth dragging/cropping
                  let snap: string | null = null;
                  const canvas = canvasRef.current;
                  if (canvas) {
                    try {
                      const dpr = window.devicePixelRatio || 1;
                      const sx = bbox.x * scale * dpr;
                      const sy = bbox.y * scale * dpr;
                      const sw = bbox.width * scale * dpr;
                      const sh = bbox.height * scale * dpr;
                      if (sw > 0 && sh > 0) {
                        const off = document.createElement('canvas');
                        off.width = Math.max(Math.round(sw), 1);
                        off.height = Math.max(Math.round(sh), 1);
                        const ctx = off.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, off.width, off.height);
                          snap = off.toDataURL('image/png');
                        }
                      }
                    } catch {}
                  }
                  onSelectImageWithSnapshot(img, snap);
                }
              }}
              onPointerDown={(e) => {
                if (isSelected) {
                  onPointerDownImage(e, 'move');
                }
              }}
            >
              {/* Visual preview of moving / replaced / cropped logo */}
              {isSelected && (adjustmentState?.previewUrl || activeSnapshotUrl) && (
                <img
                  src={adjustmentState?.previewUrl || activeSnapshotUrl || ''}
                  alt="Logo preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    background: '#ffffff',
                    borderRadius: '2px',
                    display: 'block',
                  }}
                  draggable={false}
                />
              )}

              <div className="image-badge">
                <ImageIcon size={10} />
                <span>Logo</span>
              </div>

              {isSelected && (
                <>
                  {/* 4 Corner Drag & Proportional Resize Handles */}
                  <div
                    className="resize-handle-corner resize-handle-nw"
                    onPointerDown={(e) => onPointerDownImage(e, 'nw')}
                    title="Drag to resize"
                  />
                  <div
                    className="resize-handle-corner resize-handle-ne"
                    onPointerDown={(e) => onPointerDownImage(e, 'ne')}
                    title="Drag to resize"
                  />
                  <div
                    className="resize-handle-corner resize-handle-se"
                    onPointerDown={(e) => onPointerDownImage(e, 'se')}
                    title="Drag to resize"
                  />
                  <div
                    className="resize-handle-corner resize-handle-sw"
                    onPointerDown={(e) => onPointerDownImage(e, 'sw')}
                    title="Drag to resize"
                  />
                </>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {/* Interactive Text Run Overlay Boxes for Click-to-Edit */}
      {pageObjects.map((obj) => {
        const isEditing = activeObj?.id === obj.id;
        const bbox = obj.boundingBox || (obj as any).bounding_box;
        const bboxLeft = bbox.x * scale;
        const bboxTop = bbox.y * scale;
        const bboxWidth = bbox.width * scale;
        const bboxHeight = bbox.height * scale;

        if (isEditing) {
          const origRgb = obj.font.color || [0, 0, 0];
          const origHex = `#${Math.round(origRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[2] * 255).toString(16).padStart(2, '0')}`;
          const curColor = activeColor || origHex;

          return (
            <div
              key={obj.id}
              style={{
                position: 'absolute',
                left: `${bboxLeft}px`,
                top: `${bboxTop}px`,
                zIndex: 60,
              }}
            >
              <InlineTextEditor
                initialText={activeText}
                font={obj.font}
                scale={scale}
                color={curColor}
                fontSize={activeFontSize || obj.font?.size || 12}
                fontFamily={activeFontFamily || obj.font?.family || 'Helvetica'}
                isBold={obj.font?.weight === 'bold'}
                isUnderlined={isUnderlined}
                onColorChange={(hex) => onColorChange?.(hex)}
                onFontSizeChange={(size) => onFontSizeChange?.(size)}
                onFontFamilyChange={(fam) => onFontFamilyChange?.(fam)}
                onToggleBold={() => {}}
                onToggleUnderline={() => onToggleUnderline?.()}
                onCommit={(txt) => onCommitEdit?.(txt)}
                onCancel={() => onCancelEdit?.()}
                onDelete={onDeleteLine}
                onRedact={onRedactLine}
                isNew={false}
              />
            </div>
          );
        }

        const activeObjId = activeMatchKey ? activeMatchKey.split('__occ_')[0] : null;
        const isMatching = allSearchMatchIds?.includes(obj.id) ?? false;
        const isActiveLine = activeObjId === obj.id;

        const bboxW = obj.boundingBox?.width || (obj as any).bounding_box?.width || 0;
        const wordHighlights = isMatching && searchQuery
          ? computeWordHighlights(obj.text, searchQuery, obj.font, bboxW, scale)
          : [];

        return (
          <div
            key={obj.id}
            className={`editable-span-overlay ${isActiveLine ? 'search-match-active' : ''} ${isMatching ? 'search-match-other' : ''}`}
            style={{
              position: 'absolute',
              left: `${bboxLeft}px`,
              top: `${bboxTop}px`,
              width: `${Math.max(bboxWidth, 24)}px`,
              height: `${Math.max(bboxHeight, 16)}px`,
              zIndex: 25,
              pointerEvents: 'auto',
            }}
            onClick={(e) => {
              if (touchHandledRef.current) return;
              if (isAddTextMode) {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect && onNewTextBoxRequest) {
                  const clickX = Math.round(((e.clientX - rect.left) / scale) * 10) / 10;
                  const clickY = Math.round(((e.clientY - rect.top) / scale) * 10) / 10;
                  onNewTextBoxRequest(clickX, clickY, pageNum);
                }
                return;
              }
              e.stopPropagation();
              onStartEdit(obj);
            }}
            id={`editable-${obj.id}`}
          >
            {wordHighlights.map((hl, occIdx) => {
              const matchKey = `${obj.id}__occ_${occIdx}`;
              const isActiveWord = activeMatchKey === matchKey;
              return (
                <span
                  key={occIdx}
                  className={`search-word-highlight ${isActiveWord ? 'active-word-match' : 'secondary-word-match'}`}
                  style={{
                    left: `${hl.left}px`,
                    width: `${hl.width}px`,
                  }}
                />
              );
            })}
          </div>
        );
      })}

      {/* Active New Text Insertion Box on Canvas */}
      {pendingInsert && pendingInsert.pageNum === pageNum && (
        <div
          style={{
            position: 'absolute',
            left: `${pendingInsert.x * scale}px`,
            top: `${pendingInsert.y * scale}px`,
            zIndex: 60,
          }}
        >
          <InlineTextEditor
            initialText={pendingInsert.text}
            font={{
              family: pendingInsert.fontFamily,
              size: pendingInsert.fontSize,
              weight: pendingInsert.fontWeight,
              style: 'normal',
              color: [0, 0, 0],
              embedded: false,
              subsetted: false,
              isCid: false,
            }}
            scale={scale}
            color={pendingInsert.color}
            fontSize={pendingInsert.fontSize}
            fontFamily={pendingInsert.fontFamily}
            isBold={pendingInsert.fontWeight === 'bold'}
            isUnderlined={pendingInsert.isUnderlined}
            onColorChange={(hex) => onUpdatePendingColor?.(hex)}
            onFontSizeChange={(size) => onUpdatePendingFontSize?.(size)}
            onFontFamilyChange={(fam) => onUpdatePendingFontFamily?.(fam)}
            onToggleBold={() => onTogglePendingBold?.()}
            onToggleUnderline={() => onTogglePendingUnderline?.()}
            onCommit={(txt) => onCommitPendingText?.(txt)}
            onCancel={() => onCancelPendingText?.()}
            isNew={true}
          />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Continuous Multi-Page PDF Viewer Component
// ---------------------------------------------------------------------------
interface PdfViewerProps {
  pdfUrl: string;
  pdfDoc?: any;
  onPdfDocLoaded?: (doc: any) => void;
  currentPage: number;
  totalPages?: number;
  pages?: PageMeta[];
  scale: number;
  editableObjects: EditableText[];
  imageObjects?: ImageObject[];
  isProcessing?: boolean;
  forceSkeleton?: boolean;
  activeMatchKey?: string | null;
  allSearchMatchIds?: string[];
  searchQuery?: string;
  modifiedPage?: number | null;
  onPageChange?: (page: number, shouldScroll?: boolean) => void;
  onCommitEdit: (
    originalText: string,
    newText: string,
    color?: string,
    targetTextId?: string,
    boundingBox?: any,
    origin?: [number, number],
    pageNumber?: number,
    underlined?: boolean,
    fontSize?: number,
    fontFamily?: string
  ) => Promise<void>;
  onDeleteImage?: (boundingBox: any, pageNumber?: number) => Promise<void>;
  onReplaceImage?: (boundingBox: any, file: File) => Promise<void>;
  onAdjustImage?: (
    originalBoundingBox: any,
    newBoundingBox: any,
    file?: File | Blob | null,
    cropBox?: any,
    pageNumber?: number
  ) => Promise<void>;
  onRedactArea?: (boundingBox: any, pageNumber?: number) => Promise<void>;
  onActiveEditChange?: (isEditing: boolean) => void;
  isAddTextMode?: boolean;
  onToggleAddText?: () => void;
  onInsertText?: (
    text: string,
    x: number,
    y: number,
    pageNumber?: number,
    fontSize?: number,
    fontWeight?: string,
    fontFamily?: string,
    color?: string,
    underlined?: boolean
  ) => Promise<void>;
  onExitAddTextMode?: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  pdfDoc: externalPdfDoc,
  onPdfDocLoaded,
  currentPage,
  totalPages,
  pages,
  scale,
  editableObjects,
  imageObjects = [],
  isProcessing = false,
  forceSkeleton: _forceSkeleton = false,
  activeMatchKey,
  allSearchMatchIds,
  searchQuery,
  modifiedPage,
  onPageChange,
  onCommitEdit,
  onDeleteImage,
  onReplaceImage,
  onAdjustImage,
  onRedactArea,
  onActiveEditChange,
  isAddTextMode = false,
  onToggleAddText,
  onInsertText,
  onExitAddTextMode,
}) => {
  const { showToast } = useToast();
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(externalPdfDoc || null);
  const [activeFontFamily, setActiveFontFamily] = useState<string>('Helvetica');

  // Sync external pdfDoc
  useEffect(() => {
    if (externalPdfDoc) {
      setPdfDoc(externalPdfDoc);
    }
  }, [externalPdfDoc]);

  // Active in-place editing state
  const [activeObj, setActiveObj] = useState<EditableText | null>(null);
  const [activeText, setActiveText] = useState<string>('');
  const [activeColor, setActiveColor] = useState<string>('');
  const [activeFontSize, setActiveFontSize] = useState<number>(10);

  // Screen size check for mobile-first interaction
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Selected Image & Transformation State
  const [selectedImage, setSelectedImage] = useState<ImageObject | null>(null);
  const [adjustmentState, setAdjustmentState] = useState<ImageAdjustmentState | null>(null);
  const [activeSnapshotUrl, setActiveSnapshotUrl] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [dismissedScannedPages, setDismissedScannedPages] = useState<Set<number>>(new Set());
  const [isUnderlined, setIsUnderlined] = useState<boolean>(false);

  // Helper to extract clean human-readable font family name
  const cleanPdfFontFamily = (raw?: string): string => {
    if (!raw) return 'Helvetica';
    let name = raw.split('+').pop() || raw;
    name = name.replace(/-(Bold|Italic|BoldItalic|Regular|MT|PS|Roman|SemiBold|Light)/gi, '');
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    if (/helv/i.test(name)) return 'Helvetica';
    if (/arial/i.test(name)) return 'Arial';
    if (/times/i.test(name)) return 'Times New Roman';
    if (/cour/i.test(name)) return 'Courier';
    return name || 'Helvetica';
  };

  const [pendingInsert, setPendingInsert] = useState<{
    x: number;
    y: number;
    pageNum: number;
    text: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    fontFamily: string;
    color: string;
    isUnderlined: boolean;
    detectedFontFamily?: string;
    availableDocumentFonts?: string[];
    isSameAsPdf?: boolean;
  } | null>(null);

  const handleNewTextBoxRequest = (x: number, y: number, pageNum: number) => {
    setActiveObj(null);
    onActiveEditChange?.(false);
    setSelectedImage(null);
    setAdjustmentState(null);

    // 1. Gather unique document fonts from editableObjects
    const docFonts = Array.from(
      new Set(
        editableObjects
          .map((o) => cleanPdfFontFamily(o.font?.family))
          .filter(Boolean)
      )
    );

    // 2. Find nearest text object on this page to (x, y) to auto-detect typography
    const pageObjs = editableObjects.filter((o) => (o.pageNumber || 1) === pageNum);
    let nearestObj: EditableText | null = null;
    let minDistance = Infinity;

    for (const obj of pageObjs) {
      const bbox = obj.boundingBox || (obj as any).bounding_box;
      if (!bbox) continue;
      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < minDistance) {
        minDistance = dist;
        nearestObj = obj;
      }
    }

    const detectedFam = cleanPdfFontFamily(nearestObj?.font?.family || docFonts[0] || 'Helvetica');
    const detectedSize = nearestObj?.font?.size ? Math.min(Math.max(Math.round(nearestObj.font.size), 8), 72) : 14;
    const detectedWeight: 'normal' | 'bold' = nearestObj?.font?.weight === 'bold' ? 'bold' : 'normal';
    let detectedColor = '#000000';
    if (nearestObj?.font?.color && Array.isArray(nearestObj.font.color) && nearestObj.font.color.length >= 3) {
      const rgb = nearestObj.font.color;
      detectedColor = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
    }

    setPendingInsert({
      x,
      y,
      pageNum,
      text: '',
      fontSize: detectedSize,
      fontWeight: detectedWeight,
      fontFamily: detectedFam,
      color: detectedColor,
      isUnderlined: false,
      detectedFontFamily: detectedFam,
      availableDocumentFonts: docFonts,
      isSameAsPdf: true,
    });
  };

  const handleCommitPendingText = async (overrideText?: string) => {
    const textToInsert = (overrideText !== undefined ? overrideText : pendingInsert?.text || '').trim();
    if (!pendingInsert || !textToInsert) {
      setPendingInsert(null);
      return;
    }
    const { x, y, pageNum, fontSize, fontWeight, fontFamily, color, isUnderlined: insertUnderlined } = pendingInsert;
    setPendingInsert(null);
    if (isAddTextMode) {
      onExitAddTextMode?.();
    }
    try {
      if (onInsertText) {
        await onInsertText(textToInsert, x, y, pageNum, fontSize, fontWeight, fontFamily, color, insertUnderlined);
      }
    } catch {
      showToast('Failed to insert text', 'error');
    }
  };

  const handleCancelPendingText = () => {
    setPendingInsert(null);
    if (isAddTextMode) {
      onExitAddTextMode?.();
    }
  };

  // Preserve scroll position across PDF reloads
  const savedScrollTopRef = useRef<number>(0);
  useEffect(() => {
    const viewport = document.getElementById('canvas-viewport');
    if (viewport && viewport.scrollTop > 0) {
      savedScrollTopRef.current = viewport.scrollTop;
    }
  }, [pdfUrl]);

  // Load PDF Document if not provided by parent
  useEffect(() => {
    if (externalPdfDoc) return;
    let isCancelled = false;
    const loadDoc = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          disableStream: true,
          disableRange: true,
          disableAutoFetch: false,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/',
        });
        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          onPdfDocLoaded?.(doc);
          requestAnimationFrame(() => {
            const viewport = document.getElementById('canvas-viewport');
            if (viewport && savedScrollTopRef.current > 0 && Math.abs(viewport.scrollTop - savedScrollTopRef.current) > 30) {
              viewport.scrollTop = savedScrollTopRef.current;
            }
          });
        }
      } catch (err) {
        console.error('Error loading PDF in PDF.js:', err);
      }
    };

    loadDoc();
    return () => {
      isCancelled = true;
    };
  }, [externalPdfDoc, pdfUrl, onPdfDocLoaded]);

  // Ensure viewport stays on currentPage if currentPage > 1
  useEffect(() => {
    if (currentPage > 1) {
      const timer = setTimeout(() => {
        const viewport = document.getElementById('canvas-viewport');
        if (viewport && viewport.scrollTop === 0) {
          const pageEl = document.getElementById(`pdf-page-${currentPage}`);
          if (pageEl) {
            pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [currentPage, pdfDoc]);


  // Auto-scroll to matching overlay on canvas when search match changes
  useEffect(() => {
    if (!activeMatchKey) return;
    const objId = activeMatchKey.split('__occ_')[0];
    const el = document.getElementById(`editable-${objId}`);
    if (el) {
      isProgrammaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      const timer = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [activeMatchKey]);

  // Continuous Scroll: Track which page is in viewport and update currentPage in Toolbar
  const isProgrammaticScrollRef = useRef<boolean>(false);
  useEffect(() => {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport || !pages || pages.length <= 1) return;

    let debounceTimer: any;
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isProgrammaticScrollRef.current) return;
        const viewportRect = viewport.getBoundingClientRect();
        const midY = viewportRect.top + viewportRect.height / 2;

        let closestPage = currentPage;
        let minDistance = Infinity;

        pages.forEach((p) => {
          const el = document.getElementById(`pdf-page-${p.page}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            const pageMidY = rect.top + rect.height / 2;
            const distance = Math.abs(midY - pageMidY);
            if (distance < minDistance) {
              minDistance = distance;
              closestPage = p.page;
            }
          }
        });

        if (closestPage !== currentPage) {
          onPageChange?.(closestPage, false);
        }
      }, 70);
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      clearTimeout(debounceTimer);
    };
  }, [pages, currentPage, onPageChange]);

  // Active in-place editing state
  const isColorModifiedRef = useRef<boolean>(false);
  const origUnderlinedRef = useRef<boolean>(false);

  // Start in-place edit
  const handleStartEdit = (obj: EditableText) => {
    if (activeObj && activeObj.id !== obj.id) {
      handleCommit();
    }
    isColorModifiedRef.current = false;
    setActiveObj(obj);
    setActiveFontSize(Math.round((obj.font?.size || 10) * 10) / 10);
    setActiveFontFamily(obj.font?.family || 'Helvetica');
    const hasUnderscoreLine =
      Boolean(obj.text && /__/.test(obj.text)) ||
      obj.font?.style === 'underline' ||
      /^(signature|name|date|title|by):\s*/i.test(obj.text);
    setIsUnderlined(hasUnderscoreLine);
    origUnderlinedRef.current = hasUnderscoreLine;

    // If this is a form fill line with underscores, strip the placeholder underscores
    // so the user can type their value cleanly directly onto the line without cursor getting stuck in underscores
    let initialText = obj.text;
    if (obj.text && /__/.test(obj.text)) {
      initialText = obj.text.replace(/_+/g, '').trimEnd();
      if (initialText.endsWith(':')) {
        initialText += ' ';
      }
    }
    setActiveText(initialText);

    const origRgb = obj.font.color || [0, 0, 0];
    const origHex = `#${Math.round(origRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[2] * 255).toString(16).padStart(2, '0')}`;
    setActiveColor(origHex);
    onActiveEditChange?.(true);
    setSelectedImage(null);
    setAdjustmentState(null);

    // On small screens, keep line visible without jumping or centering the viewport
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setTimeout(() => {
        const el = document.getElementById(`editable-${obj.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 70);
    }
  };

  const handleCommit = async (overrideText?: string) => {
    if (!activeObj) return;
    const origText = activeObj.text;
    const newText = overrideText !== undefined ? overrideText : activeText;
    const color = isColorModifiedRef.current ? activeColor : undefined;
    const targetId = activeObj.id;
    const bbox = activeObj.boundingBox || (activeObj as any).bounding_box;
    const origin = activeObj.origin;
    const pageNum = activeObj.pageNumber || currentPage;
    const origSize = Math.round((activeObj.font?.size || 10) * 10) / 10;
    const fontSize = activeFontSize !== origSize ? activeFontSize : undefined;
    const origFont = activeObj.font?.family || 'Helvetica';
    const newFontFamily = activeFontFamily !== origFont ? activeFontFamily : undefined;
    const isUnderlineModified = isUnderlined !== origUnderlinedRef.current;

    setActiveObj(null);
    onActiveEditChange?.(false);

    if (origText === newText && !color && fontSize === undefined && !newFontFamily && !isUnderlineModified) return;

    try {
      await onCommitEdit(origText, newText, color, targetId, bbox, origin, pageNum, isUnderlined, fontSize, newFontFamily);
    } catch {
      showToast('Failed to save changes. Please try again.', 'error');
    }
  };



  const handleDeleteLine = async () => {
    if (!activeObj) return;
    const origText = activeObj.text;
    const targetId = activeObj.id;
    const bbox = activeObj.boundingBox || (activeObj as any).bounding_box;
    const origin = activeObj.origin;
    const pageNum = activeObj.pageNumber || currentPage;

    setActiveObj(null);
    onActiveEditChange?.(false);

    try {
      await onCommitEdit(origText, '', undefined, targetId, bbox, origin, pageNum);
    } catch {
      showToast('Failed to delete line', 'error');
    }
  };

  const handleRedactLine = async () => {
    if (!activeObj) return;
    const bbox = activeObj.boundingBox || (activeObj as any).bounding_box;
    const pageNum = activeObj.pageNumber || currentPage;

    setActiveObj(null);
    onActiveEditChange?.(false);

    try {
      if (onRedactArea) {
        await onRedactArea(bbox, pageNum);
      }
    } catch {
      showToast('Failed to redact text', 'error');
    }
  };

  // Image Selection with Canvas Snapshot
  const handleSelectImageWithSnapshot = (img: ImageObject, snapshotUrl: string | null) => {
    setSelectedImage(img);
    setActiveSnapshotUrl(snapshotUrl);
    setAdjustmentState({
      x: img.boundingBox.x,
      y: img.boundingBox.y,
      width: img.boundingBox.width,
      height: img.boundingBox.height,
      replacementFile: null,
      previewUrl: null,
      cropBox: null,
      isModified: false,
    });
    setActiveObj(null);
  };

  // Interactive Drag & Proportional Resize Pointer Listener
  const handlePointerDownImage = (
    e: React.PointerEvent,
    dragType: 'move' | 'nw' | 'ne' | 'se' | 'sw'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!adjustmentState) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialBox = {
      x: adjustmentState.x,
      y: adjustmentState.y,
      width: adjustmentState.width,
      height: adjustmentState.height,
    };
    const aspect = Math.max(0.1, initialBox.width / (initialBox.height || 1));

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const deltaX = (moveEvt.clientX - startClientX) / scale;
      const deltaY = (moveEvt.clientY - startClientY) / scale;

      setAdjustmentState((prev) => {
        if (!prev) return null;
        let nextX = initialBox.x;
        let nextY = initialBox.y;
        let nextW = initialBox.width;
        let nextH = initialBox.height;

        if (dragType === 'move') {
          nextX = Math.round((initialBox.x + deltaX) * 10) / 10;
          nextY = Math.round((initialBox.y + deltaY) * 10) / 10;
        } else if (dragType === 'se') {
          // Bottom-Right handle
          nextW = Math.max(15, Math.round((initialBox.width + deltaX) * 10) / 10);
          nextH = Math.max(10, Math.round((nextW / aspect) * 10) / 10);
        } else if (dragType === 'sw') {
          // Bottom-Left handle
          const maxDelta = initialBox.width - 15;
          const clamped = Math.min(maxDelta, deltaX);
          nextX = Math.round((initialBox.x + clamped) * 10) / 10;
          nextW = Math.max(15, Math.round((initialBox.width - clamped) * 10) / 10);
          nextH = Math.max(10, Math.round((nextW / aspect) * 10) / 10);
        } else if (dragType === 'ne') {
          // Top-Right handle
          nextW = Math.max(15, Math.round((initialBox.width + deltaX) * 10) / 10);
          nextH = Math.max(10, Math.round((nextW / aspect) * 10) / 10);
          nextY = Math.round((initialBox.y + initialBox.height - nextH) * 10) / 10;
        } else if (dragType === 'nw') {
          // Top-Left handle
          const maxDelta = initialBox.width - 15;
          const clamped = Math.min(maxDelta, deltaX);
          nextX = Math.round((initialBox.x + clamped) * 10) / 10;
          nextW = Math.max(15, Math.round((initialBox.width - clamped) * 10) / 10);
          nextH = Math.max(10, Math.round((nextW / aspect) * 10) / 10);
          nextY = Math.round((initialBox.y + initialBox.height - nextH) * 10) / 10;
        }

        return {
          ...prev,
          x: nextX,
          y: nextY,
          width: nextW,
          height: nextH,
          isModified: true,
        };
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleResetAdjustment = () => {
    if (!selectedImage) return;
    setAdjustmentState({
      x: selectedImage.boundingBox.x,
      y: selectedImage.boundingBox.y,
      width: selectedImage.boundingBox.width,
      height: selectedImage.boundingBox.height,
      replacementFile: null,
      previewUrl: null,
      cropBox: null,
      isModified: false,
    });
  };

  const handleSaveAdjustment = async () => {
    if (!selectedImage || !adjustmentState) return;
    try {
      const pageNum = selectedImage.pageNumber || currentPage;
      if (onAdjustImage) {
        await onAdjustImage(
          selectedImage.boundingBox,
          {
            x: adjustmentState.x,
            y: adjustmentState.y,
            width: adjustmentState.width,
            height: adjustmentState.height,
          },
          adjustmentState.replacementFile,
          adjustmentState.cropBox,
          pageNum
        );
      } else if (adjustmentState.replacementFile && onReplaceImage) {
        await onReplaceImage(selectedImage.boundingBox, adjustmentState.replacementFile as File);
      }
      setSelectedImage(null);
      setAdjustmentState(null);
      setActiveSnapshotUrl(null);
    } catch {
      showToast('Failed to save logo changes. Please try again.', 'error');
    }
  };

  const handleApplyCrop = (croppedBlob: Blob, cropBoxData: any) => {
    const preview = URL.createObjectURL(croppedBlob);
    setAdjustmentState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        replacementFile: croppedBlob,
        previewUrl: preview,
        cropBox: cropBoxData,
        isModified: true,
      };
    });
    setIsCropModalOpen(false);
  };

  // Image deletion
  const handleDeleteSelectedImage = async () => {
    if (!selectedImage || !onDeleteImage) return;
    try {
      const pageNum = (selectedImage as any).pageNumber || currentPage;
      await onDeleteImage(selectedImage.boundingBox, pageNum);
      setSelectedImage(null);
      setAdjustmentState(null);
      setActiveSnapshotUrl(null);
    } catch {
      showToast('Failed to delete image', 'error');
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedImage) return;
    const preview = URL.createObjectURL(file);
    setAdjustmentState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        replacementFile: file,
        previewUrl: preview,
        isModified: true,
      };
    });
    if (imageFileInputRef.current) imageFileInputRef.current.value = '';
  };

  // Determine list of pages to render
  const numPages = totalPages || pages?.length || 1;
  const pageList: PageMeta[] = pages && pages.length > 0
    ? pages
    : Array.from({ length: numPages }, (_, i) => ({
        page: i + 1,
        width: 595.28,
        height: 841.89,
        rotation: 0,
      }));

  // Notice for scanned/image pages without selectable text
  const isScannedNoticeVisible =
    !isProcessing &&
    pdfDoc != null &&
    editableObjects.length === 0 &&
    !dismissedScannedPages.has(currentPage);

  return (
    <div className="pdf-viewer-root">
      {/* Docked Contextual Edit Subbar (Desktop only) */}
      {activeObj && !isMobileScreen && (
        <InlineEditorBar
          textObject={activeObj}
          selectedColor={activeColor}
          onSelectColor={(hex) => {
            isColorModifiedRef.current = true;
            setActiveColor(hex);
          }}
          fontFamily={activeFontFamily}
          onFontFamilyChange={(family) => setActiveFontFamily(family)}
          fontSize={activeFontSize}
          onFontSizeChange={(size) => setActiveFontSize(size)}
          onCommit={handleCommit}
          onCancel={() => {
            setActiveObj(null);
            onActiveEditChange?.(false);
          }}
          onDeleteLine={handleDeleteLine}
          onRedactLine={handleRedactLine}
          isSubmitting={isProcessing}
          isUnderlined={isUnderlined}
          onToggleUnderline={() => setIsUnderlined((v) => !v)}
          onAddTextClick={() => {
            setActiveObj(null);
            onActiveEditChange?.(false);
            if (onToggleAddText) onToggleAddText();
          }}
        />
      )}

      {/* Default Document Action Subbar (Desktop only) */}
      {!activeObj && !selectedImage && !pendingInsert && !isMobileScreen && (
        <div
          className="pdf-editor-subbar pdf-default-subbar"
          id="pdf-default-subbar"
        >
          <div className="editor-subbar-left">
            {onToggleAddText && (
              <button
                type="button"
                className={`btn-subbar-add-text ${isAddTextMode ? 'active' : ''}`}
                onClick={onToggleAddText}
                id="btn-subbar-add-text"
                aria-label="Add text"
                title="Add Text (Shortcut: T)"
              >
                <Type size={14} />
                <span>Add Text</span>
              </button>
            )}

            <div className="subbar-divider" />

            <span className="subbar-idle-hint">
              {isAddTextMode
                ? 'Click anywhere on the document to place text'
                : 'Click any text in the PDF to edit directly'}
            </span>
          </div>

          <div className="editor-subbar-right">
            {isAddTextMode && onExitAddTextMode && (
              <button
                type="button"
                className="subbar-btn subbar-btn-cancel"
                onClick={onExitAddTextMode}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Docked Contextual Subbar for Logo / Image Adjustment */}
      {selectedImage && (
        <ImageEditorSubbar
          selectedImage={selectedImage}
          adjustmentState={adjustmentState}
          onOpenCrop={() => setIsCropModalOpen(true)}
          onReplaceClick={() => imageFileInputRef.current?.click()}
          onReset={handleResetAdjustment}
          onDelete={handleDeleteSelectedImage}
          onSave={handleSaveAdjustment}
          onCancel={() => {
            setSelectedImage(null);
            setAdjustmentState(null);
            setActiveSnapshotUrl(null);
          }}
          isSubmitting={isProcessing}
        />
      )}

      {/* Hidden Image Upload Input */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: 'none' }}
        onChange={handleImageFileChange}
      />

      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageUrl={adjustmentState?.previewUrl || activeSnapshotUrl || ''}
        onClose={() => setIsCropModalOpen(false)}
        onApplyCrop={handleApplyCrop}
      />

      {/* Main Continuous Document Viewport (Google Drive style continuous scrolling) */}
      <div
        className="canvas-viewport"
        id="canvas-viewport"
        onClick={() => {
          if (activeObj) {
            handleCommit();
          }
          if (!adjustmentState?.isModified) {
            setSelectedImage(null);
            setAdjustmentState(null);
            setActiveSnapshotUrl(null);
          }
        }}
      >
        {/* Top Activity Progress Bar */}
        {isProcessing && <div className="canvas-top-progress-bar" />}

        {/* Scanned / Image PDF Notice Banner */}
        {isScannedNoticeVisible && (
          <div className="scanned-pdf-banner" role="status" onClick={(e) => e.stopPropagation()}>
            <span className="scanned-pdf-icon">📄</span>
            <span className="scanned-pdf-text">
              <strong>Scanned document notice:</strong> No selectable text found on this page. Vector PDF editing requires selectable text.
            </span>
            <button
              type="button"
              className="scanned-pdf-dismiss"
              onClick={(e) => {
                e.stopPropagation();
                setDismissedScannedPages((prev) => new Set(prev).add(currentPage));
              }}
              title="Dismiss notice"
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        {/* Continuous Multi-Page Column */}
        <div className="pdf-continuous-scroll-column">
          {pageList.map((pMeta) => (
            <PdfPageItem
              key={pMeta.page}
              pageNum={pMeta.page}
              pageMeta={pMeta}
              totalPages={pageList.length}
              pdfDoc={pdfDoc}
              scale={scale}
              editableObjects={editableObjects}
              imageObjects={imageObjects}
              activeObj={activeObj}
              activeText={activeText}
              activeColor={activeColor}
              activeFontSize={activeFontSize}
              activeFontFamily={activeFontFamily}
              selectedImage={selectedImage}
              adjustmentState={adjustmentState}
              activeSnapshotUrl={activeSnapshotUrl}
              activeMatchKey={activeMatchKey || null}
              allSearchMatchIds={allSearchMatchIds}
              searchQuery={searchQuery}
              onStartEdit={handleStartEdit}
              onSelectImageWithSnapshot={handleSelectImageWithSnapshot}
              onPointerDownImage={handlePointerDownImage}
              isAddTextMode={isAddTextMode}
              isUnderlined={isUnderlined}
              pendingInsert={pendingInsert}
              modifiedPage={modifiedPage}
              onNewTextBoxRequest={handleNewTextBoxRequest}
              onCommitPendingText={handleCommitPendingText}
              onCancelPendingText={handleCancelPendingText}
              onCommitEdit={handleCommit}
              onCancelEdit={() => {
                setActiveObj(null);
                onActiveEditChange?.(false);
              }}
              onDeleteLine={handleDeleteLine}
              onRedactLine={handleRedactLine}
              onColorChange={(hex) => {
                isColorModifiedRef.current = true;
                setActiveColor(hex);
              }}
              onFontSizeChange={(size) => setActiveFontSize(size)}
              onFontFamilyChange={(fam) => setActiveFontFamily(fam)}
              onToggleUnderline={() => setIsUnderlined((v) => !v)}
              onUpdatePendingColor={(hex) =>
                setPendingInsert((prev) => (prev ? { ...prev, color: hex } : null))
              }
              onUpdatePendingFontSize={(size) =>
                setPendingInsert((prev) => (prev ? { ...prev, fontSize: size } : null))
              }
              onUpdatePendingFontFamily={(fam) =>
                setPendingInsert((prev) => (prev ? { ...prev, fontFamily: fam } : null))
              }
              onTogglePendingBold={() =>
                setPendingInsert((prev) =>
                  prev ? { ...prev, fontWeight: prev.fontWeight === 'bold' ? 'normal' : 'bold' } : null
                )
              }
              onTogglePendingUnderline={() =>
                setPendingInsert((prev) =>
                  prev ? { ...prev, isUnderlined: !prev.isUnderlined } : null
                )
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};

