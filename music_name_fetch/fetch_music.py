#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import List, Optional


PROVIDER_MAP = {
    "youtube": "ytsearch",
    "soundcloud": "scsearch",
}


@dataclass
class Candidate:
    title: str
    uploader: str
    duration: Optional[int]
    url: str
    webpage_url: str
    source: str
    raw_score: float = 0.0


def ensure_binary(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"未找到依赖 `{name}`，请先安装。")


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\u4e00-\u9fff]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def run_json(cmd: List[str]) -> dict:
    result = subprocess.run(
        cmd,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def run_cmd(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, text=True)


def parse_candidates(data: dict) -> List[dict]:
    if not isinstance(data, dict):
        return []
    if data.get("_type") == "playlist" and isinstance(data.get("entries"), list):
        return [d for d in data["entries"] if isinstance(d, dict)]
    if isinstance(data.get("entries"), list):
        return [d for d in data["entries"] if isinstance(d, dict)]
    return [data]


def collect_candidates(query: str, providers: List[str], max_results: int) -> List[Candidate]:
    candidates: List[Candidate] = []
    is_url = bool(re.match(r"^https?://", query.strip()))
    expressions = [query] if is_url else []

    if not is_url:
        for provider in providers:
            prefix = PROVIDER_MAP.get(provider, provider)
            expressions.append(f"{prefix}{max_results}:{query}")

    seen = set()
    for expr in expressions:
        payload = run_json(
            ["yt-dlp", "--no-warnings", "--skip-download", "-J", expr]
        )
        for entry in parse_candidates(payload):
            url = entry.get("webpage_url") or entry.get("url") or ""
            if not url:
                continue
            key = (url, entry.get("title", ""), entry.get("uploader", ""))
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                Candidate(
                    title=entry.get("title", "Unknown") or "Unknown",
                    uploader=entry.get("uploader") or "",
                    duration=entry.get("duration"),
                    url=url,
                    webpage_url=entry.get("webpage_url") or url,
                    source=entry.get("extractor_key", provider_from_url(url)),
                )
            )
    return candidates


def provider_from_url(url: str) -> str:
    if "youtube" in url:
        return "youtube"
    if "soundcloud" in url:
        return "soundcloud"
    return "unknown"


def score_candidates(query: str, candidates: List[Candidate]) -> List[Candidate]:
    q = query
    for c in candidates:
        title_score = similarity(q, c.title)
        uploader_score = similarity(q, f"{c.uploader} {c.title}")
        c.raw_score = title_score * 0.8 + uploader_score * 0.2
    return sorted(candidates, key=lambda x: x.raw_score, reverse=True)


def format_duration(seconds: Optional[int]) -> str:
    if not seconds or seconds <= 0:
        return "--:--"
    mins = seconds // 60
    secs = seconds % 60
    return f"{mins:02d}:{secs:02d}"


def choose_candidate(candidates: List[Candidate], interactive: bool) -> Candidate:
    if not candidates:
        raise RuntimeError("未找到任何可下载候选。")

    if not interactive or len(candidates) == 1:
        return candidates[0]

    print("候选结果：")
    for idx, c in enumerate(candidates[:10], start=1):
        print(
            f"{idx:>2}. {c.title} | {c.uploader} | {format_duration(c.duration)} | "
            f"{c.source} | score={c.raw_score:.3f}"
        )
    while True:
        choice = input("输入序号选择（回车默认1）：").strip()
        if choice == "":
            return candidates[0]
        if not choice.isdigit():
            print("请输入数字")
            continue
        idx = int(choice)
        if 1 <= idx <= min(len(candidates), 10):
            return candidates[idx - 1]
        print("超出范围")


def sanitize_filename(text: str) -> str:
    text = text.strip().replace("/", "-").replace("\\", "-")
    text = re.sub(r'[\\/:*?"<>|]', "-", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "unknown"


def make_unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    i = 1
    while True:
        candidate = path.with_name(f"{path.stem}_{i}{path.suffix}")
        if not candidate.exists():
            return candidate
        i += 1


def download_audio(candidate: Candidate, workdir: Path) -> Path:
    template = workdir / "source.%(ext)s"
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-f",
        "bestaudio/best",
        "-o",
        str(template),
        candidate.webpage_url,
    ]
    run_cmd(cmd)

    files = sorted(workdir.glob("source.*"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise RuntimeError("下载完成后未找到源文件。")
    return files[0]


def transcode_audio(src: Path, dst: Path, fmt: str, bitrate: str) -> None:
    if fmt == "wav":
        cmd = ["ffmpeg", "-y", "-i", str(src), "-vn", "-acodec", "pcm_s16le", str(dst)]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            bitrate,
            str(dst),
        ]
    run_cmd(cmd)


def print_result(path: Path, candidate: Candidate, fmt: str) -> None:
    print("下载完成")
    print(f"来源: {candidate.source}")
    print(f"标题: {candidate.title}")
    print(f"作者: {candidate.uploader}")
    print(f"输出: {path}")
    print(f"格式: {fmt}")


def main() -> None:
    parser = argparse.ArgumentParser(description="根据歌曲名搜索并下载音频")
    parser.add_argument("query", help="歌曲名，或可播放链接")
    parser.add_argument("--format", choices=["mp3", "wav"], default="mp3")
    parser.add_argument("--bitrate", default="2", help="MP3 质量，越小质量越好（推荐 2~5）")
    parser.add_argument(
        "--output-dir",
        default=str(
            Path("/Users/helena/Cursor/jiesong_system/music_name_fetch") / "outputs"
        ),
        help="输出文件夹，默认放在脚本目录下的 outputs",
    )
    parser.add_argument(
        "--providers",
        nargs="+",
        default=["youtube", "soundcloud"],
        help="检索源（默认: youtube soundcloud）",
    )
    parser.add_argument("--max-results", type=int, default=5)
    parser.add_argument("--no-interactive", action="store_true", help="不弹出选择，自动用最高分条目")
    parser.add_argument("--keep-source", action="store_true", help="保留下载中间文件")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只执行检索与打分，不下载",
    )

    args = parser.parse_args()
    query = args.query.strip()

    ensure_binary("yt-dlp")
    ensure_binary("ffmpeg")

    output_root = Path(args.output_dir).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir = output_root / datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir.mkdir()

    candidates = collect_candidates(query, args.providers, args.max_results)
    candidates = score_candidates(query, candidates)

    if not candidates:
        raise RuntimeError("未找到可用候选。")

    selected = choose_candidate(
        candidates,
        interactive=(not args.no_interactive and sys.stdin.isatty()),
    )

    if args.dry_run:
        print("dry-run 结果：")
        print(f"将选择: {selected.title} | {selected.uploader} | 分数={selected.raw_score:.3f}")
        return

    source_file = download_audio(selected, run_dir)
    name = sanitize_filename(f"{selected.uploader} - {selected.title}" if selected.uploader else selected.title)
    output_file = make_unique_path(run_dir / f"{name}.{args.format}")

    transcode_audio(source_file, output_file, args.format, args.bitrate)

    if not args.keep_source:
        source_file.unlink(missing_ok=True)

    print_result(output_file, selected, args.format)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"错误: {exc}")
        sys.exit(1)
