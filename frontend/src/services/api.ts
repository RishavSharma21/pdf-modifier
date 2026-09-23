import type { SessionInfo, EditableText, EditResult } from '../types/pdf';

const API_BASE = 'http://localhost:8000/api/pdf';

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

export async function analyzePage(
  sessionId: string,
  page: number
): Promise<{ page: number; fonts: Record<string, any>; textObjects: EditableText[] }> {
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
  newText: string
): Promise<EditResult> {
  const res = await fetch(`${API_BASE}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, page, originalText, newText }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Edit failed' }));
    throw new Error(err.detail || 'Failed to edit PDF text');
  }

  return res.json();
}

export function getDownloadUrl(sessionId: string): string {
  return `${API_BASE}/download/${sessionId}?t=${Date.now()}`;
}
