import { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { Dropzone } from './components/Dropzone';
import { PdfViewer } from './components/PdfViewer';
import { FindReplacePanel } from './components/FindReplacePanel';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { useToast } from './components/Toast';
import * as pdfjsLib from 'pdfjs-dist';
import {
  uploadPdf,
  getSession,
  analyzePage,
  editPdfText,
  deletePdfImage,
  adjustPdfImage,
  undoPdfEdit,
  redoPdfEdit,
  getDownloadUrl,
} from './services/api';
import type { SessionInfo, EditableText, ImageObject } from './types/pdf';

export function App() {
  const { showToast } = useToast();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sharedPdfDoc, setSharedPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [editableObjects, setEditableObjects] = useState<EditableText[]>([]);
  const [imageObjects, setImageObjects] = useState<ImageObject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [forceSkeleton] = useState<boolean>(false);
  const [pdfRefreshKey, setPdfRefreshKey] = useState<number>(0);
  const [editCount, setEditCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [activeMatchKey, setActiveMatchKey] = useState<string | null>(null);
  const [allSearchMatchIds, setAllSearchMatchIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditingActive, setIsEditingActive] = useState<boolean>(false);

  // Light / Dark Theme Management with LocalStorage Persistence (Default: Light)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('pdf_modifier_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      document.documentElement.setAttribute('data-theme', theme);
      return;
    }

    document.documentElement.classList.add('theme-transitioning');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pdf_modifier_theme', theme);

    const timer = setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 280);

    return () => clearTimeout(timer);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleThemeRef = useRef(toggleTheme);
  useEffect(() => {
    toggleThemeRef.current = toggleTheme;
  }, [toggleTheme]);

  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() => {
    return !!new URLSearchParams(window.location.search).get('session');
  });

  // ---------------------------------------------------------------------------
  // Session Persistence on Refresh & History (Back / Forward) Navigation
  // ---------------------------------------------------------------------------
  // Restore active session ONLY when the URL explicitly contains ?session=…
  // Visiting bare "/" always shows the home/upload screen and clears any stale session.
  useEffect(() => {
    let isMounted = true;
    const restoreSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlSessionId = params.get('session');
      const urlPage = parseInt(params.get('page') || '1', 10);

      // If the URL has no session param, treat it as a fresh home visit.
      // Clear any stale localStorage entry so the user always starts clean.
      if (!urlSessionId) {
        localStorage.removeItem('pdf_active_session_id');
        setIsRestoringSession(false);
        return;
      }

      // Only use the explicit URL session id (no localStorage fallback for bare /)
      const targetSessionId = urlSessionId;

      if (!targetSessionId) {
        setIsRestoringSession(false);
        return;
      }

      try {
        setIsLoading(true);
        const info = await getSession(targetSessionId);
        if (!isMounted) return;

        setSession(info);
        const validPage = Math.min(Math.max(urlPage || 1, 1), info.pageCount || 1);
        setCurrentPage(validPage);
        localStorage.setItem('pdf_active_session_id', info.sessionId);

        // Synchronize URL query params
        const newParams = new URLSearchParams(window.location.search);
        newParams.set('session', info.sessionId);
        newParams.set('page', String(validPage));
        window.history.replaceState(
          { type: 'editor', sessionId: info.sessionId, page: validPage },
          '',
          `?${newParams.toString()}`
        );
      } catch (err) {
        console.warn('Could not restore previous session:', err);
        localStorage.removeItem('pdf_active_session_id');
        window.history.replaceState(null, '', window.location.pathname);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsRestoringSession(false);
        }
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = async () => {
      const params = new URLSearchParams(window.location.search);
      const querySessionId = params.get('session');
      const queryPage = parseInt(params.get('page') || '1', 10);

      // If user navigated back to home (no session in URL)
      if (!querySessionId) {
        setSession(null);
        localStorage.removeItem('pdf_active_session_id');
        setIsFindReplaceOpen(false);
        setIsShortcutsOpen(false);
        return;
      }

      // If session changed in history
      if (session?.sessionId !== querySessionId) {
        try {
          setIsLoading(true);
          const info = await getSession(querySessionId);
          setSession(info);
          setCurrentPage(Math.min(Math.max(queryPage || 1, 1), info.pageCount || 1));
          localStorage.setItem('pdf_active_session_id', info.sessionId);
        } catch {
          setSession(null);
          localStorage.removeItem('pdf_active_session_id');
        } finally {
          setIsLoading(false);
        }
      } else {
        // Just page changed
        setCurrentPage(Math.min(Math.max(queryPage || 1, 1), session.pageCount || 1));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [session?.sessionId, session?.pageCount]);

  // Keep URL query param ?page=X synchronized when page changes
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const currentPageInUrl = parseInt(params.get('page') || '1', 10);
    if (currentPageInUrl !== currentPage) {
      params.set('session', session.sessionId);
      params.set('page', String(currentPage));
      window.history.replaceState(
        { type: 'editor', sessionId: session.sessionId, page: currentPage },
        '',
        `?${params.toString()}`
      );
    }
  }, [session, currentPage]);

  // Scroll-wheel zoom on the main canvas area
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.5), 3.0));
  }, []);

  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ---------------------------------------------------------------------------
  // Global keyboard shortcuts — ref pattern avoids stale closures.
  // keyStateRef is updated every render so handlers always see current state.
  // ---------------------------------------------------------------------------
  const keyStateRef = useRef({
    session: null as SessionInfo | null,
    editCount: 0,
    redoCount: 0,
    currentPage: 1,
    totalPages: 1,
    isFindReplaceOpen: false,
  });

  // Keep ref in sync on every render (no cost, just a ref write)
  keyStateRef.current = {
    session,
    editCount,
    redoCount,
    currentPage,
    totalPages: session?.pageCount ?? 1,
    isFindReplaceOpen,
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never intercept when the user is typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const s = keyStateRef.current;
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — Undo
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (s.session && s.editCount > 0) handleUndoRef.current();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z — Redo
      if ((ctrl && e.key === 'y') || (ctrl && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        if (s.session && s.redoCount > 0) handleRedoRef.current();
        return;
      }

      // Ctrl+F — Find & Replace
      if (ctrl && e.key === 'f') {
        e.preventDefault();
        if (s.session) setIsFindReplaceOpen((v) => !v);
        return;
      }

      // Ctrl++ or Ctrl+= — Zoom In
      if (ctrl && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setScale((prev) => Math.min(prev + 0.25, 3.0));
        return;
      }

      // Ctrl+- — Zoom Out
      if (ctrl && e.key === '-') {
        e.preventDefault();
        setScale((prev) => Math.max(prev - 0.25, 0.5));
        return;
      }

      // Ctrl+0 — Fit to Width (Best Editing Ratio)
      if (ctrl && e.key === '0') {
        e.preventDefault();
        handleFitWidthRef.current();
        return;
      }

      // Ctrl+9 — Fit Entire Page to Screen
      if (ctrl && e.key === '9') {
        e.preventDefault();
        handleFitPageRef.current();
        return;
      }

      // Arrow Left / Up — previous page
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && s.session) {
        e.preventDefault();
        setCurrentPage((prev) => Math.max(1, prev - 1));
        return;
      }

      // Ctrl+Shift+L — Toggle Light / Dark theme
      if (ctrl && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        toggleThemeRef.current();
        return;
      }

      // Arrow Right / Down — next page
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && s.session) {
        e.preventDefault();
        setCurrentPage((prev) => Math.min(s.totalPages, prev + 1));
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // Empty deps — intentional, we use refs above


  // Fast Client-Side Page Analysis Cache (Instantaneous page navigation without server lag)
  const pageAnalysisCache = useRef<Map<number, { textObjects: EditableText[]; imageObjects: ImageObject[] }>>(new Map());

  // Clear cache on new session or home visit
  useEffect(() => {
    pageAnalysisCache.current.clear();
  }, [session?.sessionId]);

  // Analyze page whenever session or currentPage changes
  useEffect(() => {
    if (!session) return;

    // Fast Path: If page data is already cached, apply immediately in 0ms!
    const cached = pageAnalysisCache.current.get(currentPage);
    if (cached) {
      setEditableObjects(cached.textObjects);
      setImageObjects(cached.imageObjects);
      return;
    }

    let isMounted = true;
    const fetchPageData = async () => {
      try {
        // Do NOT trigger isProcessing(true) here! isProcessing is exclusively for mutation/saving states.
        const res = await analyzePage(session.sessionId, currentPage);
        if (isMounted) {
          const texts = res.textObjects || [];
          const images = res.imageObjects || [];
          pageAnalysisCache.current.set(currentPage, { textObjects: texts, imageObjects: images });
          setEditableObjects(texts);
          setImageObjects(images);
        }
      } catch (err) {
        console.error('Failed to analyze page:', err);
      }
    };

    fetchPageData();
    return () => {
      isMounted = false;
    };
  }, [session?.sessionId, currentPage]);

  // Calculate dynamic optimal editing ratio (Fit Width) or whole-page overview (Fit Page)
  const calculateOptimalScale = useCallback(
    (mode: 'width' | 'page' = 'width', customPage?: number) => {
      if (!session) return 2.0;
      const pageNum = customPage ?? currentPage;
      const pageMeta = session.pages.find((p) => p.page === pageNum) || session.pages[0];
      if (!pageMeta || !pageMeta.width) return 2.0;

      const viewportEl = document.getElementById('canvas-viewport');
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      let availableWidth = 0;

      if (viewportEl && viewportEl.clientWidth > 0) {
        // Mobile: 8px left + 8px right = 16px. Desktop: 40px left + 40px right = 80px
        const padding = isMobile ? 16 : 80;
        availableWidth = viewportEl.clientWidth - padding;
      } else {
        const sidebarWidth = isMobile ? 0 : 200;
        availableWidth = Math.max(window.innerWidth - sidebarWidth - (isMobile ? 16 : 100), 280);
      }

      if (mode === 'width') {
        const raw = availableWidth / pageMeta.width;
        // Precision 2 decimal places, clamped between 0.35 (phone width fit) and 3.0
        return Math.min(Math.max(Math.round(raw * 100) / 100, 0.35), 3.0);
      } else {
        const widthScale = availableWidth / pageMeta.width;
        if (isMobile) {
          return Math.min(Math.max(Math.round(widthScale * 100) / 100, 0.35), 1.5);
        }
        // Balanced Overview Ratio for desktop
        const balanced = Math.round((widthScale * 0.62) * 20) / 20;
        return Math.min(Math.max(balanced, 1.15), 1.35);
      }
    },
    [session, currentPage]
  );

  // Auto-fit document to best editing ratio once session and workspace are ready
  const autoFitSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) {
      autoFitSessionIdRef.current = null;
      return;
    }
    if (autoFitSessionIdRef.current === session.sessionId) return;
    autoFitSessionIdRef.current = session.sessionId;

    const timer = setTimeout(() => {
      // Calculate optimal fit-to-width so all text lines and margins are 100% visible without cutoff
      const opt = calculateOptimalScale('width', 1);
      setScale(opt);
    }, 60);
    return () => clearTimeout(timer);
  }, [session, calculateOptimalScale]);

  // Mobile orientation change (only trigger on substantial horizontal width change, not URL bar height collapse)
  const lastMobileWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 0);
  useEffect(() => {
    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const curWidth = window.innerWidth;
        if (Math.abs(curWidth - lastMobileWidthRef.current) > 40) {
          lastMobileWidthRef.current = curWidth;
          if (curWidth <= 768 && session) {
            // Keep full document clearly visible on orientation flip
            setScale(calculateOptimalScale('width'));
          }
        }
      }, 200);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [session, calculateOptimalScale]);

  // Handle file selection with zero-latency instant client-side preview
  const handleFileSelected = async (file: File) => {
    try {
      setIsLoading(true);

      // Instantly start reading local bytes into PDF.js in the background (0ms network delay!)
      file.arrayBuffer().then(async (buf) => {
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: buf,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
            cMapPacked: true,
          });
          const doc = await loadingTask.promise;
          setSharedPdfDoc(doc);
        } catch (e) {
          console.warn('Instant local PDF parse note:', e);
        }
      });

      const sessionInfo = await uploadPdf(file);
      setSession(sessionInfo);
      setCurrentPage(1);
      localStorage.setItem('pdf_active_session_id', sessionInfo.sessionId);

      // Pre-populate page 1 analysis immediately if provided by backend upload (saves 1 sequential roundtrip!)
      if (sessionInfo.initialAnalysis) {
        const texts = sessionInfo.initialAnalysis.textObjects || [];
        const images = sessionInfo.initialAnalysis.imageObjects || [];
        pageAnalysisCache.current.set(1, { textObjects: texts, imageObjects: images });
        setEditableObjects(texts);
        setImageObjects(images);
      }

      // Push history state so the browser back button returns to the home screen instead of exiting the site!
      window.history.pushState(
        { type: 'editor', sessionId: sessionInfo.sessionId, page: 1 },
        '',
        `?session=${encodeURIComponent(sessionInfo.sessionId)}&page=1`
      );

      // Instantly compute best editing ratio for the uploaded document
      const firstPage = sessionInfo.pages[0];
      if (firstPage && firstPage.width) {
        const viewportEl = document.getElementById('canvas-viewport');
        const availableWidth =
          viewportEl && viewportEl.clientWidth > 0
            ? viewportEl.clientWidth - 80
            : Math.max(window.innerWidth - 200 - 100, 320);
        const raw = availableWidth / firstPage.width;
        const initialScale = Math.min(Math.max(Math.round(raw * 100) / 100, 0.5), 3.0);
        setScale(initialScale);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to upload document', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle zoom controls
  const handleZoomIn = () => setScale((prev) => Math.min(Math.round((prev + 0.25) * 100) / 100, 3.0));
  const handleZoomOut = () => setScale((prev) => Math.max(Math.round((prev - 0.25) * 100) / 100, 0.5));
  const handleFitWidth = useCallback(() => {
    const opt = calculateOptimalScale('width');
    setScale(opt);
  }, [calculateOptimalScale]);
  const handleFitPage = useCallback(() => {
    const opt = calculateOptimalScale('page');
    setScale(opt);
  }, [calculateOptimalScale]);

  // Go back to home / upload screen
  const handleGoHome = () => {
    localStorage.removeItem('pdf_active_session_id');
    window.history.pushState(null, '', window.location.pathname);
    setIsRestoringSession(false);
    setSession(null);
    setCurrentPage(1);
    setEditableObjects([]);
    setImageObjects([]);
    setEditCount(0);
    setRedoCount(0);
    setPdfRefreshKey(0);
    setActiveMatchKey(null);
    setAllSearchMatchIds([]);
    setSearchQuery('');
    setIsFindReplaceOpen(false);
  };

  const handleMatchChange = useCallback((activeKey: string | null, allIds: string[], query: string = '') => {
    setActiveMatchKey((prev) => (prev === activeKey ? prev : activeKey));
    setSearchQuery((prev) => (prev === query ? prev : query));
    setAllSearchMatchIds((prev) => {
      if (prev.length === allIds.length && prev.every((id, idx) => id === allIds[idx])) {
        return prev;
      }
      return allIds;
    });
  }, []);

  // Handle edit commit with Optimistic Update
  const handleCommitEdit = async (
    originalText: string,
    newText: string,
    color?: string,
    targetTextId?: string,
    boundingBox?: any,
    origin?: [number, number]
  ) => {
    if (!session) return;

    // 1. Optimistic Instant In-Memory Update
    setEditableObjects((prev) =>
      prev.map((obj) => {
        if ((targetTextId && obj.id === targetTextId) || obj.text === originalText) {
          const updatedFont = { ...obj.font };
          if (color) {
            const c = color.replace('#', '');
            if (c.length === 6) {
              const r = parseInt(c.slice(0, 2), 16) / 255;
              const g = parseInt(c.slice(2, 4), 16) / 255;
              const b = parseInt(c.slice(4, 6), 16) / 255;
              updatedFont.color = [r, g, b];
            }
          }
          return {
            ...obj,
            text: newText,
            font: updatedFont,
          };
        }
        return obj;
      })
    );

    try {
      setIsProcessing(true);
      const res = await editPdfText(
        session.sessionId,
        currentPage,
        originalText,
        newText,
        color,
        targetTextId,
        boundingBox,
        origin
      );

      if (res.textObjects && res.textObjects.length > 0) {
        setEditableObjects(res.textObjects);
        pageAnalysisCache.current.set(currentPage, { textObjects: res.textObjects, imageObjects: res.imageObjects || [] });
      } else {
        pageAnalysisCache.current.delete(currentPage);
      }
      if (res.imageObjects) {
        setImageObjects(res.imageObjects);
      }

      setEditCount((prev) => prev + 1);
      setRedoCount(0);
      // Increment refresh key to reload PDF canvas in background
      setPdfRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      showToast(err.message || 'Failed to edit text', 'error');
      pageAnalysisCache.current.delete(currentPage);
      // Re-fetch page data on error to revert optimistic state
      try {
        const pageRes = await analyzePage(session.sessionId, currentPage);
        setEditableObjects(pageRes.textObjects || []);
        setImageObjects(pageRes.imageObjects || []);
      } catch (e) {}
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle deleting an image/logo
  const handleDeleteImage = async (boundingBox: any) => {
    if (!session) return;
    try {
      setIsProcessing(true);
      const res = await deletePdfImage(session.sessionId, currentPage, boundingBox);
      pageAnalysisCache.current.delete(currentPage);
      if (res.textObjects) setEditableObjects(res.textObjects);
      if (res.imageObjects) setImageObjects(res.imageObjects);
      setEditCount((prev) => prev + 1);
      setRedoCount(0);
      setPdfRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete image', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle adjusting an image/logo (move, resize, crop, or replace)
  const handleAdjustImage = async (
    originalBoundingBox: any,
    newBoundingBox: any,
    file?: File | Blob | null,
    cropBox?: any,
    pageNumber?: number
  ) => {
    if (!session) return;
    const targetPage = pageNumber ?? currentPage;
    try {
      setIsProcessing(true);
      const res = await adjustPdfImage(
        session.sessionId,
        targetPage,
        originalBoundingBox,
        newBoundingBox,
        file,
        cropBox
      );
      pageAnalysisCache.current.delete(targetPage);
      if (res.textObjects) setEditableObjects(res.textObjects);
      if (res.imageObjects) setImageObjects(res.imageObjects);
      setEditCount((prev) => prev + 1);
      setRedoCount(0);
      setPdfRefreshKey((prev) => prev + 1);
      showToast('Logo updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust logo', 'error');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };


  // Handle undo edit
  const handleUndo = async () => {
    if (!session || editCount <= 0) return;
    try {
      setIsProcessing(true);
      const res = await undoPdfEdit(session.sessionId);
      if (res.success) {
        setEditCount((prev) => Math.max(0, prev - 1));
        setRedoCount((prev) => prev + 1);
        setPdfRefreshKey((prev) => prev + 1);
        // Re-fetch page analysis so editableObjects reflects the reverted state
        // This also keeps Find & Replace search index in sync after undo
        try {
          const pageRes = await analyzePage(session.sessionId, currentPage);
          setEditableObjects(pageRes.textObjects || []);
          setImageObjects(pageRes.imageObjects || []);
        } catch (e) {}
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to undo edit', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle redo edit
  const handleRedo = async () => {
    if (!session || redoCount <= 0) return;
    try {
      setIsProcessing(true);
      const res = await redoPdfEdit(session.sessionId);
      if (res.success) {
        setEditCount((prev) => prev + 1);
        setRedoCount((prev) => Math.max(0, prev - 1));
        setPdfRefreshKey((prev) => prev + 1);
        // Re-fetch page analysis so editableObjects reflects the re-applied state
        try {
          const pageRes = await analyzePage(session.sessionId, currentPage);
          setEditableObjects(pageRes.textObjects || []);
          setImageObjects(pageRes.imageObjects || []);
        } catch (e) {}
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to redo edit', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Stable refs so the keyboard useEffect (empty deps) always calls the current version
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const handleFitWidthRef = useRef(handleFitWidth);
  const handleFitPageRef = useRef(handleFitPage);
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;
  handleFitWidthRef.current = handleFitWidth;
  handleFitPageRef.current = handleFitPage;


  const handleDownloadPdf = async () => {
    if (!session) return;
    try {
      setIsDownloading(true);
      const url = getDownloadUrl(session.sessionId);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to download PDF file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cleanName = session.filename.toLowerCase().endsWith('.pdf')
        ? session.filename.replace(/\.pdf$/i, '_modified.pdf')
        : `${session.filename}_modified.pdf`;
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      showToast('PDF downloaded successfully', 'success');
    } catch (err: any) {
      console.error('Download error:', err);
      showToast(err.message || 'Error downloading PDF', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const pdfUrl = session ? `${getDownloadUrl(session.sessionId)}&v=${pdfRefreshKey}` : '';

  return (
    <div className="app-container">
      <Header
        filename={session?.filename || (isRestoringSession ? 'Loading document…' : null)}
        onExportClick={handleDownloadPdf}
        onHomeClick={handleGoHome}
        hasDocument={!!session || isRestoringSession}
        isProcessing={isProcessing}
        isDownloading={isDownloading}
        onFindReplaceClick={session ? () => setIsFindReplaceOpen((v) => !v) : undefined}
        onShortcutsClick={() => setIsShortcutsOpen((v) => !v)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className={`main-workspace ${isEditingActive ? 'is-editing-mode' : ''}`} ref={canvasViewportRef}>
        {!session ? (
          isRestoringSession ? (
            <>
              <aside className="sidebar">
                <div className="sidebar-header">
                  <span>PAGES</span>
                </div>
                <div className="thumbnails-list">
                  <div className="thumbnail-item active">
                    <div className="thumb-preview" style={{ background: 'var(--surface-2)' }}>
                      <div className="skeleton-line" style={{ width: '70%', height: '80%', opacity: 0.15, margin: 'auto' }} />
                    </div>
                    <div className="thumb-label">Page 1</div>
                  </div>
                </div>
              </aside>
              <div className="pdf-viewer-root">
                <div className="canvas-viewport" id="canvas-viewport">
                  <div className="pdf-page-skeleton">
                    <div className="skeleton-shimmer-wave" />
                    <div className="skeleton-content-mock">
                      <div className="skeleton-line skeleton-title" />
                      <div className="skeleton-line skeleton-subtitle" />
                      <div className="skeleton-gap" />
                      <div className="skeleton-line skeleton-p1" />
                      <div className="skeleton-line skeleton-p2" />
                      <div className="skeleton-line skeleton-p3" />
                      <div className="skeleton-gap" />
                      <div className="skeleton-line skeleton-p2" />
                      <div className="skeleton-line skeleton-p1" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Dropzone onFileSelected={handleFileSelected} isLoading={isLoading} />
          )
        ) : (
          <>
            <Sidebar
              pages={session.pages}
              currentPage={currentPage}
              pdfUrl={pdfUrl}
              pdfDoc={sharedPdfDoc}
              onPageSelect={(p) => {
                setCurrentPage(p);
                const el = document.getElementById(`pdf-page-${p}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />

            <PdfViewer
              key={`${session.sessionId}-${pdfRefreshKey}`}
              pdfUrl={pdfUrl}
              pdfDoc={sharedPdfDoc}
              onPdfDocLoaded={(doc) => setSharedPdfDoc(doc)}
              currentPage={currentPage}
              totalPages={session.pageCount}
              pages={session.pages}
              scale={scale}
              editableObjects={editableObjects}
              imageObjects={imageObjects}
              isProcessing={isProcessing}
              forceSkeleton={forceSkeleton}
              activeMatchKey={activeMatchKey}
              allSearchMatchIds={allSearchMatchIds}
              searchQuery={searchQuery}
              onPageChange={(p, shouldScroll) => {
                setCurrentPage(p);
                if (shouldScroll) {
                  const el = document.getElementById(`pdf-page-${p}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              onCommitEdit={handleCommitEdit}
              onDeleteImage={handleDeleteImage}
              onReplaceImage={(bbox, file) => handleAdjustImage(bbox, bbox, file)}
              onAdjustImage={handleAdjustImage}
              onActiveEditChange={setIsEditingActive}
            />

            <Toolbar
              currentPage={currentPage}
              totalPages={session.pageCount}
              scale={scale}
              onPageChange={(p) => {
                setCurrentPage(p);
                setActiveMatchKey(null);
                setAllSearchMatchIds([]);
                setSearchQuery('');
                const el = document.getElementById(`pdf-page-${p}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onSetScale={(s) => setScale(s)}
              onFitWidth={handleFitWidth}
              onFitPage={handleFitPage}
              onUndo={handleUndo}
              canUndo={editCount > 0}
              onRedo={handleRedo}
              canRedo={redoCount > 0}
            />

            {isFindReplaceOpen && (
              <FindReplacePanel
                isOpen={isFindReplaceOpen}
                onClose={() => {
                  setIsFindReplaceOpen(false);
                  setActiveMatchKey(null);
                  setAllSearchMatchIds([]);
                  setSearchQuery('');
                }}
                editableObjects={editableObjects}
                currentPage={currentPage}
                onMatchChange={handleMatchChange}
                onReplaceOne={async (obj, newText) => {
                  await handleCommitEdit(obj.text, newText, undefined, obj.id, obj.boundingBox, obj.origin);
                }}
              />
            )}
          </>
        )}
      </div>

      <ShortcutsPanel
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}

export default App;

