"""Entry point: uv run uvicorn main:app --port 8765"""

from snip_unimernet.recognizer import UnimernetRecognizer
from snip_unimernet.server import create_app

app = create_app(UnimernetRecognizer)
