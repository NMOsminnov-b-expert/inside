#!/usr/bin/env python3
"""Create a new, guaranteed-unique knowledge-graph log entry file.

Usage:
    python .claude/knowledge-graph/tools/new_log_entry.py

Prints the path of the created file. The file starts with empty
"entities"/"relations" arrays and a filled-in "meta" block — fill in the
arrays (by hand or via Edit) and commit the file together with your code
changes. See CLAUDE.md, section "Граф знаний", for the full workflow.

The filename encodes UTC timestamp + branch + author + a random suffix,
so two people (or two branches) can never produce the same filename —
that is what makes files under log/ safe to merge across branches: git
only ever sees new files added, never the same file edited twice.
"""
import json
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LOG_DIR = ROOT / ".claude" / "knowledge-graph" / "log"

UNSAFE = set('<>:"/\\|?*')

# Filenames must stay pure ASCII: Cyrillic (or any non-ASCII) branch/author
# names render as mojibake in many terminals, editors and in `git status`
# (core.quotepath escaping) depending on locale/codepage. Transliterate
# Russian letters instead of just stripping them, so branch names like
# "карточка-жилого-здания" stay readable in the filename.
_RU2LAT = dict(zip(
    "абвгдежзийклмнопрстуфхцчшщъыьэюя",
    ["a", "b", "v", "g", "d", "e", "zh", "z", "i", "i", "k", "l", "m", "n",
     "o", "p", "r", "s", "t", "u", "f", "h", "c", "ch", "sh", "sch", "",
     "y", "", "e", "yu", "ya"],
))


def sh(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True, encoding="utf-8").strip()


def transliterate(s):
    out = []
    for ch in s.lower():
        if ch in _RU2LAT:
            out.append(_RU2LAT[ch])
        else:
            out.append(ch)
    return "".join(out)


def slug(s):
    s = transliterate(s)
    s = "".join("-" if (c.isspace() or c in UNSAFE or ord(c) > 127) else c for c in s)
    s = "-".join(part for part in s.split("-") if part)  # collapse repeats
    return s.strip("-.") or "unknown"


def main():
    # Force UTF-8 stdout — Windows consoles default to the system codepage
    # (e.g. cp1251), which chokes on non-ASCII author names/paths.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    try:
        branch = slug(sh("git", "rev-parse", "--abbrev-ref", "HEAD"))
    except subprocess.CalledProcessError:
        branch = "unknown"
    try:
        base_commit = sh("git", "rev-parse", "--short", "HEAD")
    except subprocess.CalledProcessError:
        base_commit = "unknown"
    try:
        author_raw = sh("git", "config", "user.email") or sh("git", "config", "user.name")
    except subprocess.CalledProcessError:
        author_raw = "unknown"
    author = slug(author_raw.split("@")[0])

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rand = secrets.token_hex(3)
    name = f"{ts}_{branch}_{author}_{rand}.json"

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    path = LOG_DIR / name
    if path.exists():
        sys.exit(f"refusing to overwrite existing file: {path}")

    payload = {
        "meta": {
            "branch": branch,
            "author": author_raw,
            "createdAt": ts,
            "baseCommit": base_commit,
        },
        "entities": [],
        "relations": [],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(str(path))


if __name__ == "__main__":
    main()
