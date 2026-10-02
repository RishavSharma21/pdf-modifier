import type { SessionInfo, EditResult, AnalyzeResponse } from '../types/pdf';

export const getApiBase = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return `${envUrl.trim().replace(/\/+$/, '')}/api/pdf`;
  }
  // Only use localhost:8000 when actually running locally — never use :8000 on deployed hosts
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:8000/api/pdf`;
    }
    // On Vercel (or any deployed host), use the Render backend
    return 'https://pdf-modifier-mdag.onrender.com/api/pdf';
  }
  return 'http://localhost:8000/api/pdf';
};

const API_BASE = getApiBase();

export async function uploadPdf(file: File): Promise<SessionInfo> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Failed to upload PDF');
  }

  return res.json();
}

export async function getSession(sessionId: string): Promise<SessionInfo> {
  const res = await fetch(`${API_BASE}/session/${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Session not found' }));
    throw new Error(err.detail || 'Failed to retrieve session');
  }
  return res.json();
}

export async function analyzePage(
  sessionId: string,
  page: number
): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, page }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Analysis failed' }));
    throw new Error(err.detail || 'Failed to analyze page');
  }

  return res.json();
}

export async function editPdfText(
  sessionId: string,
  page: number,
  originalText: string,
  newText: string,
  color?: string,
  targetTextId?: string,
  boundingBox?: any,
  origin?: [number, number]
): Promise<EditResult> {
  const res = await fetch(`${API_BASE}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      page,
      originalText,
      newText,
      color,
      targetTextId,
      boundingBox,
      origin,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Edit failed' }));
    throw new Error(err.detail || 'Failed to edit PDF text');
  }

  return res.json();
}

export async function undoPdfEdit(sessionId: string): Promise<{ success: boolean; reverted: boolean }> {
  const res = await fetch(`${API_BASE}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Undo failed' }));
    throw new Error(err.detail || 'Failed to undo edit');
  }

  return res.json();
}

export async function redoPdfEdit(sessionId: string): Promise<{ success: boolean; reapplied: boolean }> {
  const res = await fetch(`${API_BASE}/redo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Redo failed' }));
    throw new Error(err.detail || 'Failed to redo edit');
  }

  return res.json();
}

export function getDownloadUrl(sessionId: string): string {
  return `${API_BASE}/download/${sessionId}?t=${Date.now()}`;
}

export async function insertPdfText(
  sessionId: string,
  page: number,
  text: string,
  x: number,
  y: number,
  fontSize: number = 14,
  fontWeight: string = 'normal',
  fontFamily: string = 'Helvetica',
  color?: string
): Promise<EditResult> {
  const res = await fetch(`${API_BASE}/insert-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      page,
      text,
      x,
      y,
      fontSize,
      fontWeight,
      fontFamily,
      color,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Insert text failed' }));
    throw new Error(err.detail || 'Failed to insert text');
  }

  return res.json();
}

export async function deletePdfImage(
  sessionId: string,
  page: number,
  boundingBox: any
): Promise<EditResult> {
  const res = await fetch(`${API_BASE}/delete-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      page,
      boundingBox,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Delete image failed' }));
    throw new Error(err.detail || 'Failed to delete image');
  }

  return res.json();
}

export async function replacePdfImage(
  sessionId: string,
  page: number,
  boundingBox: any,
  file: File
): Promise<EditResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', sessionId);
  formData.append('page', page.toString());
  formData.append('boundingBox', JSON.stringify(boundingBox));

  const res = await fetch(`${API_BASE}/replace-image`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Replace image failed' }));
    throw new Error(err.detail || 'Failed to replace image');
  }

  return res.json();
}

export async function adjustPdfImage(
  sessionId: string,
  page: number,
  originalBoundingBox: any,
  newBoundingBox: any,
  file?: File | Blob | null,
  cropBox?: any
): Promise<EditResult> {
  const buildFormData = () => {
    const fd = new FormData();
    fd.append('sessionId', sessionId || '');
    fd.append('page', (page || 1).toString());
    const origBoxStr = JSON.stringify(originalBoundingBox || {});
    const newBoxStr = JSON.stringify(newBoundingBox || originalBoundingBox || {});
    fd.append('boundingBox', origBoxStr);
    fd.append('originalBoundingBox', origBoxStr);
    fd.append('newBoundingBox', newBoxStr);

    if (file) {
      if (file instanceof File) {
        fd.append('file', file);
      } else if (file instanceof Blob) {
        fd.append('file', file, 'replacement.png');
      }
    }
    if (cropBox) {
      fd.append('cropBox', JSON.stringify(cropBox));
    }
    return fd;
  };

  const extractDetail = (body: any): string => {
    if (!body) return 'Adjust image failed';
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      // Pydantic v2 validation error — format clearly with field names
      return body.detail
        .map((d: any) => {
          const loc = Array.isArray(d.loc)
            ? d.loc.filter((x: any) => x !== 'body').join('.')
            : '';
          return loc ? `${loc}: ${d.msg || 'invalid'}` : (d.msg || JSON.stringify(d));
        })
        .join('; ');
    }
    if (body.error && typeof body.error === 'string') return body.error;
    return JSON.stringify(body.detail || body);
  };

  let res = await fetch(`${API_BASE}/adjust-image`, {
    method: 'POST',
    body: buildFormData(),
  });

  if (res.status === 404) {
    // /adjust-image not available on this deployment — try /replace-image
    res = await fetch(`${API_BASE}/replace-image`, {
      method: 'POST',
      body: buildFormData(), // fresh FormData — don't reuse consumed stream
    });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Adjust image failed' }));
    throw new Error(extractDetail(body));
  }

  return res.json();
}



