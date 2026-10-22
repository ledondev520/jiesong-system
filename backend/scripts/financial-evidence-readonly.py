"""Read only matching evidence in one SQLite snapshot; JSON goes to a private pipe, never public logs."""
import json
import os
from pathlib import Path
import socket
import sqlite3
import stat
import sys


def read_snapshot(database, selection):
    source = Path(database)
    info = source.lstat()
    if not source.is_absolute() or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077:
        raise ValueError("private regular SQLite required")
    source = source.resolve(strict=True)
    if not isinstance(selection, list) or not 0 < len(selection) <= 100:
        raise ValueError("explicit bounded selection required")
    connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=15)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA query_only=ON")
        allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_TRANSACTION}
        connection.set_authorizer(lambda action, *_: sqlite3.SQLITE_OK if action in allowed else sqlite3.SQLITE_DENY)
        connection.execute("BEGIN")
        documents, periods = {}, {}
        for item in selection:
            matches = connection.execute(
                "SELECT * FROM financial_evidence_documents WHERE sourceKey=? OR (contentSha256=? AND category=?)",
                (item["sourceKey"], item["contentSha256"], item["category"]),
            ).fetchall()
            for match in matches:
                document = dict(match)
                document["originalArchived"] = bool(document["originalArchived"])
                document["sheets"] = []
                for result in connection.execute("SELECT * FROM financial_evidence_sheets WHERE documentId=? ORDER BY sheetIndex", (document["id"],)):
                    sheet = dict(result)
                    sheet["rows"] = [dict(row) for row in connection.execute("SELECT * FROM financial_evidence_rows WHERE sheetId=? ORDER BY sourceRow", (sheet["id"],))]
                    document["sheets"].append(sheet)
                documents[document["id"]] = document
                if document["periodId"]:
                    period = connection.execute("SELECT id,year,month FROM financial_periods WHERE id=?", (document["periodId"],)).fetchone()
                    if period:
                        periods[period["id"]] = dict(period)
        final = source.stat()
        if (info.st_dev, info.st_ino) != (final.st_dev, final.st_ino):
            raise ValueError("database identity changed")
        return {"format": "financial-evidence-readonly-snapshot-v1", "readOnly": True,
                "target": {"host": socket.gethostname(), "file": str(source), "device": str(info.st_dev), "inode": str(info.st_ino)},
                "documents": list(documents.values()), "periods": list(periods.values())}
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        request = sys.stdin.read(1024 * 1024 + 1)
        if len(request) > 1024 * 1024:
            raise ValueError("selection too large")
        print(json.dumps(read_snapshot(sys.argv[1], json.loads(request)), ensure_ascii=False))
    except Exception:
        print("Read-only financial preflight failed", file=sys.stderr)
        sys.exit(1)
