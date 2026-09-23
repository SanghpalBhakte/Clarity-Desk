# Timetable OCR test kit

Reusable fixture set for testing Clarity-Desk's timetable scanner without re-uploading every time.

```
images/            3 real-world sample timetables (see below)
expected-output/   hand-verified ground-truth JSON for each image, following schema.json
schema.json         the target structure every extractor output should match
```

## Samples

| File | What it is | Difficulty |
|---|---|---|
| `sample-01_sy-aids_printed_wef-2026-07-20.jpg` | Clean printed A4 scan, standard grid | Easy — baseline |
| `sample-02_sy-aids_spreadsheet-revision_wef-2026-07-30.jpg` | Same class, one week later, spreadsheet screenshot. Changed cells are colored red by the preparer | Medium — tests version diffing + color-as-signal |
| `sample-03_fy-aids_whatsapp-photo_wef-2025-12-22.jpg` | Phone photo of a laminated sheet, forwarded via WhatsApp, re-compressed, glare band across top rows | Hard — tests degraded-image handling |

Ground truth in `expected-output/*.json` was produced by direct visual reading (by me), not run through any OCR tool — treat it as the target, but skim the `notes[]` array in `sample-03.json` especially before trusting it 100%; a few fields there are genuinely ambiguous in the source photo and are flagged rather than guessed.

## Why Tesseract is the wrong tool for this job

Every sample above needs **table-structure understanding**, not character recognition:
- merged cells spanning multiple periods (`OE-1` across periods 3–4)
- stacked multi-entry cells (3 different batches in one slot)
- a legend table that has to be joined back to abbreviations used in the grid
- in sample-02, *meaning encoded in font color* (red = changed since last week)

Tesseract gives you a flat string of recognized characters with rough bounding boxes. It has no concept of "this cell spans columns 3–4" or "these three lines belong together." Reconstructing table structure from Tesseract output with regex/heuristics is exactly the "throwing stuff at the wall" pattern — it's fighting the tool, not solving the problem. That's very likely why the current pipeline keeps breaking on real-world (non-perfectly-scanned) inputs like sample-03.

## Recommended direction

**Primary extractor: a multimodal vision LLM prompted to return the `schema.json` shape directly** (image in, structured JSON out, one call). This is what Gemini was already being used for — the idea was right, the problem is a single point of failure on one provider's free tier.

**Fix the rate-limit problem by fanning out across providers, not by falling back to a fundamentally weaker tool:**

| Provider | Vision model | Free tier (verify current numbers before relying on them) | Notes |
|---|---|---|---|
| Google Gemini | `gemini-2.5-flash` / `2.0-flash` | Generous RPM/RPD on the free API tier | Keep as one option, not the only one |
| Groq | Llama vision models (e.g. `llama-4-scout`) | Free, very high throughput, fast inference | Good primary fallback — check current model/rate-limit page, these change often |
| OpenRouter | `:free`-suffixed vision models (Qwen2-VL, Llama vision, etc.) | $0, no card required, per-model rate limits | Good second/third fallback, wide model selection |
| Mistral | Pixtral | Free tier available | Another option to rotate through |

Chain: try provider A → on 429/quota error, try provider B → try provider C → only if **all** structured-extraction attempts fail, fall back to raw Tesseract text with an explicit "structure not guaranteed, please review" flag on the result — never silently present a Tesseract-reconstructed table as if it were reliable.

**Self-hosted alternative worth evaluating in parallel:** PaddleOCR's PP-StructureV2 does real table-structure detection (not just text) and is free/unlimited/local — no rate limits at all. It tends to do better on clean scans (sample-01) and worse on messy real-world photos (sample-03) than a good vision-LLM prompt, so it's a candidate for a "try structure-aware local model first, escalate to LLM only when confidence is low" pipeline — cuts API usage/cost without sacrificing quality on the easy cases.

## How to use this kit

1. Point whatever extraction function/endpoint Clarity-Desk currently has at `images/sample-0N_*.jpg`.
2. Diff its output against `expected-output/sample-0N.json` field by field (institution, grid entries per day/period, legends).
3. Because these are saved locally, this loop doesn't need you to re-upload anything — just tell me what changed in the extraction code (or share repo access) and I can re-run the comparison here.

Once I have real access to Clarity-Desk's code (folder path or repo access), the next step is wiring one real extractor call against `sample-01.jpg` (the easy case) and getting it byte-for-byte matching `expected-output/sample-01.json` before touching the harder two.
