"""Инструкции по осмотрам: PDF из instructions/source → разметка для приложения.

Текст и картинки переносятся как есть: слова — дословно, жирное и курсив — на своих
местах, фото и памятки — теми же байтами, без пережатия. Меняется только раскладка:
страница A4 становится колонкой под экран телефона. Проверка `check.py` сверяет
слова разметки со словами PDF — расхождение считается ошибкой разметки.

    python -m pip install pymupdf
    python tools/instructions/build.py      # пишет shared/src/commonMain/composeResources/files/instructions/
"""
import json
import os
import re
import shutil
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "instructions", "source")
OUT = os.path.join(ROOT, "shared", "src", "commonMain", "composeResources", "files", "instructions")

# Порядок в приложении и короткие имена папок. Разделы — как их читают на осмотре:
# сначала порядок работы, потом — как снимать каждый вид имущества, потом бумаги.
DOCS = [
    # Фаст-режим недвижимости и ТС (автор, 02.11.2026): осмотр выездом — общая памятка первой.
    ("fast", "0. Общая инструкция - фаст.pdf", "Быстрый осмотр"),
    ("dom", "1. Как фотографировать жилой дом - фаст режим.pdf", "Недвижимость"),
    ("kvartira", "2. Как фотографировать квартиру - фаст режим.pdf", "Недвижимость"),
    ("vstroennoe", "6. Как фотографировать встроенное помещение - фаст режим.pdf", "Недвижимость"),
    ("otdelnoe", "7. Как фотографировать отдельностоящее ком помещение - фаст режим.pdf", "Недвижимость"),
    ("baza", "8. Как фотографировать производственную базу - фаст режим.pdf", "Недвижимость"),
    ("uchastok", "9. Как фотографировать земельный участок - фаст режим.pdf", "Недвижимость"),
    ("nezavershenka", "10. Как фотографировать незавершенное строительство - фаст режим.pdf", "Недвижимость"),
    ("avto", "3. Как фотографировать автотранспорт - фаст режим.pdf", "Транспорт"),
    ("spectehnika", "4. Как фотографировать спец технику - фаст режим.pdf", "Транспорт"),
    ("ofis", "5. Как фотографировать офисную технику - фаст режим.pdf", "Оборудование: фаст-режим"),
    ("poryadok", "Порядок осмотра - крупное оборудование и мелкие позиции.pdf", "Порядок осмотра"),
    ("ne-naideno", "Что делать если имущество не найдено.pdf", "Порядок осмотра"),
    ("tehnologicheskoe", "Как фотографировать технологическое оборудование.pdf", "Как фотографировать"),
    ("transformator", "Как фотографировать трансформатор.pdf", "Как фотографировать"),
    ("yacheiki", "Как фотографировать ячейки.pdf", "Как фотографировать"),
    ("nasosy", "Как фотографировать насосы с электродвигателями.pdf", "Как фотографировать"),
    ("inzhenernye", "Как фотографировать инженерные системы.pdf", "Как фотографировать"),
    ("pk", "Как фотографировать ПК, ноутбуки.pdf", "Как фотографировать"),
    ("ibp", "Как фотографировать источник бесперебойного питания.pdf", "Как фотографировать"),
    ("infopc", "Как пользоваться InfoPC.bat для сбора тех. характеристик.pdf", "Документы для организации"),
    ("akt", "Акт подтверждения наличия имущества.pdf", "Документы для организации"),
]
# Бланк акта — таблица с полями: колонкой его не прочесть, он показывается страницами.
AS_PAGES = {"akt", "fast"}
# Эти PDF передаются организации — их можно отправить из приложения как есть.
SHARED_PDF = {"akt", "infopc"}

SHORT = {"fast": "Общая памятка", "dom": "Жилой дом", "kvartira": "Квартира", "vstroennoe": "Встроенное помещение",
         "otdelnoe": "Отдельностоящее коммерческое помещение", "baza": "Производственная база", "uchastok": "Земельный участок",
         "nezavershenka": "Незавершённое строительство", "avto": "Автотранспорт", "spectehnika": "Спецтехника", "ofis": "Офисная техника"}

BOLD, ITALIC = 1, 2
MARKERS = {"•", "o", "", "▪", "■"}


def style(span):
    s = 0
    if span["flags"] & 16 or "Bold" in span["font"]:
        s |= BOLD
    if span["flags"] & 2 or "Italic" in span["font"]:
        s |= ITALIC
    return s


def runs_add(runs, text, st):
    if not text:
        return
    if runs and runs[-1][1] == st:
        runs[-1][0] += text
    else:
        runs.append([text, st])


