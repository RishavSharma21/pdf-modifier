import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EditableText } from '../types/pdf';

// Set up worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  scale: number;
  editableObjects: EditableText[];
  onTextClick: (obj: EditableText) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  currentPage,
  scale,
  editableObjects,
  onTextClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportDims, setViewportDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageViewport, setPageViewport] = useState<any>(null);

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

  // Render Page on Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let renderTask: any = null;
    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        setPageViewport(viewport);
        setViewportDims({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Support high-DPI displays
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale]);

  // Helper: map PDF point coordinates to viewport pixel positions
  const computeOverlayStyle = (obj: EditableText) => {
    if (!pageViewport) return { display: 'none' };

    // Standard PDF coordinates (origin at bottom-left)
    const bbox = obj.boundingBox || (obj as any).bounding_box;

    // Viewport transform from PDF.js
    // [x, y] in PyMuPDF is already top-left based relative to cropbox
    const left = bbox.x * scale;
    const top = bbox.y * scale;
    const width = bbox.width * scale;
    const height = bbox.height * scale;

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(width, 20)}px`,
      height: `${Math.max(height, 14)}px`,
    };
  };

  return (
    <div className="canvas-viewport" id="canvas-viewport">
      <div
        className="pdf-page-wrapper"
        ref={containerRef}
        style={{
          width: viewportDims.width || 'auto',
          height: viewportDims.height || 'auto',
        }}
        id={`pdf-page-${currentPage}`}
      >
        <canvas ref={canvasRef} className="pdf-canvas" id="pdf-canvas" />

        {/* Interactive Text Run Overlay Boxes for Click-to-Edit */}
        {editableObjects.map((obj) => (
          <div
            key={obj.id}
            className="editable-span-overlay"
            style={computeOverlayStyle(obj)}
            onClick={() => onTextClick(obj)}
            title={`Click to edit: "${obj.text}" (${obj.font.family}, ${obj.font.size}pt)`}
            id={`editable-${obj.id}`}
          />
        ))}
      </div>
    </div>
  );
};
