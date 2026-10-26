"""Model identity and paths, shared by the downloader and the server."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"

# Pinned so benchmark results are reproducible. Update deliberately.
MODEL_REPO = "wanderkid/unimernet_tiny"
MODEL_REVISION = "3f09ac4b1cd583be47ea20a7d7daef839473028a"
MODEL_NAME = "unimernet_tiny"
MODEL_DIR = MODELS_DIR / MODEL_NAME
CHECKPOINT = MODEL_DIR / f"{MODEL_NAME}.pth"

# Matches UniMERNet's published eval preprocessing (configs/demo.yaml).
IMAGE_SIZE = (192, 672)
MAX_SEQ_LEN = 1536
