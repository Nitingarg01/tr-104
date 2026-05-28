# PROJECT KNOWLEDGE BASE — Podcast Insight Studio

**Generated:** 2026-05-03
**Commit:** 9565b34
**Branch:** Nitin_garg

## OVERVIEW

Flask web app + CLI pipeline that transcribes podcasts/audio, detects topic boundaries, produces segment summaries, keywords, sentiment scores, and embeddings. Flat directory — 7 Python files, no packages, no build system, no tests, no CI.

## STRUCTURE

```
PodcastProject/
├── app.py                  # Flask web server entry point
├── run_pipeline.py          # Pipeline orchestrator (839 lines, single source of truth)
├── transcribe.py            # Legacy — not used by app/CLI
├── segment.py               # Legacy — not used by app/CLI
├── preprocess.py            # Legacy — not used by app/CLI
├── parameter_tuning.py      # Legacy — not used by app/CLI
├── download_audio.py        # Legacy — hardcoded YouTube URL, DO NOT run
├── requirements.txt         # Dependencies
├── templates/
│   └── index.html           # Web UI template
├── static/                  # Minimal (2 files)
├── results/                 # 25 generated JSON artifacts (git-tracked — bloat risk)
└── data/                    # Not in repo; created at runtime (raw_audio, clean_audio, transcripts)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Start web UI | `app.py` | Flask server @ :5000, debug mode |
| Run pipeline | `run_pipeline.py` | CLI: `python run_pipeline.py <file>` |
| Pipeline config | Top of `run_pipeline.py` | WHISPER_MODEL, SUMMARY_MODE, SKIP_TUNING etc. |
| Upload limit | `app.py` | MAX_CONTENT_LENGTH = 512MB |
| Job handling | `app.py` | Daemon threads, in-memory state |
| Pipeline stages | `run_pipeline.py` | preprocess → transcribe → tune → segment/enrich |
| Legacy scripts | `transcribe.py`, `segment.py`, `preprocess.py`, `parameter_tuning.py`, `download_audio.py` | Ignore unless asked |

## Developer commands

```bash
# Activate venv (named `myenv`, not `.venv` or `venv`)
source myenv/bin/activate

# Install deps
pip install -r requirements.txt

# Start web UI → http://localhost:5000
python app.py

# Run pipeline on one file (expects file in data/raw_audio/)
python run_pipeline.py podcast.wav
```

Always run from the repo root. All scripts use relative paths.

## Architecture & entrypoints

| File | Role |
|---|---|
| `app.py` | Flask web server (upload, URL ingest, job status, episode listing, media serving). Runs pipeline via `subprocess` calling `run_pipeline.py`. Each job runs in a daemon thread. |
| `run_pipeline.py` | Main pipeline orchestrator (839 lines). Stages: preprocess → transcribe → tune → segment/enrich. This is the single source of truth for processing. |
| `transcribe.py`, `segment.py`, `preprocess.py`, `parameter_tuning.py`, `download_audio.py` | **Legacy standalone scripts** from before `run_pipeline.py` unified them. They still exist but are not used by the web app or CLI. Safe to ignore unless specifically asked about. |

## Data directory layout

```
data/
  raw_audio/     # Input WAV/MP3/M4A/FLAC/OGG (gitignored: *.wav)
  clean_audio/   # Preprocessed 16kHz mono WAV (gitignored: *.wav)
  raw_video/     # Downloaded video from yt-dlp (NOT gitignored — clean up manually)
  transcripts/   # Intermediate Whisper JSON + TXT outputs (NOT gitignored)
results/
  <episode_id>.json          # Segments, summaries, keywords, sentiment
  <episode_id>_embeddings.json  # Per-segment embedding vectors
```

## Pipeline stages (run_pipeline.py)

1. **Preprocess** — librosa load @ 16kHz mono, noise reduce (`noisereduce`), normalize. Output: `data/clean_audio/<name>.wav`
2. **Transcribe** — `faster-whisper` with `tiny` model, `int8` quantization, CPU-only, 8 threads, VAD filter. Falls back to 300s chunked transcription if OOM. Output: `data/transcripts/<name>.json`
3. **Parameter tuning** — evaluates segmentation params (block_size × k) using embedding cosine-similarity separation score. Skip with `SKIP_TUNING = True` (currently `False`).
4. **Segment & enrich** — boundary detection via embedding similarity, then keyword extraction (KeyBERT), summarization (BART or extractive fallback), sentiment (VADER). Output: `results/<episode_id>.json` + `_embeddings.json`

`SKIP_IF_EXISTS = True` — stages with existing outputs are skipped. Delete intermediate files to force re-run.

## External prerequisites

- **FFmpeg** must be on PATH for video ingest (URL upload or video file upload).
- **First-run model downloads** (happen automatically):
  - spaCy `en_core_web_sm` — run `python -m spacy download en_core_web_sm` to pre-install
  - NLTK `vader_lexicon` — auto-downloaded on first use
  - Transformers `sshleifer/distilbart-cnn-12-6` — auto-downloaded on first use

## Key configuration knobs (top of run_pipeline.py)

- `WHISPER_MODEL = "tiny"` — change to `base`/`small` for better accuracy (slower, more RAM)
- `SUMMARY_MODE = "abstractive"` — options: `"nltk"`, `"extractive"`, `"abstractive"`, `"hybrid"`
- `REMOVE_SILENCE = False` — set True to strip silence (breaks timestamp alignment with original audio)
- `TRANSCRIBE_CHUNK_SECONDS = 300` — chunk size for OOM fallback
- `SKIP_TUNING = False` — set True to use fixed `block_size=5`, `k=1.0`

## CONVENTIONS

- Flat script layout — no `__init__.py`, no packages, no `src/` dir
- No linter/formatter config (no `.flake8`, `pyproject.toml`, `.editorconfig`)
- No test suite or test directory
- All scripts use relative paths from repo root
- Virtual env named `myenv/` (not `.venv` or `venv`)

## ANTI-PATTERNS (THIS PROJECT)

- **Results in git** — `results/*.json` tracked; accumulates over time, bloats repo
- **Legacy scripts present** — 5 standalone scripts not used by app/CLI; don't confuse them with active code
- **`download_audio.py`** — hardcoded YouTube URL; DO NOT run as-is
- **`data/transcripts/` not gitignored** — Whisper JSON outputs accumulate there
- **No CI/CD** — no `.github/workflows`, no Makefile, no automated verification

## UNIQUE STYLES

- Pipeline uses `SKIP_IF_EXISTS = True` — stages skip if intermediate outputs exist (delete to force re-run)
- Whisper falls back to 300s chunked mode on OOM
- Flask app spawns pipeline via `subprocess` (not import) — each job in daemon thread
- Job state is in-memory only (no persistence layer)

## NOTES

- No test suite exists. Verify changes by running `python run_pipeline.py <file>` or uploading via the web UI.
- `myenv/` is the venv directory (not the common `.venv` or `venv`). The `.gitignore` ignores `venv/` and `.venv/` but not `myenv/`.
- `download_audio.py` has a hardcoded YouTube URL — do not run it as-is.
- The Flask app uses `debug=True` in `app.py` — only for local dev.
- All ML models run on CPU (`device="cpu"`). No GPU support configured.
- Upload limit is 512 MB (`MAX_CONTENT_LENGTH` in app.py).
- Job state is in-memory only — lost on server restart.
- `results/*.json` and `*_embeddings.json` are tracked by git — they accumulate over time and may bloat the repo.
- `data/transcripts/` is NOT gitignored — Whisper JSON outputs accumulate there too.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
