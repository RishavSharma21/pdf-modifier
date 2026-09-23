import React, { useState } from 'react';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import type { EditableText } from '../types/pdf';

interface EditModalProps {
  textObject: EditableText | null;
  isOpen: boolean;
  onClose: () => void;
  onCommit: (originalText: string, newText: string) => Promise<void>;
}

export const EditModal: React.FC<EditModalProps> = ({
  textObject,
  isOpen,
  onClose,
  onCommit,
}) => {
  const [newText, setNewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial text when modal opens
  React.useEffect(() => {
    if (textObject) {
      setNewText(textObject.text);
      setError(null);
    }
  }, [textObject]);

  if (!isOpen || !textObject) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await onCommit(textObject.text, newText);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply text edit');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} id="edit-modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} id="edit-modal-content">
        <div className="modal-header">
          <div className="modal-title">Edit PDF Text</div>
          <button className="btn btn-icon" onClick={onClose} id="btn-close-modal">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="input-label">Original Text</label>
            <input
              type="text"
              className="text-input"
              value={textObject.text}
              disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
              id="input-original-text"
            />
          </div>

          <div>
            <label className="input-label">Replacement Text</label>
            <input
              type="text"
              className="text-input"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              autoFocus
              id="input-new-text"
            />
          </div>

          <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '8px' }}>
            <span>Font: <strong>{textObject.font.family}</strong></span>
            <span>•</span>
            <span>Size: <strong>{textObject.font.size}pt</strong></span>
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} id="btn-cancel-edit">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || newText === textObject.text}
              id="btn-save-edit"
            >
              <Sparkles size={14} />
              <span>{isSubmitting ? 'Modifying Stream...' : 'Apply Surgical Edit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
