import sys
import os

# Ensure project root is in sys.path so 'core' and 'backend' are always importable on Linux/Render
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Safe standard output/error encoding (safe on all cloud loggers)
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api.endpoints import router

app = FastAPI(
    title="PDFModifier Engine API",
    description="High-fidelity surgical PDF editing backend",
    version="0.1.0"
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for local dev (Vite on port 5173)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def health_check():
    return {
        "status": "online",
        "engine": "PDFModifier",
        "version": "0.1.0"
    }