def runs_text(runs):
    return "".join(t for t, _ in runs)


def tidy(runs):
    """Пробелы — как в тексте: один между словами, без хвостов; стиль пробела — соседа."""
    out = []
    for t, st in runs:
        t = re.sub(r"\s+", " ", t)
        if not t:
            continue
        if t == " " and out:
            out[-1][0] += " "
            continue
        runs_add(out, t, st)
    while out and not out[0][0].strip():
        out.pop(0)
    if out:
        out[0][0] = out[0][0].lstrip()
    while out and not out[-1][0].strip():
        out.pop()
    if out:
        out[-1][0] = out[-1][0].rstrip()
    # Пробел на стыке стилей держит левый кусок: «слово» + « жирное» → «слово » + «жирное».
    for i in range(1, len(out)):
        if out[i - 1][0].endswith(" "):
            out[i][0] = out[i][0].lstrip()

        if out[i][0].startswith(" "):
            out[i][0] = out[i][0][1:]
            if not out[i - 1][0].endswith(" "):
                out[i - 1][0] += " "
    return [[re.sub(" {2,}", " ", t), st] for t, st in out if t]


def raw_lines(page):
    """Строки страницы как их отдал PDF: кусок выровненной по ширине строки — отдельно."""
    raw = []
    for bl in page.get_text("dict")["blocks"]:
        if bl["type"] != 0:
            continue
        for ln in bl["lines"]:
            spans = [s for s in ln["spans"] if s["text"].strip()]
            if not spans:
                continue
            raw.append(dict(y=round(spans[0]["origin"][1], 1), x=spans[0]["bbox"][0], spans=ln["spans"],
                            size=max(s["size"] for s in spans), x1=ln["bbox"][2]))
    raw.sort(key=lambda r: (r["y"], r["x"]))
    return raw


def merge_lines(raw):
    """Куски на одной базовой линии — одна строка (и маркер списка с его текстом)."""
    lines = []
    for r in raw:
        if lines and abs(lines[-1]["y"] - r["y"]) < 2.5:
            lines[-1]["spans"] = lines[-1]["spans"] + [dict(text=" ", flags=0, font="", size=r["size"])] + r["spans"]
            lines[-1]["x1"] = max(lines[-1]["x1"], r["x1"])
            lines[-1]["size"] = max(lines[-1]["size"], r["size"])
        else:
            lines.append(dict(r))
    return lines


def line_parts(line):
    """(маркер, отступ текста, куски) — маркер «•», «o», «1.», «-» или None."""
    spans = [s for s in line["spans"]]
    first = next(s for s in spans if s["text"].strip())
    ft = first["text"].strip()
    marker = None
    if ft in MARKERS or first["font"].startswith(("Symbol", "Courier", "Wingdings")) and len(ft) == 1:
        marker = "•" if ft in ("•", "", "▪", "■") else ft
        spans = spans[spans.index(first) + 1:]
    elif re.fullmatch(r"\d{1,2}\.", ft):
        marker = ft
        spans = spans[spans.index(first) + 1:]
    else:
        m = re.match(r"\s*(\d{1,2}\.)\s+", first["text"])
        if m and first["text"].strip() != m.group(1):
            marker = m.group(1)
            first = dict(first, text=first["text"][m.end():])
            spans = [first] + spans[spans.index(next(s for s in spans if s["text"].strip())) + 1:]
        elif first["text"].lstrip().startswith("- "):
            marker = "-"
            first = dict(first, text=first["text"].lstrip()[2:])
            spans = [first] + spans[spans.index(next(s for s in spans if s["text"].strip())) + 1:]
    runs = []
    for s in spans:
        runs_add(runs, s["text"], style(s) if s["text"].strip() else 0)
    return marker, runs


def all_bold(runs):
    return all(st & BOLD for t, st in runs if t.strip())


def norm(s):
    return re.sub(r"\s+", " ", s).strip().rstrip(":").lower()


