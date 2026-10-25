# PDF Modifier

PDF Modifier edits PDF content while aiming to preserve the document's existing layout, fonts, and vector graphics.

## Features

- Edit existing text and retain its typography where supported by the PDF.
- Browse multi-page documents in a continuous view.
- Find and replace text across a document.
- Insert, move, resize, or remove text and images.
- Rotate, delete, and redact pages or page regions.
- Undo and redo edits during the active backend process.

PDFs vary in how they encode text, fonts, and graphics, so results can differ by document. Keep an original copy and review exported files before relying on them.

## Run Locally

Requirements: Python 3.11 or newer, Node.js, and npm.

Start the API from the repository root:

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

In a second terminal, start the web app:

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Run backend tests from the repository root with `python -m pytest` and build the frontend with `cd frontend && npm run build`.

## Privacy and Deployment

When running locally, uploaded PDFs are processed by the backend on your machine and stored under `experiments/sessions`. When using a hosted deployment, files are sent to and processed by that deployment's server; do not upload sensitive documents unless you trust its operator and have reviewed its retention and access policies. Session files and undo history are not a substitute for durable backup, and undo/redo state is held in backend memory.

Uploads are limited to 50 MiB. Session identifiers are validated before they are used to access stored files.
