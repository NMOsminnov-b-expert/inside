#!/usr/bin/env python3
"""Human-readable dump of the current local knowledge graph, grouped by type.

Usage:
    python .claude/knowledge-graph/tools/dump_readable.py [> graph.txt]

Reads memory.jsonl (run rebuild_memory.py first if it's missing or stale).
No dependency on Node/MCP — anyone on the team can run this to read the
graph without going through Claude Code.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MEMORY_PATH = ROOT / ".claude" / "knowledge-graph" / "memory.jsonl"


def main():
    # Windows consoles default to the system codepage (e.g. cp1251), which
    # can't encode Cyrillic mixed with characters like "→" — force UTF-8 so
    # this doesn't crash or mangle output regardless of locale.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    if not MEMORY_PATH.exists():
        raise SystemExit(
            f"{MEMORY_PATH} not found — run rebuild_memory.py first")

    entities, relations = [], []
    for line in MEMORY_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        item = json.loads(line)
        (entities if item["type"] == "entity" else relations).append(item)

    by_type = defaultdict(list)
    for e in entities:
        by_type[e["entityType"]].append(e)

    for etype in sorted(by_type):
        print(f"\n== {etype} ==")
        for e in sorted(by_type[etype], key=lambda x: x["name"]):
            print(f"- {e['name']}")
            for o in e["observations"]:
                print(f"    - {o}")

    print(f"\n== relations ({len(relations)}) ==")
    for r in sorted(relations, key=lambda x: (x["from"], x["relationType"], x["to"])):
        print(f"- {r['from']} --{r['relationType']}--> {r['to']}")


if __name__ == "__main__":
    main()
