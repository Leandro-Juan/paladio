#!/usr/bin/env python3
"""Assemble encoded Paladio stock footage chapters into a master reel and index."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

CANONICAL_CHAPTERS: list[tuple[str, str, str]] = [
    (
        "01_auth_and_dashboard",
        "Authentication & Dashboard Overview",
        "Login view, hero ActiveTripTicket, HarmonicRadarWidget & pace/budget cards, BestOfferCard, navigation, and dashboard trips.",
    ),
    (
        "02_trip_itinerary_days_map_edit",
        "Trip Itinerary, Day Tabs, POI Inspector & Edit Mode",
        "Day 1-4 selection, route stops, POI inspector carousel/lightbox/translate/bookmark, side drawer collapse/reopen, Detailed Transit View, Edit Mode reorder/lock, and full-bleed map pan.",
    ),
    (
        "03_trip_search_sliders_waypoints_custom_poi",
        "Unified Search, Sliders, Waypoints & Custom POIs",
        "Keyword & semantic RAG searches, load-more pagination, category filters, price/duration/radius sliders, waypoint route checks, Add POI modal, and map location picker.",
    ),
    (
        "04_trip_transit_weather_collections",
        "Transit Pass, Weather Forecast & Saved Collections",
        "Regional transit pass recommendations, multi-day weather telemetry & clothing guidance, saved collections browsing, status filters, creation, and import places modal.",
    ),
    (
        "05_trip_wallet_costs_photos",
        "Trip Wallet, Expenses Budget & Photo Gallery",
        "Wallet tickets & .pkpass/PDF viewers, QR inspection, adding expenses & category budget charts, currency toggles, and trip photo upload/lightbox gallery.",
    ),
    (
        "06_trip_config_agent_multicity",
        "Trip Configuration, AI Travel Agent & Multi-City",
        "Trip preferences & DateRangePicker, pacing toggles, Start Date shift modal, interactive AI agent chat with quick chips & map focus cards, plus multi-city workspace switch.",
    ),
    (
        "07_engine_trip_creation",
        "Trip Engine Creation & Boarding Pass Autofill",
        "Prompt-based & guided destination creation, PDF boarding pass autofill, DateRangePicker, pace & constraint presets, solver preview, and launching generated itinerary.",
    ),
    (
        "08_monitoring_deals_telemetry_calendar",
        "Monitoring Hub, Fare Deals & Telemetry Calendar",
        "Deal watch route alerts, fare price sliders, carrier/timeframe filters, TimescaleDB market tick charts, sparklines, and seasonal pricing calendar.",
    ),
    (
        "09_vault_world_map_stats_recaps",
        "Travel Vault, World Map, Stats & Recaps",
        "Interactive World GeoJSON map zoom/country highlights, travel stats dashboard, milestone badges, past trip recaps, and journal export views.",
    ),
    (
        "10_taste_calibration_and_pois",
        "Taste Calibration & Discovery POIs",
        "Interactive taste preference swipe/rating deck, category weight tuning, semantic RAG affinity preview, and recommended POIs inspection.",
    ),
    (
        "11_config_all_10_sections",
        "System Configuration (All 10 Sections)",
        "Walkthrough of all 10 settings sections: account/security, notifications, Solver Constraints & Pacing sliders, LLM providers, scrapers, storage, and diagnostics.",
    ),
    (
        "12_themes_dock_and_i18n_rtl",
        "Themes, Navigation Dock & i18n RTL Showcase",
        "Theme switching across shipped visual presets, persistent navigation dock behaviors, and live multi-language i18n including Arabic RTL layout mirror verification.",
    ),
    (
        "13_help_center_all_categories",
        "Help Center & Knowledge Base",
        "Category navigation across all documentation sections, rich guide articles, keyword search, keyboard shortcut reference, and troubleshooting views.",
    ),
]


def fmt_hms(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hrs, rem = divmod(total, 3600)
    mins, secs = divmod(rem, 60)
    return f"{hrs:02d}:{mins:02d}:{secs:02d}"


def probe_chapter(mp4_path: Path) -> dict[str, float | int]:
    res = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(mp4_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(res.stdout)
    streams = payload.get("streams") or []
    if not streams:
        raise RuntimeError(f"No video stream in {mp4_path}")
    width = int(streams[0]["width"])
    height = int(streams[0]["height"])
    duration = float(payload["format"]["duration"])
    if width <= 0 or height <= 0 or duration <= 0:
        raise RuntimeError(
            f"Invalid stream metrics for {mp4_path}: {width}x{height} {duration}s"
        )
    return {"width": width, "height": height, "duration": duration}


def parse_args() -> argparse.Namespace:
    default_repo = Path(__file__).resolve().parents[3]
    default_out = Path(os.environ.get("STOCK_OUT_DIR", default_repo / "stock-footage"))
    default_work = Path(os.environ.get("STOCK_WORK_DIR", default_out / ".work"))

    parser = argparse.ArgumentParser(
        description="Concatenate Paladio stock footage chapters."
    )
    parser.add_argument("--out-dir", type=Path, default=default_out)
    parser.add_argument("--work-dir", type=Path, default=default_work)
    parser.add_argument(
        "--chapters",
        type=str,
        default="",
        help="Optional comma-separated chapter prefixes/slugs (default: all 13 canonical chapters)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_dir: Path = args.out_dir.resolve()
    work_dir: Path = args.work_dir.resolve()
    chapters_dir = out_dir / "chapters"
    work_dir.mkdir(parents=True, exist_ok=True)

    selected = CANONICAL_CHAPTERS
    if args.chapters.strip():
        tokens = [t.strip() for t in args.chapters.split(",") if t.strip()]
        filtered = []
        for slug, title, desc in CANONICAL_CHAPTERS:
            num = slug.split("_", 1)[0]
            if any(tok == slug or tok == num or tok.zfill(2) == num for tok in tokens):
                filtered.append((slug, title, desc))
        if not filtered:
            print(
                f"[assemble_master] ERROR: --chapters '{args.chapters}' matched nothing",
                file=sys.stderr,
            )
            return 1
        selected = filtered

    rows = []
    cumulative = 0.0
    concat_lines = []
    missing = []

    for slug, title, desc in selected:
        mp4 = chapters_dir / f"{slug}.mp4"
        if not mp4.is_file() or mp4.stat().st_size == 0:
            missing.append(str(mp4))
            continue
        meta = probe_chapter(mp4)
        start = cumulative
        cumulative += float(meta["duration"])
        size_mb = mp4.stat().st_size / (1024 * 1024)
        rows.append(
            {
                "slug": slug,
                "title": title,
                "desc": desc,
                "file": f"chapters/{slug}.mp4",
                "duration": float(meta["duration"]),
                "start": start,
                "end": cumulative,
                "resolution": f"{meta['width']}x{meta['height']}",
                "size_mb": size_mb,
            }
        )
        escaped = str(mp4).replace("'", "'\\''")
        concat_lines.append(f"file '{escaped}'")

    if missing:
        print("[assemble_master] ERROR: missing chapter video files:", file=sys.stderr)
        for path in missing:
            print(f"  - {path}", file=sys.stderr)
        return 1

    concat_list = work_dir / "concat_list.txt"
    concat_list.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    master_mp4 = out_dir / "paladio_complete_stock_footage.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "warning",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(master_mp4),
        ],
        check=True,
    )

    master_meta = probe_chapter(master_mp4)
    master_dur = float(master_meta["duration"])
    master_size_mb = master_mp4.stat().st_size / (1024 * 1024)

    master_sheet = out_dir / "master_sheet.jpg"
    interval = max(master_dur / 20.0, 1.0)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(master_mp4),
            "-vf",
            f"select='isnan(prev_selected_t)+gte(t-prev_selected_t,{interval:.3f})',scale=384:216,tile=5x4",
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(master_sheet),
        ],
        check=False,
    )

    index_lines = [
        "# Paladio Complete Stock Footage Index",
        "",
        f"- **Master Reel**: [paladio_complete_stock_footage.mp4](paladio_complete_stock_footage.mp4) (`{master_meta['width']}x{master_meta['height']}`, `30 fps`, `{fmt_hms(master_dur)}` / `{master_dur:.2f}s`, `{master_size_mb:.1f} MiB`)",
        "- **Contact Sheet**: [master_sheet.jpg](master_sheet.jpg) (5x4 overview)",
        f"- **Chapters Included**: `{len(rows)}`",
        "",
        "## Chapter Breakdown & Timestamps",
        "",
        "| # | Chapter | Start | End | Duration | Resolution | Size | Clip |",
        "| - | ------- | ----- | --- | -------- | ---------- | ---- | ---- |",
    ]

    for idx, row in enumerate(rows, start=1):
        index_lines.append(
            f"| {idx:02d} | **{row['title']}** | `{fmt_hms(row['start'])}` | `{fmt_hms(row['end'])}` | `{row['duration']:.2f}s` | `{row['resolution']}` | `{row['size_mb']:.1f} MiB` | [`{row['slug']}.mp4`]({row['file']}) |"
        )

    index_lines.extend(["", "## Chapter Coverage Notes", ""])
    for row in rows:
        index_lines.append(
            f"- **[{row['slug']}]({row['file']})** (`{fmt_hms(row['start'])} - {fmt_hms(row['end'])}`): {row['desc']}"
        )

    index_path = out_dir / "FOOTAGE_INDEX.md"
    index_path.write_text("\n".join(index_lines) + "\n", encoding="utf-8")

    print(
        f"MASTER READY: {master_mp4} ({len(rows)} chapters, {fmt_hms(master_dur)} / {master_dur:.2f}s, {master_size_mb:.1f} MiB)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
