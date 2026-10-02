import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EditableText, ImageObject, PageMeta } from '../types/pdf';
import { InlineEditorBar } from './InlineEditorBar';
import { ImageEditorSubbar } from './ImageEditorSubbar';
import { ImageCropModal } from './ImageCropModal';
import { MobileTextEditorSheet } from './MobileTextEditorSheet';
import { Image as ImageIcon } from 'lucide-react';
import { useToast } from './Toast';

// Set up worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

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

const measureTextWidth = (text: string, font: any, pxSize: number) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * pxSize * 0.55;
  const isBold = font.weight === 'bold' || /bold/i.test(font.family || '');
  const isItalic = font.style === 'italic' || /italic/i.test(font.family || '');
  ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${pxSize}px ${font.family || 'sans-serif'}`;
  return ctx.measureText(text).width;
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

  const fontStyle = font.style === 'italic' ? 'italic ' : '';
  const fontWeight = font.weight === 'bold' ? 'bold ' : '';
  const fontSize = Math.max(font.size * scale, 1);
  ctx.font = `${fontStyle}${fontWeight}${fontSize}px ${font.family || 'sans-serif'}`;

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
  activeBgColor: string;
  selectedImage: ImageObject | null;
  adjustmentState: ImageAdjustmentState | null;
  activeSnapshotUrl: string | null;
  activeMatchKey: string | null;
  allSearchMatchIds?: string[];
  searchQuery?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (obj: EditableText) => void;
  setActiveText: (val: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectImageWithSnapshot: (img: ImageObject, snapshotUrl: string | null) => void;
  onPointerDownImage: (
    e: React.PointerEvent,
    type: 'move' | 'nw' | 'ne' | 'se' | 'sw'
  ) => void;
  isMobile?: boolean;
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
  activeBgColor,
  selectedImage,
  adjustmentState,
  activeSnapshotUrl,
  activeMatchKey,
  allSearchMatchIds,
  searchQuery,
  inputRef,
  onStartEdit,
  setActiveText,
  handleKeyDown,
  onSelectImageWithSnapshot,
  onPointerDownImage,
  isMobile = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState<boolean>(pageNum <= 4);
  const [isRendered, setIsRendered] = useState<boolean>(false);

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
    let renderTask: any = null;
    let isCancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const w = Math.floor(viewport.width * outputScale);
        const h = Math.floor(viewport.height * outputScale);

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;
        offCtx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        renderTask = page.render({ canvasContext: offCtx, viewport });
        await renderTask.promise;
        if (isCancelled) return;

        const visibleCanvas = canvasRef.current;
        if (!visibleCanvas) return;
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
        setIsRendered(true);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      }
    };

    render();
    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [isNearViewport, pdfDoc, pageNum, scale]);

  // Filter text & image objects belonging to this page
  const pageObjects = editableObjects.filter((o) => (o.pageNumber || 1) === pageNum);
  const pageImages = imageObjects.filter((img: any) => (img.pageNumber || 1) === pageNum);

  return (
    <div
      className="pdf-page-wrapper"
      ref={containerRef}
      id={`pdf-page-${pageNum}`}
      data-page-num={pageNum}
      style={{
        width: `${targetWidthPx}px`,
        height: `${targetHeightPx}px`,
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
          if (isMobile) {
            return (
              <div
                key={obj.id}
                className="active-mobile-target-highlight"
                style={{
                  position: 'absolute',
                  left: `${bboxLeft}px`,
                  top: `${bboxTop}px`,
                  width: `${Math.max(bboxWidth, 24)}px`,
                  height: `${Math.max(bboxHeight, 16)}px`,
                  zIndex: 40,
                }}
                id={`editable-${obj.id}`}
              />
            );
          }

          const origRgb = obj.font.color || [0, 0, 0];
          const origHex = `#${Math.round(origRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[2] * 255).toString(16).padStart(2, '0')}`;
          const activeColorHex = activeColor || origHex;
          const typo = getFontTypography(obj.font);
          const fontSizePx = Math.max(obj.font.size * scale, 1);

          const editorWidth = activeText === obj.text
            ? bboxWidth
            : Math.max(bboxWidth, measureTextWidth(activeText, obj.font, fontSizePx) + 6);

          return (
            <div
              key={obj.id}
              className="active-inline-editor-wrapper"
              style={{
                position: 'absolute',
                left: `${bboxLeft}px`,
                top: `${bboxTop}px`,
                width: `${editorWidth}px`,
                height: `${bboxHeight}px`,
                zIndex: 40,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                type="text"
                className="inline-wysiwyg-input"
                value={activeText}
                onChange={(e) => setActiveText(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  fontSize: `${fontSizePx}px`,
                  fontFamily: typo.family,
                  fontWeight: typo.fontWeight,
                  fontStyle: typo.fontStyle,
                  color: activeColorHex,
                  backgroundColor: activeBgColor || '#ffffff',
                  width: '100%',
                  height: '100%',
                }}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
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
            }}
            onClick={(e) => {
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
  onPageChange?: (page: number, shouldScroll?: boolean) => void;
  onCommitEdit: (
    originalText: string,
    newText: string,
    color?: string,
    targetTextId?: string,
    boundingBox?: any,
    origin?: [number, number],
    pageNumber?: number
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
  onActiveEditChange?: (isEditing: boolean) => void;
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
  onPageChange,
  onCommitEdit,
  onDeleteImage,
  onReplaceImage,
  onAdjustImage,
  onActiveEditChange,
}) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(externalPdfDoc || null);

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
  const [activeBgColor, setActiveBgColor] = useState<string>('#ffffff');

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
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
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

  // Focus inline input on select (Desktop only — on mobile the sheet handles focus)
  useEffect(() => {
    if (activeObj && inputRef.current && !isMobileScreen) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [activeObj, isMobileScreen]);

  // Auto-scroll to matching overlay on canvas when search match changes
  useEffect(() => {
    if (!activeMatchKey) return;
    const objId = activeMatchKey.split('__occ_')[0];
    const el = document.getElementById(`editable-${objId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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

  // Start in-place edit
  const handleStartEdit = (obj: EditableText) => {
    isColorModifiedRef.current = false;
    setActiveObj(obj);
    setActiveText(obj.text);
    const origRgb = obj.font.color || [0, 0, 0];
    const origHex = `#${Math.round(origRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[2] * 255).toString(16).padStart(2, '0')}`;
    setActiveColor(origHex);
    setActiveBgColor('#ffffff');
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

  const handleCommit = async () => {
    if (!activeObj) return;
    const origText = activeObj.text;
    const newText = activeText;
    const color = isColorModifiedRef.current ? activeColor : undefined;
    const targetId = activeObj.id;
    const bbox = activeObj.boundingBox || (activeObj as any).bounding_box;
    const origin = activeObj.origin;
    const pageNum = activeObj.pageNumber || currentPage;

    setActiveObj(null);
    onActiveEditChange?.(false);

    if (origText === newText && !color) return;

    try {
      await onCommitEdit(origText, newText, color, targetId, bbox, origin, pageNum);
    } catch {
      showToast('Failed to save changes. Please try again.', 'error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setActiveObj(null);
      onActiveEditChange?.(false);
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
          onCommit={handleCommit}
          onCancel={() => {
            setActiveObj(null);
            onActiveEditChange?.(false);
          }}
          onDeleteLine={handleDeleteLine}
          isSubmitting={isProcessing}
        />
      )}

      {/* Dedicated Mobile Text Editor Sheet (Clean card with top actions, never hidden by keyboard) */}
      {activeObj && isMobileScreen && (
        <MobileTextEditorSheet
          textObject={activeObj}
          activeText={activeText}
          onChangeText={setActiveText}
          selectedColor={activeColor}
          onSelectColor={(hex) => {
            isColorModifiedRef.current = true;
            setActiveColor(hex);
          }}
          onCommit={handleCommit}
          onCancel={() => {
            setActiveObj(null);
            onActiveEditChange?.(false);
          }}
          onDeleteLine={handleDeleteLine}
          isSubmitting={isProcessing}
        />
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
            setActiveObj(null);
            onActiveEditChange?.(false);
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
              activeBgColor={activeBgColor}
              selectedImage={selectedImage}
              adjustmentState={adjustmentState}
              activeSnapshotUrl={activeSnapshotUrl}
              activeMatchKey={activeMatchKey || null}
              allSearchMatchIds={allSearchMatchIds}
              searchQuery={searchQuery}
              inputRef={inputRef}
              onStartEdit={handleStartEdit}
              setActiveText={setActiveText}
              handleKeyDown={handleKeyDown}
              onSelectImageWithSnapshot={handleSelectImageWithSnapshot}
              onPointerDownImage={handlePointerDownImage}
              isMobile={isMobileScreen}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

