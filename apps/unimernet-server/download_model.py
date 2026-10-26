"""Downloads the pinned UniMERNet-Tiny checkpoint into models/. Safe to re-run."""

from huggingface_hub import snapshot_download

from snip_unimernet.settings import CHECKPOINT, MODEL_DIR, MODEL_REPO, MODEL_REVISION


def main() -> None:
    snapshot_download(repo_id=MODEL_REPO, revision=MODEL_REVISION, local_dir=MODEL_DIR)
    size_mb = CHECKPOINT.stat().st_size / 1_000_000
    print(f"{MODEL_REPO}@{MODEL_REVISION[:8]} -> {MODEL_DIR} ({size_mb:.0f} MB checkpoint)")


if __name__ == "__main__":
    main()
