import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EditableText, ImageObject, PageMeta } from '../types/pdf';
import { InlineEditorBar } from './InlineEditorBar';
import { Image as ImageIcon, Trash2, Upload, X } from 'lucide-react';
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
  activeMatchKey: string | null;
  allSearchMatchIds?: string[];
  searchQuery?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  imageFileInputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (obj: EditableText) => void;
  setActiveText: (val: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectImage: (img: ImageObject) => void;
  onDeleteSelectedImage: () => void;
  onCloseSelectedImage: () => void;
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
  activeMatchKey,
  allSearchMatchIds,
  searchQuery,
  inputRef,
  imageFileInputRef,
  onStartEdit,
  setActiveText,
  handleKeyDown,
  onSelectImage,
  onDeleteSelectedImage,
  onCloseSelectedImage,
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

      {/* Lightweight paper placeholder while scrolling quickly before canvas paints */}
      {!isRendered && (
        <div className="page-paper-placeholder">
          <div className="placeholder-shimmer-subtle" />
          <div className="placeholder-page-label">Page {pageNum}</div>
        </div>
      )}

      {/* Interactive Image / Logo Overlays */}
      {pageImages.map((img) => {
        const bbox = img.boundingBox;
        const left = bbox.x * scale;
        const top = bbox.y * scale;
        const width = bbox.width * scale;
        const height = bbox.height * scale;
        const isSelected = selectedImage?.id === img.id;

        return (
          <div
            key={img.id}
            className={`image-object-overlay ${isSelected ? 'selected-image' : ''}`}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex: isSelected ? 35 : 15,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectImage(img);
            }}
          >
            <div className="image-badge">
              <ImageIcon size={10} />
              <span>Logo / Image</span>
            </div>

            {isSelected && (
              <div className="image-actions-pill" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn btn-sm btn-image-action"
                  onClick={() => imageFileInputRef.current?.click()}
                  title="Replace with your own logo or image"
                >
                  <Upload size={12} />
                  <span>Replace Logo</span>
                </button>

                <button
                  className="btn btn-sm btn-image-action btn-danger"
                  onClick={onDeleteSelectedImage}
                  title="Delete this image/logo from the PDF"
                >
                  <Trash2 size={12} />
                  <span>Delete</span>
                </button>

                <button
                  className="btn btn-icon btn-sm"
                  onClick={onCloseSelectedImage}
                  title="Close"
                  style={{ padding: '2px 4px' }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
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
  onDeleteImage?: (boundingBox: any) => Promise<void>;
  onReplaceImage?: (boundingBox: any, file: File) => Promise<void>;
  onActiveEditChange?: (isEditing: boolean) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
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
  onActiveEditChange,
}) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);

  // Active in-place editing state
  const [activeObj, setActiveObj] = useState<EditableText | null>(null);
  const [activeText, setActiveText] = useState<string>('');
  const [activeColor, setActiveColor] = useState<string>('');
  const [activeBgColor, setActiveBgColor] = useState<string>('#ffffff');

  // Selected Image state
  const [selectedImage, setSelectedImage] = useState<ImageObject | null>(null);

  // Load PDF Document
  useEffect(() => {
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
        }
      } catch (err) {
        console.error('Error loading PDF in PDF.js:', err);
      }
    };

    loadDoc();
    return () => {
      isCancelled = true;
    };
  }, [pdfUrl]);

  // Focus inline input on select
  useEffect(() => {
    if (activeObj && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [activeObj]);

  // Auto-scroll to matching overlay on canvas when search match changes
  useEffect(() => {
    if (!activeMatchKey) return;
    const objId = activeMatchKey.split('__occ_')[0];
    const el = document.getElementById(`editable-${objId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeMatchKey]);

  // Continuous Scroll: Track which page is in viewport and update currentPage in Toolbar (like Google Drive)
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

  // Start in-place edit
  const handleStartEdit = (obj: EditableText) => {
    setActiveObj(obj);
    setActiveText(obj.text);
    const origRgb = obj.font.color || [0, 0, 0];
    const origHex = `#${Math.round(origRgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(origRgb[2] * 255).toString(16).padStart(2, '0')}`;
    setActiveColor(origHex);
    setActiveBgColor('#ffffff');
    onActiveEditChange?.(true);
  };

  const handleCommit = async () => {
    if (!activeObj) return;
    const origText = activeObj.text;
    const newText = activeText;
    const color = activeColor;
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

  // Image deletion & replacement
  const handleDeleteSelectedImage = async () => {
    if (!selectedImage || !onDeleteImage) return;
    try {
      await onDeleteImage(selectedImage.boundingBox);
      setSelectedImage(null);
    } catch {
      showToast('Failed to delete image', 'error');
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedImage || !onReplaceImage) return;
    try {
      await onReplaceImage(selectedImage.boundingBox, file);
      setSelectedImage(null);
    } catch {
      showToast('Failed to replace image', 'error');
    } finally {
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
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
      {/* Docked Contextual Edit Subbar */}
      {activeObj && (
        <InlineEditorBar
          textObject={activeObj}
          selectedColor={activeColor}
          onSelectColor={(hex) => setActiveColor(hex)}
          onCommit={handleCommit}
          onCancel={() => {
            setActiveObj(null);
            onActiveEditChange?.(false);
          }}
          onDeleteLine={handleDeleteLine}
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

      {/* Main Continuous Document Viewport (Google Drive style continuous scrolling) */}
      <div
        className="canvas-viewport"
        id="canvas-viewport"
        onClick={() => {
          if (activeObj) {
            setActiveObj(null);
            onActiveEditChange?.(false);
          }
          setSelectedImage(null);
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
              activeMatchKey={activeMatchKey || null}
              allSearchMatchIds={allSearchMatchIds}
              searchQuery={searchQuery}
              inputRef={inputRef}
              imageFileInputRef={imageFileInputRef}
              onStartEdit={handleStartEdit}
              setActiveText={setActiveText}
              handleKeyDown={handleKeyDown}
              onSelectImage={(img) => {
                setSelectedImage(img);
                setActiveObj(null);
              }}
              onDeleteSelectedImage={handleDeleteSelectedImage}
              onCloseSelectedImage={() => setSelectedImage(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
