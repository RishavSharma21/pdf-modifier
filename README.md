# PDF Modifier

A high-fidelity PDF editing suite that performs **surgical in-place vector modification** on existing PDF documents without rasterization, destructive Word round-tripping, or whiteout overlay hacks.

---

## ✨ Features

- **Surgical Text Editing**: Direct PDF content stream editing that preserves original fonts, kerning, and vector layouts.
- **Continuous Multi-Page Viewer**: Smooth, Google Drive-style continuous scrolling powered by PDF.js with real-time text selection overlays.
- **In-Place WYSIWYG Controls**: Edit text directly on canvas with contextual font color picking, text deletion, and instant commit.
- **Global Find & Replace**: Search keywords across all pages with occurrence counter and one-click batch replace.
- **Image Operations**: Select, delete, or replace images and logos embedded in the PDF.
- **Text Insertion**: Add new text anywhere on the page with customizable font family, size, and color.
- **Undo / Redo History**: Full revision stack with instant state restoration.
- **Mobile Responsive & Dark Mode**: Ergonomic interface designed for both desktop workstations and mobile devices.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11, FastAPI, PyMuPDF (fitz), PikePDF (QPDF engine)
- **Frontend**: React 19, TypeScript, Vite, PDF.js, Lucide Icons
- **Testing**: Pytest with automated regression and layout validation suites

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
# Navigate to repository root
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt  # Or: pip install fastapi uvicorn pymupdf pikepdf

# Start FastAPI server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be live at `http://localhost:8000` (docs at `http://localhost:8000/docs`).

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Testing

Run the full automated test suite (23 integration tests):

```bash
pytest
```

---

## 📁 Project Structure

```
PDFModifier/
├── backend/                  # FastAPI REST API & session services
│   └── app/
│       ├── api/endpoints.py  # Upload, analyze, modify, undo/redo routes
│       └── services/         # PDF session state management
├── core/                     # Surgical PDF modification engine
│   ├── modification/         # Stream rewriting & in-place replacement
│   ├── pdf/                  # Page layout analyzer & stream lexer
│   └── validation/           # Dual-parser integrity verification
├── frontend/                 # React + TypeScript frontend
│   └── src/
│       ├── components/       # PdfViewer, Dropzone, Toolbar, FindReplace
│       └── services/api.ts   # Backend API client
└── tests/                    # Automated regression test suite
```

---

## 📄 License

MIT
