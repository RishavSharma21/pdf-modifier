# PDF Modifier

Need to edit a PDF without ruining its formatting? Here it is.

Most PDF editors either slap a white box over existing text or convert the whole document to Word and back, breaking your fonts, alignments, and vector graphics. 

**PDF Modifier** does true in-place surgical editing directly inside the PDF stream. Your original fonts, kerning, tables, and layouts stay completely intact.

---

### What it can do:

- **Edit text directly**: Click any text and edit it in-place. Original typography and styling are preserved.
- **Continuous multi-page view**: Smooth, continuous document scrolling (just like Google Drive).
- **Find & Replace**: Search keywords across the entire document and replace them in one go.
- **Images & Logos**: Select, swap, or remove images embedded in the document.
- **Insert new text**: Add custom text runs anywhere with font, size, and color controls.
- **Full History**: Unlimited Undo / Redo for every change.
- **Private & Local**: Files are processed on your own machine—no external cloud dependencies.

---

### Quick Start

**1. Start the backend:**
```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

**2. Start the frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and start editing.
