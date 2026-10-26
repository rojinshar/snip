import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from snip_unimernet.recognizer import Recognition
from snip_unimernet.server import MAX_IMAGE_BYTES, create_app


class FakeRecognizer:
    device = "cpu"

    def __init__(self) -> None:
        self.seen: list[tuple[int, int]] = []

    def recognize(self, image: Image.Image) -> Recognition:
        self.seen.append(image.size)
        return Recognition(latex="x ^ { 2 }", mean_token_prob=0.9, min_token_prob=0.5)


@pytest.fixture
def fake() -> FakeRecognizer:
    return FakeRecognizer()


@pytest.fixture
def client(fake: FakeRecognizer):
    with TestClient(create_app(lambda: fake)) as test_client:
        yield test_client


def png_bytes(size: tuple[int, int] = (40, 20)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_recognize_returns_latex(client: TestClient, fake: FakeRecognizer) -> None:
    response = client.post(
        "/v1/recognize", content=png_bytes(), headers={"content-type": "image/png"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["latex"] == "x ^ { 2 }"
    assert body["device"] == "cpu"
    assert body["confidence"] == {"mean_token_prob": 0.9, "min_token_prob": 0.5}
    assert body["inference_ms"] >= 0
    assert fake.seen == [(40, 20)]


def test_rejects_empty_body(client: TestClient) -> None:
    assert client.post("/v1/recognize", content=b"").status_code == 400


def test_rejects_non_image(client: TestClient) -> None:
    assert client.post("/v1/recognize", content=b"not an image").status_code == 400


def test_rejects_oversized_body(client: TestClient) -> None:
    response = client.post("/v1/recognize", content=b"0" * (MAX_IMAGE_BYTES + 1))
    assert response.status_code == 413


def test_healthz_reports_device(client: TestClient) -> None:
    body = client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["device"] == "cpu"