def build_doc(doc_id, fname, group):
    path = os.path.join(SRC, fname)
    doc = pymupdf.open(path)
    outdir = os.path.join(OUT, doc_id)
    os.makedirs(outdir, exist_ok=True)
    toc = {norm(t) for _, t, _ in doc.get_toc()}
    result = dict(id=doc_id, title=os.path.splitext(fname)[0], group=group, blocks=[])
    if doc_id in SHARED_PDF:
        shutil.copyfile(path, os.path.join(outdir, "original.pdf"))
        result["pdf"] = "original.pdf"
    if doc_id in AS_PAGES:
        result["pages"] = []
        for i, p in enumerate(doc):
            name = f"page-{i + 1}.png"
            p.get_pixmap(dpi=200).save(os.path.join(outdir, name))
            result["pages"].append(dict(f=name, w=round(p.rect.width), h=round(p.rect.height)))
        result["text"] = [p.get_text() for p in doc]
        return result

    blocks = result["blocks"]
    step = line_step(doc)
    # Отступ заголовков из оглавления: жирная короткая строка с тем же отступом — тоже
    # заголовок, даже если Word не занёс её в оглавление («Общий вид и состав КРУ»).
    head_x = set()
    for page in doc:
        for ln in merge_lines(raw_lines(page)):
            m, r = line_parts(ln)
            if m is None and all_bold(r) and norm(runs_text(r)) in toc:
                head_x.add(round(ln["x"]))
    img_n = 0
    seen_xref = {}

    def save_image(xref):
        nonlocal img_n
        if xref in seen_xref:
            return seen_xref[xref]
        x = doc.extract_image(xref)
        img_n += 1
        name = f"{img_n:02d}.{'jpg' if x['ext'] in ('jpeg', 'jpg') else x['ext']}"
        with open(os.path.join(outdir, name), "wb") as fh:
            fh.write(x["image"])
        seen_xref[xref] = (name, x["width"], x["height"])
        return seen_xref[xref]

    for pn, page in enumerate(doc):
        raw = raw_lines(page)
        infos = page.get_image_info(xrefs=True)
        # Памятка: страница — одна картинка без текста.
        if not raw and len(infos) == 1:
            name, w, h = save_image(infos[0]["xref"])
            os.replace(os.path.join(outdir, name), os.path.join(outdir, "memo.jpg"))
            seen_xref[infos[0]["xref"]] = ("memo.jpg", w, h)
            result["memo"] = dict(f="memo.jpg", w=w, h=h)
            continue
        # Картинки — рядами: стоящие бок о бок по высоте — один ряд.
        imgs = sorted(({"bbox": i["bbox"], "xref": i["xref"]} for i in infos if i["xref"]),
                      key=lambda i: (i["bbox"][1], i["bbox"][0]))
        rows = []
        for im in imgs:
            if rows and im["bbox"][1] < rows[-1]["y1"] - 10:
                rows[-1]["items"].append(im)
                rows[-1]["y1"] = max(rows[-1]["y1"], im["bbox"][3])
            else:
                rows.append(dict(y0=im["bbox"][1], y1=im["bbox"][3], items=[im]))
        for r in rows:
            r["items"].sort(key=lambda i: i["bbox"][0])
            r["cap"] = []
            for it in r["items"]:
                it["cap"] = []
        # Подпись — мелкий шрифт прямо под картинкой, в её ширину. Разбирается до склейки
        # строк: подписи двух фото рядом стоят на одной базовой линии.
        rest = []
        for ln in raw:
            owner = None
            if ln["size"] <= 10.5:
                cx = (ln["x"] + ln["x1"]) / 2
                for r in rows:
                    if r["y1"] - 2 <= ln["y"] <= r["y1"] + 40:
                        # Под своим фото — его подпись; посередине ряда — общая на ряд.
                        hit = [it for it in r["items"] if it["bbox"][0] <= cx <= it["bbox"][2]]
                        owner = hit[0] if len(hit) == 1 and not centered(ln, r) else r
            if owner is None:
                rest.append(ln)
                continue
            if owner["cap"]:
                runs_add(owner["cap"], " ", 0)
            for sp in ln["spans"]:
                runs_add(owner["cap"], sp["text"], style(sp) if sp["text"].strip() else 0)
        body = [(ln,) + line_parts(ln) for ln in merge_lines(rest)]
        right = max((ln["x1"] for ln, _, _ in body), default=0)
        # Текст и ряды картинок — по высоте на странице.
        events = [(ln["y"], 0, (ln, marker, runs)) for ln, marker, runs in body]
        events += [(r["y0"], 1, r) for r in rows]
        events.sort(key=lambda e: (e[0], e[1]))
        cur = None  # блок текста, к которому ещё могут прийти строки

        for y, kind, item in events:
            if kind == 1:
                cur = None
                row = []
                for it in item["items"]:
                    name, w, h = save_image(it["xref"])
                    row.append(dict(f=name, w=w, h=h, cap=tidy(it["cap"])))
                blocks.append(dict(k="img", items=row, cap=tidy(item["cap"])))
                continue
            ln, marker, runs = item
            text = runs_text(runs).strip()
            size = ln["size"]
            heading = marker is None or re.fullmatch(r"\d{1,2}\.", marker or "")
            is_h = all_bold(runs) and (size >= 13.5 or norm(text) in toc or norm((marker or "") + " " + text) in toc
                                       or (marker is None and len(text) < 60 and not text.endswith(("!", "."))
                                           and any(abs(ln["x"] - x) < 4 for x in head_x)))
            if is_h and heading:
                lvl = 1 if size >= 13.5 and not blocks else (2 if size < 17 and blocks else 1)
                h = dict(k="h", lvl=lvl, runs=tidy([[(marker + " ") if marker else "", BOLD]] + runs), y=ln["y"], size=size)
                # Заголовок в две строки — одна запись.
                if blocks and blocks[-1]["k"] == "h" and ln["y"] - blocks[-1]["y"] < size * 1.4 and pn_of(blocks[-1]) == pn:
                    blocks[-1]["runs"] = tidy(blocks[-1]["runs"] + [[" ", 0]] + runs)
                    blocks[-1]["y"] = ln["y"]
                else:
                    h["pn"] = pn
                    blocks.append(h)
                cur = None
                continue
            gap = (y - cur["y"]) if cur and cur["pn"] == pn else (99 if cur is None else 0)
            if cur is not None and cur["pn"] != pn:
                # Переход страницы: продолжение, если строка без маркера и с тем же отступом.
                gap = 0 if marker is None and abs(ln["x"] - cur["x"]) < 4 else 99
            # Абзац у Word кончается короткой строкой: выровненная по ширине доходит до края.
            full = cur is not None and cur["x1"] >= right - 30
            cont = (cur is not None and marker is None and ln["x"] >= cur["left"] - 3
                    and full and gap <= step + 2.5)
            if cont:
                runs_add(cur["runs"], " ", 0)
                for t, st in runs:
                    runs_add(cur["runs"], t, st)
                cur["y"], cur["pn"], cur["x"], cur["x1"] = y, pn, ln["x"], ln["x1"]
                continue
            b = dict(k="li" if marker else "p", runs=list(runs), y=y, pn=pn, x=ln["x"], left=ln["x"], x1=ln["x1"])
            if marker:
                b["m"] = marker
                b["mx"] = round(ln["x"])
            blocks.append(b)
            cur = b

    # Уровни вложенности списков — по отступу маркера внутри документа.
    xs = sorted({b["mx"] for b in blocks if b["k"] == "li"})
    levels = {}
    for x in xs:
        levels[x] = next((levels[p] for p in levels if abs(p - x) < 6), None) or (max(levels.values(), default=0) + 1)
    for b in blocks:
        if b["k"] in ("p", "li", "h"):
            b["runs"] = tidy(b["runs"])
        if b["k"] == "li":
            b["lvl"] = levels[b["mx"]]
        for k in ("y", "pn", "x", "left", "mx", "size", "x1"):
            b.pop(k, None)
    result["blocks"] = [b for b in blocks if b["k"] == "img" or b["runs"]]
    return result


