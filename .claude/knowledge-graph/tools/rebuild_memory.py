#!/usr/bin/env python3
"""Rebuild the local knowledge-graph cache (memory.jsonl) from the git-tracked
event log (.claude/knowledge-graph/log/*.json).

Run this after `git pull`/merge/checkout so your local graph picks up
whatever teammates (or other branches) added. Safe to run any time:
deterministic and idempotent — replaying the same log twice yields the
same memory.jsonl.

memory.jsonl itself is NOT committed (see .gitignore) — it is a derived
cache the MCP memory server reads/writes locally. The log/ directory is
the shared source of truth and is designed to merge across branches
without conflicts: every entry is a new, uniquely-named file, so git only
ever unions new files, never edits the same lines twice.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LOG_DIR = ROOT / ".claude" / "knowledge-graph" / "log"
MEMORY_PATH = ROOT / ".claude" / "knowledge-graph" / "memory.jsonl"


def main():
    # Force UTF-8 stdout/stderr — Windows consoles default to the system
    # codepage (e.g. cp1251), which chokes on Cyrillic entity names/warnings.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    entities = {}   # name -> {"entityType": str, "observations": [str, ...]}
    rel_seen = set()  # (from, to, relationType)
    rel_order = []

    files = sorted(LOG_DIR.glob("*.json")) if LOG_DIR.exists() else []
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        for e in data.get("entities", []):
            rec = entities.setdefault(e["name"], {"entityType": e["entityType"], "observations": []})
            if rec["entityType"] != e["entityType"]:
                print(f"warning: {f.name}: entityType mismatch for {e['name']!r} "
                      f"({rec['entityType']!r} vs {e['entityType']!r}) — keeping first seen")
            for o in e.get("observations", []):
                if o not in rec["observations"]:
                    rec["observations"].append(o)
        for r in data.get("relations", []):
            key = (r["from"], r["to"], r["relationType"])
            if key not in rel_seen:
                rel_seen.add(key)
                rel_order.append(key)

    lines = []
    for name, rec in entities.items():
        lines.append(json.dumps(
            {"type": "entity", "name": name, "entityType": rec["entityType"],
             "observations": rec["observations"]},
            ensure_ascii=False))
    for frm, to, rt in rel_order:
        lines.append(json.dumps(
            {"type": "relation", "from": frm, "to": to, "relationType": rt},
            ensure_ascii=False))

    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    MEMORY_PATH.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    print(f"rebuilt {MEMORY_PATH.relative_to(ROOT)} from {len(files)} log file(s): "
          f"{len(entities)} entities, {len(rel_order)} relations")


if __name__ == "__main__":
    main()
