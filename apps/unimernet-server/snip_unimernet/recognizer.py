"""Wraps the UniMERNet model: load once, then turn PIL images into LaTeX."""

from __future__ import annotations

import os
import threading
import warnings
from typing import Protocol

import torch
from omegaconf import OmegaConf
from PIL import Image

from snip_unimernet.settings import CHECKPOINT, IMAGE_SIZE, MAX_SEQ_LEN, MODEL_DIR


class Recognizer(Protocol):
    """Anything that turns an image into LaTeX. Lets the server be tested without the model."""

    device: str

    def recognize(self, image: Image.Image) -> str: ...


def pick_device() -> str:
    """SNIP_UNIMERNET_DEVICE wins; otherwise Apple GPU, then CUDA, then CPU."""
    override = os.environ.get("SNIP_UNIMERNET_DEVICE")
    if override:
        return override
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


class UnimernetRecognizer:
    def __init__(self, device: str | None = None, warm_up: bool = True) -> None:
        if not CHECKPOINT.exists():
            raise FileNotFoundError(
                f"Model checkpoint not found at {CHECKPOINT}. Run: uv run python download_model.py"
            )

        # Importing these registers UniMERNet's model and processor classes.
        import unimernet.models  # noqa: F401
        import unimernet.processors  # noqa: F401
        from unimernet.common.registry import registry
        from unimernet.processors import load_processor

        self.device = device or pick_device()
        model_cfg = OmegaConf.create(
            {
                "arch": "unimernet",
                "model_type": "unimernet",
                "model_config": {"model_name": str(MODEL_DIR), "max_seq_len": MAX_SEQ_LEN},
                "load_pretrained": True,
                "pretrained": str(CHECKPOINT),
                "tokenizer_config": {"path": str(MODEL_DIR)},
            }
        )
        with warnings.catch_warnings():
            # UniMERNet calls torch.cuda.amp.autocast, which warns and no-ops off CUDA.
            warnings.simplefilter("ignore", category=UserWarning)
            model = registry.get_model_class("unimernet").from_config(model_cfg)
        self._model = model.to(self.device).eval()
        self._processor = load_processor(
            "formula_image_eval", OmegaConf.create({"image_size": list(IMAGE_SIZE)})
        )
        # The model is not safe for concurrent use; requests run one at a time.
        self._lock = threading.Lock()
        if warm_up:
            # The first generate() compiles GPU kernels and takes seconds; pay that at startup.
            self.recognize(Image.new("RGB", (IMAGE_SIZE[1], IMAGE_SIZE[0]), "white"))

    def recognize(self, image: Image.Image) -> str:
        pixels = self._processor(image.convert("RGB")).unsqueeze(0).to(self.device)
        with self._lock, warnings.catch_warnings():
            warnings.simplefilter("ignore", category=UserWarning)
            output = self._model.generate({"image": pixels})
        return str(output["pred_str"][0])
