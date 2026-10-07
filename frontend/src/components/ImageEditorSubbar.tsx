import React from 'react';
import {
  Image as ImageIcon,
  Upload,
  Crop as CropIcon,
  RotateCcw,
  Trash2,
  Loader2,
} from 'lucide-react';
import type { ImageObject } from '../types/pdf';
import type { ImageAdjustmentState } from './PdfViewer';

interface ImageEditorSubbarProps {
  selectedImage: ImageObject;
  adjustmentState: ImageAdjustmentState | null;
  onOpenCrop: () => void;
  onReplaceClick: () => void;
  onReset: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export const ImageEditorSubbar: React.FC<ImageEditorSubbarProps> = ({
  selectedImage,
  adjustmentState,
  onOpenCrop,
  onReplaceClick,
  onReset,
  onDelete,
  onSave,
  onCancel,
  isSubmitting = false,
}) => {
  const curW = adjustmentState ? Math.round(adjustmentState.width) : Math.round(selectedImage.boundingBox.width);
  const curH = adjustmentState ? Math.round(adjustmentState.height) : Math.round(selectedImage.boundingBox.height);
  const curX = adjustmentState ? Math.round(adjustmentState.x) : Math.round(selectedImage.boundingBox.x);
  const curY = adjustmentState ? Math.round(adjustmentState.y) : Math.round(selectedImage.boundingBox.y);
  const isModified = adjustmentState?.isModified ?? false;

  return (
    <div
      className="pdf-editor-subbar image-editor-subbar"
      onClick={(e) => e.stopPropagation()}
      id="pdf-image-editor-subbar"
    >
      {/* Left: Badge & Live Position / Dimensions */}
      <div className="editor-subbar-left">
        <div className="subbar-icon-badge">
          <ImageIcon size={15} />
        </div>
        <div className="image-subbar-meta">
          <span className="image-subbar-title">Adjust Logo</span>
          <span className="image-subbar-dim">
            {curW} × {curH} pt <span className="dim-pos">(X: {curX}, Y: {curY})</span>
          </span>
        </div>
      </div>

      {/* Middle: Actions (Replace, Crop, Reset, Delete) */}
      <div className="editor-subbar-center">
        <button
          className="btn btn-sm btn-subbar-action"
          onClick={onReplaceClick}
          aria-label="Replace Logo"
        >
          <Upload size={13} />
          <span>Replace Logo</span>
        </button>

        <button
          className="btn btn-sm btn-subbar-action"
          onClick={onOpenCrop}
          aria-label="Crop Logo"
        >
          <CropIcon size={13} />
          <span>Crop</span>
        </button>

        {isModified && (
          <button
            className="btn btn-sm btn-subbar-action"
            onClick={onReset}
            aria-label="Reset Logo"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        )}

        <button
          className="btn btn-sm btn-subbar-action btn-danger"
          onClick={onDelete}
          aria-label="Delete Logo"
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </button>
      </div>

      {/* Right: Cancel & Save Changes */}
      <div className="editor-subbar-right">
        <button
          className="btn btn-sm btn-ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>

        <button
          className="btn btn-sm btn-success-save"
          onClick={onSave}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="spin-fast" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Save</span>
          )}
        </button>
      </div>
    </div>
  );
};
