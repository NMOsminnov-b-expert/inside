"""Разметка инструкций текстом — глазами сверить с PDF: python tools/instructions/preview.py [id]"""
import json, os, sys
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                   "shared", "src", "commonMain", "composeResources", "files", "instructions")


def show(runs):
    return "".join(f"**{t}**" if st & 1 else (f"_{t}_" if st & 2 else t) for t, st in runs)


for e in json.load(open(os.path.join(OUT, "index.json"), encoding="utf-8")):
    if len(sys.argv) > 1 and e["id"] not in sys.argv[1:]:
        continue
    d = json.load(open(os.path.join(OUT, e["id"], "doc.json"), encoding="utf-8"))
    print(f"\n######## {d['id']} — {d['title']}  [{d['group']}]  memo={'memo' in d} pdf={d.get('pdf')} pages={len(d.get('pages', []))}")
    for b in d["blocks"]:
        if b["k"] == "h":
            print("#" * (b["lvl"] + 1), show(b["runs"]))
        elif b["k"] == "p":
            print("¶", show(b["runs"]))
        elif b["k"] == "li":
            print("   " * b["lvl"] + b["m"], show(b["runs"]))
        else:
            print("  [IMG]", " ‖ ".join(f"{i['f']} {i['w']}x{i['h']}: {show(i['cap'])}" for i in b["items"]))
