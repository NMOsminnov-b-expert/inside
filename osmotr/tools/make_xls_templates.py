#!/usr/bin/env python3
"""
Те же кривые описи, что в shared/src/jvmTest/resources/templates/*.xlsx, — старым Excel (.xls, BIFF8):
значения, числа числами, объединённые ячейки. Тест XlsTest сверяет разбор .xls с разбором .xlsx.

    python3 -m venv /tmp/xl && /tmp/xl/bin/pip install xlwt && /tmp/xl/bin/python tools/make_xls_templates.py
"""
import glob, os, re, zipfile, xml.etree.ElementTree as ET
import xlwt

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
here = os.path.join(os.path.dirname(__file__), '..', 'shared', 'src', 'jvmTest', 'resources', 'templates')


def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters: n = n * 26 + ord(ch) - 64
    return n - 1, int(ref[len(letters):]) - 1


for path in sorted(glob.glob(os.path.join(here, '*.xlsx'))):
    z = zipfile.ZipFile(path)
    names = set(z.namelist())
    shared = []
    if 'xl/sharedStrings.xml' in names:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    rels = {}
    if 'xl/_rels/workbook.xml.rels' in names:
        for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')):
            rels[r.get('Id')] = r.get('Target')
    wb = xlwt.Workbook(encoding='utf-8')
    sheets = ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS)
    for i, sh in enumerate(sheets):
        target = rels.get(sh.get(R), 'worksheets/sheet%d.xml' % (i + 1)).lstrip('/')
        target = target if target.startswith('xl/') else 'xl/' + target
        root = ET.fromstring(z.read(target))
        ws = wb.add_sheet(sh.get('name')[:31], cell_overwrite_ok=True)
        merged = set()
        merges = []
        mc = root.find('m:mergeCells', NS)
        if mc is not None:
            for m in mc:
                a, b = m.get('ref').split(':')
                (c1, r1), (c2, r2) = col_index(a), col_index(b)
                merges.append((r1, r2, c1, c2))
        values = {}
        last_row = -1
        for row in root.iter('{%s}row' % NS['m']):
            last_row = int(row.get('r')) - 1 if row.get('r') else last_row + 1
            next_col = 0
            for c in row.findall('m:c', NS):
                ref = c.get('r'); t = c.get('t', 'n')
                cc, rr = col_index(ref) if ref else (next_col, last_row)  # ячейки без адреса — по порядку
                next_col = cc + 1
                v = c.find('m:v', NS)
                if t == 's': val = shared[int(v.text)]
                elif t == 'inlineStr': val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                elif t in ('str', 'e'): val = v.text if v is not None else ''
                elif t == 'b': val = bool(int(v.text))
                else:
                    if v is None or v.text is None: continue
                    f = float(v.text)
                    val = int(f) if f.is_integer() and abs(f) < 2**31 else f
                values[(rr, cc)] = val
        for (r1, r2, c1, c2) in merges:
            ws.write_merge(r1, r2, c1, c2, values.get((r1, c1), ''))
            for r in range(r1, r2 + 1):
                for c in range(c1, c2 + 1): merged.add((r, c))
        for (r, c), val in values.items():
            if (r, c) not in merged: ws.write(r, c, val)
    out = os.path.join(here, 'xls', os.path.basename(path)[:-1])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    wb.save(out)
    print(out)
