"""Wraps the UniMERNet model: load once, then turn PIL images into LaTeX."""

from __future__ import annotations

import math
import os
import threading
import warnings
from dataclasses import dataclass
from typing import Protocol

import torch
from omegaconf import OmegaConf
from PIL import Image

from snip_unimernet.settings import CHECKPOINT, IMAGE_SIZE, MAX_SEQ_LEN, MODEL_DIR


@dataclass(frozen=True)
class Recognition:
    latex: str
    # Probabilities the model assigned to each token it emitted (greedy decoding), summarized.
    # mean: geometric mean over tokens. min: the least confident token. Both in (0, 1].
    mean_token_prob: float
    min_token_prob: float


class Recognizer(Protocol):
    """Anything that turns an image into LaTeX. Lets the server be tested without the model."""

    device: str

    def recognize(self, image: Image.Image) -> Recognition: ...


def summarize_log_probs(log_probs: list[float]) -> tuple[float, float]:
    """Returns (geometric mean prob, min prob) for per-token log probabilities."""
    if not log_probs:
        return 0.0, 0.0
    return math.exp(sum(log_probs) / len(log_probs)), math.exp(min(log_probs))


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

    def recognize(self, image: Image.Image) -> Recognition:
        pixels = self._processor(image.convert("RGB")).unsqueeze(0).to(self.device)
        # UniMERModel.generate drops the kwargs needed for scores, so call the underlying
        # Hugging Face model directly, mirroring its preprocessing (1 -> 3 channels).
        hf_model = self._model.model.model
        tokenizer = self._model.tokenizer
        with self._lock, torch.no_grad(), warnings.catch_warnings():
            warnings.simplefilter("ignore", category=UserWarning)
            output = hf_model.generate(
                pixel_values=pixels.repeat(1, 3, 1, 1),
                max_new_tokens=MAX_SEQ_LEN,
                decoder_start_token_id=tokenizer.tokenizer.bos_token_id,
                do_sample=False,
                output_scores=True,
                return_dict_in_generate=True,
            )
            # scores[i] holds the step-i logits; the token chosen at step i is sequences[:, i + 1]
            # (index 0 is the decoder start token). Greedy decoding, so no beam reordering.
            # compute_transition_scores() can't be used: it needs config.vocab_size, which
            # VisionEncoderDecoderConfig does not have.
            step_logits = torch.stack(output.scores, dim=1)[0].float()
            chosen = output.sequences[0, 1 : 1 + step_logits.shape[0]]
            log_probs = torch.log_softmax(step_logits, dim=-1).gather(1, chosen.unsqueeze(1))
        mean_prob, min_prob = summarize_log_probs(log_probs.squeeze(1).cpu().tolist())
        latex = str(tokenizer.token2str(output.sequences[:, 1:])[0])
        return Recognition(latex=latex, mean_token_prob=mean_prob, min_token_prob=min_prob)
