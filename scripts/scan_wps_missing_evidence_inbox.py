#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_missing_evidence_intake_package.json + local incoming dirs
Output: parsed/wps_missing_evidence_incoming_scan.{json,csv,md}
Pos: WPS 缺失材料本机收件扫描器；只读扫描收件目录，按路径与内容识别精确 cloud 原件与正式报关候选；不写库不复制

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
INTAKE_JSON = PARSED_DIR / "wps_missing_evidence_intake_package.json"
OUT_JSON = PARSED_DIR / "wps_missing_evidence_incoming_scan.json"
OUT_CSV = PARSED_DIR / "wps_missing_evidence_incoming_scan.csv"
OUT_MD = PARSED_DIR / "wps_missing_evidence_incoming_scan.md"

FORMAL_EXTS = {".pdf", ".xls", ".xlsx", ".doc", ".docx", ".csv", ".txt"}
TEXT_EXTS = {".csv", ".txt"}
SKIP_DIR_NAMES = {
    ".git", "node_modules", "dist", "build", ".next", ".cache",
    "__pycache__", ".playwright-mcp",
}
CONTENT_SCAN_MAX_BYTES = 8 * 1024 * 1024
CONTENT_SCAN_MAX_CHARS = 240_000


@dataclass(frozen=True)
class CloudTarget:
    intake_id: str
    subject: str
    expected_size: int
    expected_sha1: str
    validation_runner: str


@dataclass(frozen=True)
class FormalNeed:
    intake_id: str
    subject: str
    contract_no: str
    document_no: str
    validation_runner: str


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"missing required input: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compact(value: Any, limit: int = 240) -> str:
    if isinstance(value, list):
        text = "; ".join(str(item) for item in value if item)
    elif isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value if value is not None else "")
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def parse_cloud_target(row: dict[str, Any]) -> CloudTarget | None:
    strict = row.get("strict_fields", "")
    size_match = re.search(r"expected_size=(\d+)", strict)
    sha1_match = re.search(r"expected_sha1=([0-9a-fA-F]{40})", strict)
    if not size_match or not sha1_match:
        return None
    return CloudTarget(
        intake_id=row.get("id", ""),
        subject=row.get("subject", ""),
        expected_size=int(size_match.group(1)),
        expected_sha1=sha1_match.group(1).lower(),
        validation_runner=row.get("validation_runner", ""),
    )


def load_requirements() -> tuple[list[CloudTarget], list[FormalNeed]]:
    intake = load_json(INTAKE_JSON)
    cloud_targets: list[CloudTarget] = []
    formal_needs: list[FormalNeed] = []
    for row in intake.get("rows") or []:
        if row.get("material_type") == "exact_cloud_original":
            target = parse_cloud_target(row)
            if target:
                cloud_targets.append(target)
        elif row.get("material_type") == "formal_customs_document":
            formal_needs.append(FormalNeed(
                intake_id=row.get("id", ""),
                subject=row.get("subject", ""),
                contract_no=row.get("contract_no", ""),
                document_no=row.get("document_no", ""),
                validation_runner=row.get("validation_runner", ""),
            ))
    return cloud_targets, formal_needs


def default_incoming_dirs() -> list[Path]:
    home = Path.home()
    return [
        ROOT / "tmp/wps_missing_evidence_inbox",
        ROOT / "tmp/wps_11_export_list_raw/incoming",
        home / "Downloads",
        home / "Downloads/出口外贸",
    ]


