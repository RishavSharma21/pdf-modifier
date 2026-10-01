import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCw, ZoomIn, ZoomOut, Crop as CropIcon } from 'lucide-react';

interface ImageCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onApplyCrop: (croppedBlob: Blob, cropBox: { x: number; y: number; width: number; height: number }) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onApplyCrop,
}) => {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null); // null = free
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    dragType: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | null;
    startX: number;
    startY: number;
    initialCrop: { x: number; y: number; width: number; height: number };
  }>({
    isDragging: false,
    dragType: null,
    startX: 0,
    startY: 0,
    initialCrop: { x: 10, y: 10, width: 80, height: 80 },
  });

  // Reset state when opening with a new image
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setCrop({ x: 10, y: 10, width: 80, height: 80 });
    }
  }, [isOpen, imageUrl]);

  const handlePointerDown = (
    e: React.PointerEvent,
    type: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      isDragging: true,
      dragType: type,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.isDragging || !containerRef.current) return;
      const { dragType, startX, startY, initialCrop } = dragRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const deltaXPercent = ((e.clientX - startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - startY) / rect.height) * 100;

      let newCrop = { ...initialCrop };

      if (dragType === 'move') {
        const maxX = 100 - initialCrop.width;
        const maxY = 100 - initialCrop.height;
        newCrop.x = Math.max(0, Math.min(maxX, initialCrop.x + deltaXPercent));
        newCrop.y = Math.max(0, Math.min(maxY, initialCrop.y + deltaYPercent));
      } else {
        // Handle resizing
        if (dragType?.includes('e')) {
          newCrop.width = Math.max(10, Math.min(100 - initialCrop.x, initialCrop.width + deltaXPercent));
        }
        if (dragType?.includes('s')) {
          newCrop.height = Math.max(10, Math.min(100 - initialCrop.y, initialCrop.height + deltaYPercent));
        }
        if (dragType?.includes('w')) {
          const maxDelta = initialCrop.width - 10;
          const clampedDelta = Math.max(-initialCrop.x, Math.min(maxDelta, deltaXPercent));
          newCrop.x = initialCrop.x + clampedDelta;
          newCrop.width = initialCrop.width - clampedDelta;
        }
        if (dragType?.includes('n')) {
          const maxDelta = initialCrop.height - 10;
          const clampedDelta = Math.max(-initialCrop.y, Math.min(maxDelta, deltaYPercent));
          newCrop.y = initialCrop.y + clampedDelta;
          newCrop.height = initialCrop.height - clampedDelta;
        }

        // Apply aspect ratio constraint if active
        if (aspectRatio && containerRef.current) {
          const containerAspect = rect.width / rect.height;
          const desiredHeightPercent = (newCrop.width * containerAspect) / aspectRatio;
          if (newCrop.y + desiredHeightPercent <= 100) {
            newCrop.height = desiredHeightPercent;
          } else {
            newCrop.height = 100 - newCrop.y;
            newCrop.width = (newCrop.height * aspectRatio) / containerAspect;
          }
        }
      }

      setCrop(newCrop);
    },
    [aspectRatio]
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleSaveCrop = () => {
    if (!imageRef.current) return;
    const img = imageRef.current;

    // Create offscreen canvas for crisp cropped render
    const canvas = document.createElement('canvas');
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;

    const cropX = (crop.x / 100) * naturalW;
    const cropY = (crop.y / 100) * naturalH;
    const cropW = (crop.width / 100) * naturalW;
    const cropH = (crop.height / 100) * naturalH;

    canvas.width = Math.max(Math.round(cropW), 10);
    canvas.height = Math.max(Math.round(cropH), 10);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (rotation !== 0) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }

    ctx.drawImage(
      img,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob((blob) => {
      if (blob) {
        onApplyCrop(blob, {
          x: crop.x / 100,
          y: crop.y / 100,
          width: crop.width / 100,
          height: crop.height / 100,
        });
        onClose();
      }
    }, 'image/png');
  };

  if (!isOpen) return null;

  return (
    <div className="crop-modal-backdrop" onClick={onClose}>
      <div className="crop-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-header">
          <div className="crop-modal-title">
            <CropIcon size={18} />
            <span>Crop & Adjust Logo / Image</span>
          </div>
          <button className="btn-icon" onClick={onClose} title="Cancel">
            <X size={18} />
          </button>
        </div>

        <div className="crop-modal-body">
          {/* Main crop canvas workspace */}
          <div
            ref={containerRef}
            className="crop-preview-workspace"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop target"
              className="crop-target-image"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />

            {/* Interactive Crop Mask Frame */}
            <div
              className="crop-selection-box"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`,
              }}
              onPointerDown={(e) => handlePointerDown(e, 'move')}
            >
              {/* Corner Handles */}
              <div
                className="crop-handle crop-handle-nw"
                onPointerDown={(e) => handlePointerDown(e, 'nw')}
              />
              <div
                className="crop-handle crop-handle-ne"
                onPointerDown={(e) => handlePointerDown(e, 'ne')}
              />
              <div
                className="crop-handle crop-handle-se"
                onPointerDown={(e) => handlePointerDown(e, 'se')}
              />
              <div
                className="crop-handle crop-handle-sw"
                onPointerDown={(e) => handlePointerDown(e, 'sw')}
              />

              {/* Edge Handles */}
              <div
                className="crop-handle crop-handle-n"
                onPointerDown={(e) => handlePointerDown(e, 'n')}
              />
              <div
                className="crop-handle crop-handle-e"
                onPointerDown={(e) => handlePointerDown(e, 'e')}
              />
              <div
                className="crop-handle crop-handle-s"
                onPointerDown={(e) => handlePointerDown(e, 's')}
              />
              <div
                className="crop-handle crop-handle-w"
                onPointerDown={(e) => handlePointerDown(e, 'w')}
              />

              {/* Grid 3x3 rule of thirds */}
              <div className="crop-rule-of-thirds">
                <div className="grid-h-1" />
                <div className="grid-h-2" />
                <div className="grid-v-1" />
                <div className="grid-v-2" />
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="crop-toolbar">
            <div className="crop-aspect-buttons">
              <span className="crop-tool-label">Aspect:</span>
              <button
                className={`btn btn-sm ${aspectRatio === null ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAspectRatio(null)}
              >
                Free
              </button>
              <button
                className={`btn btn-sm ${aspectRatio === 1 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAspectRatio(1)}
              >
                1:1 (Square)
              </button>
              <button
                className={`btn btn-sm ${aspectRatio === 4 / 3 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAspectRatio(4 / 3)}
              >
                4:3
              </button>
              <button
                className={`btn btn-sm ${aspectRatio === 16 / 9 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAspectRatio(16 / 9)}
              >
                16:9
              </button>
            </div>

            <div className="crop-transform-buttons">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="Rotate 90 degrees"
              >
                <RotateCw size={14} />
                <span>Rotate</span>
              </button>

              <div className="zoom-slider-group">
                <ZoomOut size={14} />
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="crop-zoom-slider"
                />
                <ZoomIn size={14} />
              </div>
            </div>
          </div>
        </div>

        <div className="crop-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveCrop}>
            <Check size={16} />
            <span>Apply Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
