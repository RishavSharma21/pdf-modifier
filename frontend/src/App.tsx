import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { Dropzone } from './components/Dropzone';
import { PdfViewer } from './components/PdfViewer';
import { EditModal } from './components/EditModal';
import {
  uploadPdf,
  analyzePage,
  editPdfText,
  getDownloadUrl,
} from './services/api';
import type { SessionInfo, EditableText } from './types/pdf';

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [editableObjects, setEditableObjects] = useState<EditableText[]>([]);
  const [selectedText, setSelectedText] = useState<EditableText | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pdfRefreshKey, setPdfRefreshKey] = useState<number>(0);

  // Analyze page whenever session or currentPage changes
  useEffect(() => {
    if (!session) return;

    let isMounted = true;
    const fetchPageData = async () => {
      try {
        const res = await analyzePage(session.sessionId, currentPage);
        if (isMounted) {
          setEditableObjects(res.textObjects || []);
        }
      } catch (err) {
        console.error('Failed to analyze page:', err);
      }
    };

    fetchPageData();
    return () => {
      isMounted = false;
    };
  }, [session, currentPage, pdfRefreshKey]);

  // Handle file selection
  const handleFileSelected = async (file: File) => {
    try {
      setIsLoading(true);
      const sessionInfo = await uploadPdf(file);
      setSession(sessionInfo);
      setCurrentPage(1);
    } catch (err: any) {
      alert(err.message || 'Failed to upload document');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle zoom controls
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleFitWidth = () => setScale(1.4);
  const handleFitPage = () => setScale(1.0);

  // Handle edit commit
  const handleCommitEdit = async (originalText: string, newText: string) => {
    if (!session) return;
    await editPdfText(session.sessionId, currentPage, originalText, newText);
    // Increment refresh key to reload PDF in viewer
    setPdfRefreshKey((prev) => prev + 1);
  };

  // Export document
  const handleExport = () => {
    if (!session) return;
    const url = getDownloadUrl(session.sessionId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modified_${session.filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pdfUrl = session ? `${getDownloadUrl(session.sessionId)}&v=${pdfRefreshKey}` : '';

  return (
    <div className="app-container">
      <Header
        filename={session?.filename || null}
        onUploadClick={() => document.getElementById('pdf-file-input')?.click()}
        onExportClick={handleExport}
        hasDocument={!!session}
      />

      <div className="main-workspace">
        {!session ? (
          <Dropzone onFileSelected={handleFileSelected} isLoading={isLoading} />
        ) : (
          <>
            <Sidebar
              pages={session.pages}
              currentPage={currentPage}
              onPageSelect={(p) => setCurrentPage(p)}
            />

            <PdfViewer
              key={`${session.sessionId}-${pdfRefreshKey}`}
              pdfUrl={pdfUrl}
              currentPage={currentPage}
              scale={scale}
              editableObjects={editableObjects}
              onTextClick={(obj) => {
                setSelectedText(obj);
                setIsModalOpen(true);
              }}
            />

            <Toolbar
              currentPage={currentPage}
              totalPages={session.pageCount}
              scale={scale}
              onPageChange={(p) => setCurrentPage(p)}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onFitWidth={handleFitWidth}
              onFitPage={handleFitPage}
            />
          </>
        )}
      </div>

      <EditModal
        textObject={selectedText}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCommit={handleCommitEdit}
      />
    </div>
  );
}

export default App;