def iter_files(roots: Iterable[Path], max_files: int) -> tuple[list[Path], list[str]]:
    files: list[Path] = []
    skipped: list[str] = []
    seen: set[str] = set()
    for root in roots:
        if not root.exists():
            skipped.append(f"missing:{root}")
            continue
        if root.is_file():
            key = str(root.resolve())
            if key not in seen:
                seen.add(key)
                files.append(root)
            continue
        for path in root.rglob("*"):
            if len(files) >= max_files:
                skipped.append(f"max_files_reached:{max_files}")
                return files, skipped
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            if path.is_file():
                key = str(path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                files.append(path)
    return files, skipped


def normalized_text(path: Path) -> str:
    return str(path).lower().replace(" ", "")


def normalize_blob(text: str) -> str:
    return text.lower().replace(" ", "").replace("\u3000", "")


def strip_xml(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(" ".join(text.split()))


def decode_bytes(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "gb18030", "latin-1"):
        try:
            return data.decode(encoding, errors="ignore")
        except LookupError:
            continue
    return data.decode("utf-8", errors="ignore")


def read_limited_bytes(path: Path) -> bytes:
    with path.open("rb") as handle:
        return handle.read(CONTENT_SCAN_MAX_BYTES)


def extract_docx_text(path: Path) -> tuple[str, str]:
    parts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if name.startswith("word/") and name.endswith(".xml"):
                parts.append(strip_xml(decode_bytes(archive.read(name))))
                if sum(len(part) for part in parts) >= CONTENT_SCAN_MAX_CHARS:
                    break
    return "\n".join(parts)[:CONTENT_SCAN_MAX_CHARS], "docx_xml"


def extract_xlsx_text(path: Path) -> tuple[str, str]:
    parts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        preferred = [name for name in names if name == "xl/sharedStrings.xml"]
        preferred += [name for name in names if name.startswith("xl/worksheets/") and name.endswith(".xml")]
        for name in preferred:
            parts.append(strip_xml(decode_bytes(archive.read(name))))
            if sum(len(part) for part in parts) >= CONTENT_SCAN_MAX_CHARS:
                break
    return "\n".join(parts)[:CONTENT_SCAN_MAX_CHARS], "xlsx_xml"


def extract_search_text(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    if suffix == ".docx":
        try:
            return extract_docx_text(path)
        except (OSError, zipfile.BadZipFile, RuntimeError, KeyError):
            return "", "docx_xml_failed"
    if suffix == ".xlsx":
        try:
            return extract_xlsx_text(path)
        except (OSError, zipfile.BadZipFile, RuntimeError, KeyError):
            return "", "xlsx_xml_failed"
    if suffix in TEXT_EXTS:
        try:
            return decode_bytes(read_limited_bytes(path))[:CONTENT_SCAN_MAX_CHARS], "plain_text"
        except OSError:
            return "", "plain_text_failed"
    if suffix in {".pdf", ".xls", ".doc"}:
        try:
            # Binary fallback only exposes literal embedded strings; it is a hint source, not proof.
            return decode_bytes(read_limited_bytes(path))[:CONTENT_SCAN_MAX_CHARS], f"{suffix.lstrip('.')}_binary_text"
        except OSError:
            return "", f"{suffix.lstrip('.')}_binary_text_failed"
    return "", "not_scanned"


def formal_keywords(need: FormalNeed) -> set[str]:
    values = {need.subject, need.contract_no, need.document_no}
    keywords: set[str] = {"报关", "海关", "customs", "declaration"}
    for value in values:
        for token in re.split(r"[\s/\\_\-；;:：|]+", value):
            token = token.strip()
            if not token:
                continue
            if token.startswith("BGNDING"):
                continue
            if token.startswith("PENDING-"):
                token = token.replace("PENDING-", "")
            if len(token) >= 2:
                keywords.add(token)
    if "威斯敏" in need.subject or "威斯敏" in need.contract_no:
        keywords.update({"威斯敏", "westminster"})
    if "EXP2400006" in need.subject or "EXP2400006" in need.contract_no:
        keywords.add("EXP2400006")
    return {keyword.lower().replace(" ", "") for keyword in keywords if keyword}


def formal_candidate_strength(path: Path, blob: str) -> tuple[str, list[str]]:
    strong_signals = {
        "报关单", "出口货物报关单", "海关编号", "中华人民共和国海关",
        "customsdeclaration",
    }
    reference_signals = {"出货汇总", "装货清单", "装货单", "shipment", "summary"}
    strong_hits = sorted(signal for signal in strong_signals if signal.lower().replace(" ", "") in blob)
    reference_hits = sorted(signal for signal in reference_signals if signal.lower().replace(" ", "") in blob or signal.lower().replace(" ", "") in normalized_text(path))
    if strong_hits:
        return "strong_formal_customs_candidate", strong_hits
    if reference_hits:
        return "reference_summary_not_formal_customs", reference_hits
    return "weak_keyword_candidate", []


def find_formal_matches(path: Path, formal_needs: list[FormalNeed], search_text: str) -> tuple[list[FormalNeed], list[str], str, list[str]]:
    if path.suffix.lower() not in FORMAL_EXTS:
        return [], [], "", []
    text = normalized_text(path)
    content = normalize_blob(search_text)
    blob = text + "\n" + content
    candidate_status, signal_hits = formal_candidate_strength(path, blob)
    matches: list[FormalNeed] = []
    matched_keywords: set[str] = set()
    for need in formal_needs:
        keywords = formal_keywords(need)
        strong = {
            keyword for keyword in keywords
            if keyword.startswith("exp") or keyword in {"威斯敏", "westminster", "报关", "海关", "customs", "declaration"}
        }
        subject_hits = {
            keyword for keyword in strong
            if keyword not in {"报关", "海关", "customs", "declaration"} and keyword in blob
        }
        formal_hits = {
            keyword for keyword in {"报关", "海关", "customs", "declaration"}
            if keyword in blob
        }
        customs_no_hits = set(re.findall(r"\b\d{18}\b", blob))
        if subject_hits and (formal_hits or customs_no_hits or "exp2400006" in blob):
            matches.append(need)
            matched_keywords.update(subject_hits)
            matched_keywords.update(formal_hits)
            matched_keywords.update(list(customs_no_hits)[:3])
    return matches, sorted(matched_keywords)[:20], candidate_status, signal_hits


def scan(incoming_dirs: list[Path], max_files: int) -> dict[str, Any]:
    cloud_targets, formal_needs = load_requirements()
    target_sizes = {target.expected_size for target in cloud_targets}
    files, skipped = iter_files(incoming_dirs, max_files)
    cloud_matches: list[dict[str, Any]] = []
    formal_candidates: list[dict[str, Any]] = []
    scanned_by_ext = Counter(path.suffix.lower() or "<none>" for path in files)
    content_scanned = 0
    content_scan_failures = Counter()

    for path in files:
        try:
            stat = path.stat()
        except OSError as exc:
            skipped.append(f"stat_failed:{path}:{exc}")
            continue

        file_sha1 = ""
        if stat.st_size in target_sizes:
            try:
                file_sha1 = sha1_file(path)
            except OSError as exc:
                skipped.append(f"hash_failed:{path}:{exc}")
                continue
            for target in cloud_targets:
                if stat.st_size != target.expected_size:
                    continue
                exact = file_sha1 == target.expected_sha1
                cloud_matches.append({
                    "kind": "exact_cloud_original",
                    "intake_id": target.intake_id,
                    "subject": target.subject,
                    "path": str(path),
                    "size": stat.st_size,
                    "sha1": file_sha1,
                    "expected_size": target.expected_size,
                    "expected_sha1": target.expected_sha1,
                    "match": "exact" if exact else "size_only_hash_mismatch",
                    "ready_to_close": 1 if exact else 0,
                    "validation_runner": target.validation_runner,
                })

        search_text = ""
        extractor = "not_scanned"
        if path.suffix.lower() in FORMAL_EXTS and stat.st_size <= CONTENT_SCAN_MAX_BYTES:
            search_text, extractor = extract_search_text(path)
            content_scanned += 1
            if extractor.endswith("_failed"):
                content_scan_failures[extractor] += 1
        elif path.suffix.lower() in FORMAL_EXTS:
            extractor = "skipped_size_limit"
            content_scan_failures[extractor] += 1

        matched_needs, matched_keywords, candidate_status, signal_hits = find_formal_matches(path, formal_needs, search_text)
        if matched_needs:
            formal_candidates.append({
                "kind": "formal_customs_candidate",
                "path": str(path),
                "size": stat.st_size,
                "suffix": path.suffix.lower(),
                "matched_by": "path_or_content",
                "content_extractor": extractor,
                "matched_keywords": matched_keywords,
                "formal_signal_hits": signal_hits,
                "matched_intake_ids": [need.intake_id for need in matched_needs[:20]],
                "matched_subjects": [need.subject for need in matched_needs[:10]],
                "candidate_status": candidate_status,
                "ready_to_apply": 0,
                "validation_runner": matched_needs[0].validation_runner,
            })

    exact_ready = sum(1 for row in cloud_matches if row["ready_to_close"])
    strong_formal_count = sum(1 for row in formal_candidates if row["candidate_status"] == "strong_formal_customs_candidate")
    reference_formal_count = sum(1 for row in formal_candidates if row["candidate_status"] == "reference_summary_not_formal_customs")
    report = {
        "status": "missing_evidence_incoming_scan_complete",
        "mode": "read_only_no_db_writes_no_file_copy",
        "inputs": {
            "intake_package": str(INTAKE_JSON.relative_to(ROOT)),
            "incoming_dirs": [str(path) for path in incoming_dirs],
        },
        "counts": {
            "files_seen": len(files),
            "cloud_targets": len(cloud_targets),
            "cloud_size_or_exact_matches": len(cloud_matches),
            "cloud_exact_ready_to_close": exact_ready,
            "formal_needs": len(formal_needs),
            "formal_candidate_files": len(formal_candidates),
            "formal_strong_candidate_files": strong_formal_count,
            "formal_reference_candidate_files": reference_formal_count,
            "content_scanned_files": content_scanned,
            "content_scan_failures": sum(content_scan_failures.values()),
            "ready_for_apply": 0,
            "skipped": len(skipped),
        },
        "scanned_by_ext": [{"ext": key, "count": value} for key, value in scanned_by_ext.most_common()],
        "content_scan_failures": [{"reason": key, "count": value} for key, value in content_scan_failures.most_common()],
        "cloud_matches": cloud_matches,
        "formal_candidates": formal_candidates,
        "skipped": skipped[:200],
    }
    return report


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "kind", "path", "intake_id", "subject", "size", "sha1", "match",
        "ready_to_close", "matched_intake_ids", "matched_subjects",
        "matched_by", "content_extractor", "matched_keywords", "formal_signal_hits", "candidate_status",
        "ready_to_apply", "validation_runner",
    ]
    rows: list[dict[str, Any]] = []
    for row in report["cloud_matches"]:
        rows.append(row)
    for row in report["formal_candidates"]:
        rows.append({
            **row,
            "matched_intake_ids": "; ".join(row.get("matched_intake_ids", [])),
            "matched_subjects": "; ".join(row.get("matched_subjects", [])),
            "matched_keywords": "; ".join(row.get("matched_keywords", [])),
            "formal_signal_hits": "; ".join(row.get("formal_signal_hits", [])),
        })
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# WPS 缺失材料本机收件扫描",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"扫描文件数：`{report['counts']['files_seen']}`",
        f"cloud-only 目标：`{report['counts']['cloud_targets']}`",
        f"cloud 精确可关闭：`{report['counts']['cloud_exact_ready_to_close']}`",
        f"正式报关需求：`{report['counts']['formal_needs']}`",
        f"正式报关候选文件：`{report['counts']['formal_candidate_files']}`",
        f"强正式报关候选：`{report['counts']['formal_strong_candidate_files']}`",
        f"参考汇总线索：`{report['counts']['formal_reference_candidate_files']}`",
        f"内容扫描文件：`{report['counts']['content_scanned_files']}`",
        f"内容扫描失败/跳过：`{report['counts']['content_scan_failures']}`",
        f"当前可直接 apply：`{report['counts']['ready_for_apply']}`",
        "",
        "## 扫描目录",
    ]
    lines += [f"- `{path}`" for path in report["inputs"]["incoming_dirs"]]
    lines += [
        "",
        "## 结论",
        "- 本报告只读，不写库、不复制、不删除。",
        "- cloud-only 只有 `match=exact` 才能进入关闭工具。",
        "- 正式报关候选文件来自路径或内容关键词，只说明需要抽取复核，不构成写库授权。",
        "- `reference_summary_not_formal_customs` 只是参考汇总线索，不是正式报关单。",
        "",
        "## Cloud 原件匹配",
    ]
    if report["cloud_matches"]:
        lines += [
            "| Intake | 对象 | 匹配 | 大小 | SHA1 | 路径 |",
            "|---|---|---|---:|---|---|",
        ]
        for row in report["cloud_matches"]:
            lines.append(
                f"| {row['intake_id']} | {compact(row['subject'], 80).replace('|', '/')} | "
                f"`{row['match']}` | {row['size']} | `{row['sha1']}` | `{row['path']}` |"
            )
    else:
        lines.append("- 未发现 size 命中或 SHA1 精确命中。")

    lines += ["", "## 正式报关候选"]
    if report["formal_candidates"]:
        lines += [
            "| 路径 | 命中关键词 | 正式信号 | 抽取方式 | 匹配 Intake | 状态 | 校验命令 |",
            "|---|---|---|---|---|---|---|",
        ]
        for row in report["formal_candidates"][:80]:
            lines.append(
                f"| `{row['path']}` | {compact(row.get('matched_keywords', []), 80).replace('|', '/')} | "
                f"{compact(row.get('formal_signal_hits', []), 80).replace('|', '/')} | "
                f"`{row.get('content_extractor', '')}` | {compact(row['matched_intake_ids'], 80).replace('|', '/')} | "
                f"`{row['candidate_status']}` | `{row['validation_runner']}` |"
            )
    else:
        lines.append("- 未发现正式报关候选文件。")

    if report["content_scan_failures"]:
        lines += ["", "## 内容扫描失败/跳过", "| 原因 | 数量 |", "|---|---:|"]
        lines += [f"| `{item['reason']}` | {item['count']} |" for item in report["content_scan_failures"]]

    if report["skipped"]:
        lines += ["", "## 跳过项", *[f"- `{item}`" for item in report["skipped"][:50]]]
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan local incoming dirs for WPS missing evidence.")
    parser.add_argument(
        "--incoming-dir",
        action="append",
        default=[],
        help="Directory or file to scan. Can be repeated. Defaults to project inbox and Downloads.",
    )
    parser.add_argument("--max-files", type=int, default=20000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    incoming_dirs = [Path(value).expanduser() for value in args.incoming_dir] or default_incoming_dirs()
    report = scan(incoming_dirs, args.max_files)
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    write_md(report)
    print(json.dumps({
        "status": report["status"],
        "files_seen": report["counts"]["files_seen"],
        "cloud_exact_ready_to_close": report["counts"]["cloud_exact_ready_to_close"],
        "formal_candidate_files": report["counts"]["formal_candidate_files"],
        "ready_for_apply": report["counts"]["ready_for_apply"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