def centered(ln, row):
    """Подпись по центру всего ряда из нескольких фото — общая на ряд."""
    if len(row["items"]) < 2:
        return False
    x0 = min(i["bbox"][0] for i in row["items"])
    x1 = max(i["bbox"][2] for i in row["items"])
    return abs((ln["x"] + ln["x1"]) / 2 - (x0 + x1) / 2) < 25


def line_step(doc):
    """Обычный шаг строк документа: чаще всего встречающееся расстояние между базовыми линиями."""
    gaps = {}
    for page in doc:
        ys = [l["y"] for l in merge_lines(raw_lines(page))]
        for a, b in zip(ys, ys[1:]):
            if 8 < b - a < 25:
                gaps[round(b - a)] = gaps.get(round(b - a), 0) + 1
    return max(gaps, key=gaps.get) if gaps else 14


def pn_of(b):
    return b.get("pn")


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    index = []
    for doc_id, fname, group in DOCS:
        d = build_doc(doc_id, fname, group)
        text = d.pop("text", None)
        with open(os.path.join(OUT, doc_id, "doc.json"), "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=1)
        if text is not None:
            with open(os.path.join(OUT, doc_id, "text.txt"), "w", encoding="utf-8") as fh:
                fh.write("\n".join(text))
        # В списке — название вида, а не имя файла с номером. Текст инструкции не меняется.
        title = SHORT.get(doc_id) or d["title"]
        index.append(dict(id=doc_id, title=title, group=group))
        print(f"{doc_id:18s} блоков {len(d['blocks']):3d}  {fname}")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
