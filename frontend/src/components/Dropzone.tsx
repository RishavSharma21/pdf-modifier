import React, { useRef, useState } from 'react';
import { FileUp, Sparkles, ShieldCheck } from 'lucide-react';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelected, isLoading }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        onFileSelected(file);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div className="dropzone-container" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <input
        type="file"
        ref={inputRef}
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleInputChange}
        id="pdf-file-input"
      />

      <div
        className={`dropzone-box ${isDragActive ? 'drag-active' : ''}`}
        onClick={() => inputRef.current?.click()}
        id="dropzone-box"
      >
        <div className="drop-icon-wrapper">
          <FileUp size={32} />
        </div>

        <div className="drop-title">
          {isLoading ? 'Processing Document...' : 'Drag & Drop your PDF here'}
        </div>

        <div className="drop-subtitle">
          Direct content-stream text modification without rasterization, flattening, or Word conversion.
        </div>

        <button className="btn btn-primary" style={{ marginTop: '8px' }}>
          <Sparkles size={14} />
          <span>Browse Files</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b', marginTop: '12px' }}>
          <ShieldCheck size={14} color="#10b981" />
          <span>True Vector & Font Preservation</span>
        </div>
      </div>
    </div>
  );
};
