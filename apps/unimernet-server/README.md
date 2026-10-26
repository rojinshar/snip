# apps/unimernet-server

Local HTTP server that runs [UniMERNet](https://github.com/opendatalab/UniMERNet)-Tiny
(Apache-2.0) for `@snip/engine`'s `UnimernetEngine`. It loads the model once at startup,
warms it up, and serves one image at a time.

## Setup

Requires [uv](https://docs.astral.sh/uv/). uv installs Python 3.11 into `.venv/`; the system
Python is not touched.

```sh
cd apps/unimernet-server
uv sync                              # about 2 GB of dependencies (PyTorch etc.)
uv run python download_model.py      # pinned checkpoint, 430 MB, into models/
uv run uvicorn main:app --port 8765  # loads the model, then listens
```

Device selection: Apple GPU (MPS), then CUDA, then CPU. Override it with
`SNIP_UNIMERNET_DEVICE=cpu`.

To approximate a small server, limit CPU threads with `SNIP_UNIMERNET_THREADS=2`.
UniMERNet-Tiny decodes one token at a time, so per-core speed matters more than core count.
On an M5 Pro, 2 threads was slightly faster than the default 6.

## API

| Method | Path            | Body                    | Response                              |
| ------ | --------------- | ----------------------- | ------------------------------------- |
| POST   | `/v1/recognize` | raw image bytes, ≤10 MB | `{ latex, inference_ms, device }`     |
| GET    | `/healthz`      |                         | `{ status, model, revision, device }` |

Benchmark it from the repo root with `npm run bench -- --engines unimernet-tiny --concurrency 1`.
The server processes requests one at a time, so higher concurrency only adds queueing time
to the measured latency.

## Development

```sh
uv run ruff format . && uv run ruff check .
uv run pytest            # uses a fake recognizer; does not load the model
```

`.venv/` and `models/` are git-ignored. To uninstall, delete both.

## Notes

- `unimernet==0.2.3` pulls in packages we don't use (Jupyter, matplotlib). They stay inside
  `.venv/`.
- `pyarrow` is capped below 18 in `pyproject.toml`, because the unimernet dependency tree
  resolves to NumPy 1.x.
