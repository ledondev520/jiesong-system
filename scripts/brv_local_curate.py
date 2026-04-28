from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
HOME_DIR = ROOT_DIR / "state" / "byterover-home"
CONTEXT_TREE_DIR = ROOT_DIR / ".brv" / "context-tree"


@dataclass
class SnapshotEntry:
    size: int
    mtime_ns: int


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "note"


def _titleize(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("-") if part)


def choose_fallback_relpath(files: list[str], context: str, timestamp: str) -> str:
    if files:
        first = Path(files[0])
        parent = _slugify(first.parent.as_posix()) if first.parent.as_posix() not in {"", "."} else "workspace"
        stem = _slugify(first.stem)
        return f"fallback_curations/{parent}/{stem}.md"

    first_line = context.strip().splitlines()[0] if context.strip() else timestamp
    return f"fallback_curations/workspace/{_slugify(first_line[:60])}.md"


def build_fallback_note(relpath: str, context: str, files: list[str], timestamp: str) -> str:
    slug = Path(relpath).stem.replace("_", "-")
    title = _titleize(slug)
    summary = context.strip().replace("\n", " ")
    summary = (summary[:157] + "...") if len(summary) > 160 else summary
    tags = ["byterover", "fallback", "technical-memory"]
    keywords = [_slugify(Path(f).stem) for f in files[:5]]
    keywords = [k for k in keywords if k]
    source_lines = "\n".join(f"- `{path}`" for path in files) if files else "- None provided"

    return f"""---
title: {title}
summary: {summary}
tags: [{", ".join(tags)}]
keywords: [{", ".join(keywords)}]
importance: 72
maturity: draft
createdAt: {timestamp}
updatedAt: {timestamp}
---
# {title}

This note was written by the local ByteRover curate fallback because the upstream curate run did not produce verified context-tree operations.

## Source Files

{source_lines}

## Captured Context

{context.strip() or "No context provided."}
"""


def snapshot_context_tree() -> dict[str, SnapshotEntry]:
    snapshot: dict[str, SnapshotEntry] = {}
    if not CONTEXT_TREE_DIR.exists():
        return snapshot

    for path in CONTEXT_TREE_DIR.rglob("*.md"):
        if ".git" in path.parts:
            continue
        stat = path.stat()
        relpath = path.relative_to(CONTEXT_TREE_DIR).as_posix()
        snapshot[relpath] = SnapshotEntry(size=stat.st_size, mtime_ns=stat.st_mtime_ns)
    return snapshot


def tree_changed(before: dict[str, SnapshotEntry], after: dict[str, SnapshotEntry]) -> bool:
    return before != after


def parse_log_id(stdout: str) -> str | None:
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            match = re.search(r"\b(cur-\d+)\b", line)
            if match:
                return match.group(1)
            continue

        data = payload.get("data")
        if isinstance(data, dict):
            log_id = data.get("logId")
            if isinstance(log_id, str) and log_id:
                return log_id
    return None


def load_registry() -> dict[str, Any]:
    registry_path = HOME_DIR / "Library" / "Application Support" / "brv" / "registry.json"
    if not registry_path.exists():
        return {}
    return json.loads(registry_path.read_text())


def get_project_storage_path() -> Path | None:
    registry = load_registry()
    projects = registry.get("projects", {})
    project = projects.get(str(ROOT_DIR))
    if not isinstance(project, dict):
        return None
    storage_path = project.get("storagePath")
    return Path(storage_path) if isinstance(storage_path, str) else None


def load_log_entry(log_id: str | None) -> dict[str, Any] | None:
    storage_path = get_project_storage_path()
    if storage_path is None:
        return None
    log_dir = storage_path / "curate-log"
    if not log_dir.exists():
        return None

    if log_id:
        target = log_dir / f"{log_id}.json"
        if target.exists():
            return json.loads(target.read_text())

    logs = sorted(log_dir.glob("cur-*.json"), key=lambda p: p.stat().st_mtime_ns, reverse=True)
    if not logs:
        return None
    return json.loads(logs[0].read_text())


def should_fallback(exit_code: int, log_entry: dict[str, Any] | None, changed: bool) -> bool:
    if exit_code != 0:
        return True
    if log_entry is None:
        return True
    if log_entry.get("status") != "completed":
        return True

    operations = log_entry.get("operations")
    if not isinstance(operations, list) or len(operations) == 0:
        return True

    summary = log_entry.get("summary")
    if isinstance(summary, dict):
        meaningful = sum(int(summary.get(key, 0) or 0) for key in ("added", "updated", "merged", "deleted"))
        if meaningful <= 0:
            return True

    return not changed


def extract_context_and_files(argv: list[str]) -> tuple[str, list[str], bool]:
    files: list[str] = []
    context_parts: list[str] = []
    json_output = False
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in {"--format", "-f"} and i + 1 < len(argv):
            if argv[i + 1] == "json":
                json_output = True
            if arg == "-f" and argv[i + 1] != "json":
                files.append(argv[i + 1])
            i += 2
            continue
        if arg == "--file" and i + 1 < len(argv):
            files.append(argv[i + 1])
            i += 2
            continue
        if arg.startswith("-"):
            i += 1
            continue
        context_parts.append(arg)
        i += 1

    context = " ".join(part for part in context_parts if part != "curate").strip()
    return context, files, json_output


def write_fallback_note(relpath: str, content: str) -> None:
    target = CONTEXT_TREE_DIR / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def emit_fallback_result(json_output: bool, relpath: str, reason: str, stdout: str, stderr: str) -> int:
    if stderr.strip() and "No provider connected" not in stderr:
        print(stderr.rstrip(), file=sys.stderr)
    if stdout.strip() and "No provider connected" not in stdout:
        print(stdout.rstrip(), file=sys.stderr)

    if json_output:
        payload = {
            "command": "curate",
            "data": {
                "event": "completed",
                "status": "completed",
                "message": "Context curated via local fallback",
                "fallbackPath": relpath,
                "fallbackReason": reason,
            },
            "success": True,
        }
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(f"Context curated via local fallback: {relpath}")
        print(f"Reason: {reason}")
    return 0


def main(argv: list[str]) -> int:
    before = snapshot_context_tree()
    proc = subprocess.run(
        ["brv", *argv],
        cwd=ROOT_DIR,
        env={**os.environ, "HOME": str(HOME_DIR)},
        capture_output=True,
        text=True,
    )
    after = snapshot_context_tree()
    changed = tree_changed(before, after)

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    log_entry = load_log_entry(parse_log_id(stdout))
    if not should_fallback(proc.returncode, log_entry, changed):
        if stdout:
            print(stdout, end="")
        if stderr:
            print(stderr, end="", file=sys.stderr)
        return proc.returncode

    context, files, json_output = extract_context_and_files(argv)
    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    relpath = choose_fallback_relpath(files, context, timestamp)
    note = build_fallback_note(relpath=relpath, context=context, files=files, timestamp=timestamp)
    write_fallback_note(relpath, note)

    reason = "underlying curate produced no verified context-tree write"
    if proc.returncode != 0:
        reason = "underlying curate command failed"
    elif log_entry and not log_entry.get("operations"):
        reason = "underlying curate completed with zero operations"
    elif not changed:
        reason = "underlying curate did not change the context tree"

    return emit_fallback_result(json_output, relpath, reason, stdout, stderr)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
