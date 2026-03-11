# HSCode Live Capture Plan

## Status
- [x] Phase 1: Verify live source availability
- [x] Phase 2: Add parser/scraper tests
- [x] Phase 3: Implement resumable raw-data scraper
- [x] Phase 4: Execute live capture and record artifacts

## Goal
- First capture all currently reachable HSCode detail information from `hsbianma.com` into local raw files.
- Defer cleaning, schema mapping, and database import until after the raw snapshot is complete.

## Scope
- Source discovery: chapter keyword search pages (`01`-`99`)
- Detail capture: per-code pages under `/Code/<10-digit>.html`
- Output: structured JSON records plus run manifest for resume/retry

## Deliverables
- `backend/scripts/scrape_hscode_raw.py`
- `backend/scripts/test_scrape_hscode_raw.py`
- `backend/scripts/export_hscode_csv.py`
- `backend/scripts/test_export_hscode_csv.py`
- `backend/data/hscode-live/records/*.json`
- `backend/data/hscode-live/manifest.json`
- `backend/data/hscode-live/hscode-live.csv`

## Current Notes
- Live site verified on 2026-03-08: search pages return 200, detail pages use 10-digit codes.
- Existing repo HSCode seed data is sample-only and not sufficient for direct business use.
- Current raw snapshot count: 908 records under `backend/data/hscode-live/records`.
- Current CSV output: `backend/data/hscode-live/hscode-live.csv`.
