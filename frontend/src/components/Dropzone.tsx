import React, { useRef, useState, useEffect } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useToast } from './Toast';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelected, isLoading }) => {
  const { showToast } = useToast();
  const [isDragActive, setIsDragActive] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const triggerIngestion = (file: File) => {
    setIsIngesting(true);
    setTimeout(() => {
      onFileSelected(file);
      setIsIngesting(false);
    }, 200);
  };

  const handleLoadSample = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setIsIngesting(true);
    try {
      const res = await fetch('/sample.pdf');
      if (!res.ok) throw new Error('Demo sample file not found');
      const blob = await res.blob();
      let sampleFile: File;
      try {
        sampleFile = new File([blob], 'demo_agreement.pdf', { type: 'application/pdf' });
      } catch {
        sampleFile = Object.assign(blob, {
          name: 'demo_agreement.pdf',
          lastModified: Date.now(),
          webkitRelativePath: '',
        }) as File;
      }
      onFileSelected(sampleFile);
    } catch (err: any) {
      console.error('Could not load sample PDF:', err);
      showToast(err?.message || 'Could not load demo document', 'error');
    } finally {
      setIsIngesting(false);
    }
  };

  // Silent native keyboard shortcut Ctrl+O / Cmd+O
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        inputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global Drag & Drop handlers
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragActive(true);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragActive(false);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith('.pdf')) {
          triggerIngestion(file);
        } else {
          showToast('Please select or drop a PDF file (.pdf) to edit.', 'error');
        }
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [onFileSelected]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      triggerIngestion(e.target.files[0]);
    }
  };

  return (
    <div className={`landing-container ${isDragActive ? 'drag-active-mode' : ''}`}>
      <input
        type="file"
        ref={inputRef}
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={handleInputChange}
        id="pdf-file-input"
      />

      <div className="landing-content">
        {/* Balanced, Confident Headline */}
        <div className="landing-hero">
          <h1 className="landing-title">
            Edit PDF text.<br className="title-break" /> Keep the original.
          </h1>
          <p className="landing-subtitle">
            Direct in-place vector editing. Exact fonts and layouts preserved.
          </p>
        </div>

        {/* Clean, Unified Action Area */}
        <div className="landing-cta-zone" id="landing-cta-zone">
          {isLoading ? (
            <div className="landing-loading-box">
              <div className="modern-spinner-ring">
                <div className="spinner-core" />
              </div>
              <div className="landing-loading-title">Analyzing PDF…</div>
              <div className="landing-loading-subtitle">
                Parsing fonts and vector text objects
              </div>
              <div className="inline-progress-track">
                <div className="inline-progress-fill" />
              </div>
            </div>
          ) : (
            <div className="landing-action-group">
              <button
                type="button"
                className={`landing-cta-btn ${isDragActive ? 'drag-active' : ''} ${isIngesting ? 'is-ingesting' : ''}`}
                onClick={() => inputRef.current?.click()}
                id="btn-select-pdf"
              >
                <span className="btn-text-viewport">
                  <span className={`btn-text-slot ${!isDragActive ? 'slot-visible' : 'slot-hidden-top'}`}>
                    Select PDF file
                  </span>
                  <span className={`btn-text-slot ${isDragActive ? 'slot-visible' : 'slot-hidden-bottom'}`}>
                    Drop it. Let’s fix it.
                  </span>
                </span>
              </button>

              <div className="landing-sub-row">
                <span className="landing-drop-note">
                  {isDragActive ? 'Release to open' : 'or drop anywhere'}
                </span>
                <span className="landing-sep">·</span>
                <button
                  type="button"
                  className="landing-sample-trigger"
                  onClick={handleLoadSample}
                  id="btn-try-demo-sample"
                  title="Try with a sample document"
                >
                  <Sparkles size={12} className="sample-sparkle" />
                  <span>Try demo PDF</span>
                </button>
              </div>

              {/* Muted, subtle reassurance */}
              <p className="landing-no-login-note" id="landing-no-login-note">
                We hate login screens too.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Minimal Footer */}
      <footer className="landing-footer">
        <span className="footer-privacy">
          <ShieldCheck size={12} className="footer-icon" />
          <span>Files stay private on your device</span>
        </span>
      </footer>
    </div>
  );
};
