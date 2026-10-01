import os
import sys

# Ensure root directory is on sys.path
root_dir = os.path.dirname(os.path.abspath(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import uvicorn

if __name__ == "__main__":
    raw_port = os.environ.get("PORT", "10000")
    try:
        port = int(raw_port)
    except (ValueError, TypeError):
        port = 10000

    print(f"Starting PDFModifier API on 0.0.0.0:{port}...")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, log_level="info")
