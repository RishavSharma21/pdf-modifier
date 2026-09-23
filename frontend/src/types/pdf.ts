export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

export interface FontInfo {
  family: string;
  size: number;
  weight: string;
  style: string;
  color: [number, number, number];
  embedded: boolean;
  subsetted: boolean;
  resourceName?: string;
  encoding?: string;
  isCid: boolean;
  baseFont?: string;
}

export interface TextRun {
  id: string;
  text: string;
  boundingBox: BoundingBox;
  font: FontInfo;
  origin: [number, number];
  matrix?: number[];
}

export interface EditableText {
  id: string;
  pageNumber: number;
  text: string;
  boundingBox: BoundingBox;
  font: FontInfo;
  rotation: number;
  sourceObjectId?: string;
  runs: TextRun[];
}

export interface PageMeta {
  page: number;
  width: number;
  height: number;
  rotation: number;
}

export interface SessionInfo {
  sessionId: string;
  filename: string;
  pageCount: number;
  pages: PageMeta[];
}

export interface EditResult {
  success: boolean;
  strategy: "ORIGINAL_FONT_REUSED" | "ORIGINAL_FONT_PATCHED" | "FONT_SUBSTITUTED" | "UNSUPPORTED";
  details: string;
  metricsDeltaWidth: number;
  newBoundingBox?: BoundingBox;
  error?: string;
}
