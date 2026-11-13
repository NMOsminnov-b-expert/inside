"""Сверка: разметка инструкций дословно совпадает с PDF.

Каждое слово и знак PDF (кроме значков-маркеров списков) должен оказаться в разметке
столько же раз, и ни одного лишнего. Порядок слов не сверяется: подпись к фото в PDF
стоит в потоке текста где придётся, а в приложении — под своим фото.

    python tools/instructions/check.py
"""
import collections
import json
import os
import re
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "instructions", "source")
OUT = os.path.join(ROOT, "shared", "src", "commonMain", "composeResources", "files", "instructions")
GLYPHS = {"•", "", "▪", "■"}


def tokens(text):
    return [t for t in re.findall(r"\w+|[^\w\s]", text) if t not in GLYPHS]


def doc_text(d):
    parts = []
    for b in d["blocks"]:
        if b["k"] == "img":
            parts += ["".join(t for t, _ in i["cap"]) for i in b["items"]]
            parts.append("".join(t for t, _ in b.get("cap", [])))
        else:
            parts.append((b.get("m", "") + " ") + "".join(t for t, _ in b["runs"]))
    return "\n".join(parts)


def main():
    index = json.load(open(os.path.join(OUT, "index.json"), encoding="utf-8"))
    bad = 0
    for e in index:
        d = json.load(open(os.path.join(OUT, e["id"], "doc.json"), encoding="utf-8"))
        pdf = pymupdf.open(os.path.join(SRC, d["title"] + ".pdf"))
        if "pages" in d:
            # Бланк показывается страницами самого PDF: сверять нечего, кроме их числа.
            ok = len(d["pages"]) == pdf.page_count
            print(f"{'ok ' if ok else 'BAD'} {e['id']}: {len(d['pages'])} стр. из {pdf.page_count}")
            bad += not ok
            continue
        want = collections.Counter(tokens("\n".join(p.get_text() for p in pdf)))
        got = collections.Counter(tokens(doc_text(d)))
        missing, extra = want - got, got - want
        files = {i["f"] for b in d["blocks"] if b["k"] == "img" for i in b["items"]}
        if "memo" in d:
            files.add(d["memo"]["f"])
        absent = [f for f in files if not os.path.isfile(os.path.join(OUT, e["id"], f))]
        ok = not missing and not extra and not absent
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} {e['id']}: слов {sum(want.values())}, картинок {len(files)}"
              + (f"\n    нет в разметке: {dict(missing)}" if missing else "")
              + (f"\n    лишнее в разметке: {dict(extra)}" if extra else "")
              + (f"\n    нет файлов: {absent}" if absent else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
