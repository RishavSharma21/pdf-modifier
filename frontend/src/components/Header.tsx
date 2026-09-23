import React from 'react';
import { Upload, Download, FileText } from 'lucide-react';

interface HeaderProps {
  filename: string | null;
  onUploadClick: () => void;
  onExportClick: () => void;
  hasDocument: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  filename,
  onUploadClick,
  onExportClick,
  hasDocument,
}) => {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-logo">
          <FileText size={18} />
        </div>
        <span className="brand-title">PDFModifier</span>
        <span className="brand-badge">Phase 1 Engine</span>
      </div>

      <div className="header-center">
        {filename && (
          <div className="doc-name" title={filename}>
            {filename}
          </div>
        )}
      </div>

      <div className="header-actions">
        <button className="btn" onClick={onUploadClick} id="btn-upload">
          <Upload size={15} />
          <span>Upload PDF</span>
        </button>

        {hasDocument && (
          <button className="btn btn-primary" onClick={onExportClick} id="btn-export">
            <Download size={15} />
            <span>Export Modified PDF</span>
          </button>
        )}
      </div>
    </header>
  );
};
