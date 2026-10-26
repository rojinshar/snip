"""HTTP API: POST an image, get LaTeX back."""

from __future__ import annotations

import io
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from snip_unimernet.recognizer import Recognizer
from snip_unimernet.settings import MODEL_REPO, MODEL_REVISION

MAX_IMAGE_BYTES = 10 * 1024 * 1024


class Confidence(BaseModel):
    mean_token_prob: float
    min_token_prob: float


class RecognizeResponse(BaseModel):
    latex: str
    confidence: Confidence
    inference_ms: float
    device: str


class HealthResponse(BaseModel):
    status: str
    model: str
    revision: str
    device: str


def create_app(load_recognizer: Callable[[], Recognizer]) -> FastAPI:
    """Builds the app. The recognizer is created at startup so the model loads once."""
    state: dict[str, Recognizer] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        state["recognizer"] = load_recognizer()
        yield
        state.clear()

    app = FastAPI(title="snip-unimernet", lifespan=lifespan)

    @app.get("/healthz")
    def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            model=MODEL_REPO,
            revision=MODEL_REVISION,
            device=state["recognizer"].device,
        )

    @app.post("/v1/recognize")
    async def recognize(request: Request) -> RecognizeResponse:
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="request body must be an image")
        if len(body) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="image larger than 10 MB")
        try:
            image = Image.open(io.BytesIO(body))
            image.load()
        except (UnidentifiedImageError, OSError) as error:
            raise HTTPException(status_code=400, detail="could not decode image") from error

        recognizer = state["recognizer"]
        started = time.perf_counter()
        result = recognizer.recognize(image)
        return RecognizeResponse(
            latex=result.latex,
            confidence=Confidence(
                mean_token_prob=result.mean_token_prob, min_token_prob=result.min_token_prob
            ),
            inference_ms=(time.perf_counter() - started) * 1000,
            device=recognizer.device,
        )

    return app
