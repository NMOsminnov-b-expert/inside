/**
 * Матрица путей PWA «Осмотра» — то же, что tools/matrix/paths.py для Android, в браузере: каждый путь —
 * в каждом сочетании (движок, размер экрана, стоя/лёжа, тема); на каждом экране — флаги раскладки.
 *
 * Автор, 23.10.2026: «Автотесты нужны. Ещё более тщательные, чем на android».
 *
 *   tools/web/build.sh && (cd shared/build/dist/wasmJs/productionExecutable && python3 -m http.server 8099) &
 *   node tools/web/matrix.mjs [--движки chromium,webkit] [--размеры телефон,малый,планшет] [--ориентации 0,1]
 *                             [--темы light,dark] [--пути подстрока,…] [--адрес http://127.0.0.1:8099/] [--md отчёт.md]
 *
 * Экран читается по дереву доступности, которое Compose отдаёт в DOM (isA11YEnabled): подписи кнопок,
 * текст, метки testTag (атрибут id) — те же, что видит VoiceOver и uiautomator на Android. Нажатия — по
 * месту элемента на экране, как пальцем. Состояние — по хранилищу (IndexedDB «osmotr-fs»).
 */
import { chromium, webkit } from '../../web/node_modules/playwright/index.mjs'
import { unzipSync, zipSync, strToU8 } from '../../build/wasm/node_modules/fflate/esm/index.mjs'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const args = process.argv.slice(2)
const key = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def)
const BASE = key('--адрес', 'http://127.0.0.1:8099/')
const ROOT = '/Осмотры'

// ---------- Файлы для загрузки ----------

/** Книга .xlsx из листов [имя, строки] — числа числами, текст строкой. */
function xlsx(sheets) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const col = i => { let n = i + 1, s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26) } return s }
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([n], i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  }
  sheets.forEach(([, rows], i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
  })
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

const FIX = mkdtempSync(join(tmpdir(), 'osmotr-matrix-'))
const fix = (name, bytes) => { const p = join(FIX, name); writeFileSync(p, bytes); return p }
const F = {
  good: fix('matrix-good.xlsx', xlsx([['Сводка', [['Объект', 'Матрица'], ['Предметов', 12]]],
    ['Опись', [['№ п/п', 'Наименование', 'Инв. номер', 'Стоимость'], ...Array.from({ length: 12 }, (_, k) => [k + 1, `Шкаф металлический ${k + 1}`, `МТ-${101 + k}`, 1000 * (k + 1)])]]])),
  other: fix('matrix-other.xlsx', xlsx([['Опись', [['№', 'Наименование', 'Инв. номер'], ...Array.from({ length: 5 }, (_, k) => [k + 1, `Кресло ${k + 1}`, `ДР-${k + 1}`])]]])),
  act: fix('matrix-act.xlsx', xlsx([['Акт', [['Акт приёма-передачи'], ['Комиссия в составе:'], ['Иванов И. И.'], ['Петров П. П.'], ['Подписи']]]])),
  big: fix('matrix-big.xlsx', xlsx([['Опись', [['№', 'Наименование', 'Инв. номер', 'Стоимость'], ...Array.from({ length: 3000 }, (_, k) => [k + 1, `Стол письменный ${k + 1}`, `БГ-${10000 + k}`, 500 + k])]]])),
  attach: fix('Цех.xlsx', xlsx([['Опись', [['№', 'Наименование', 'Инв. номер'], [1, 'Станок токарный', 'СТ-1'], [2, 'Станок фрезерный', 'СТ-2']]]])),
  earlier: fix('осмотрено.xlsx', xlsx([['Лист1', [['№', 'Инв. номер'], [1, 'МТ-102']]]])),
  templates: new URL('../../shared/src/jvmTest/resources/templates/', import.meta.url).pathname,
  xls: new URL('../../shared/src/jvmTest/resources/templates/xls/02-inv1.xls', import.meta.url).pathname,
}
{
  const good = readFileSync(F.good)
  F.broken = fix('matrix-broken.xlsx', good.subarray(0, good.length >> 1))
  // Настоящий PDF на две страницы с разными размерами: смещения xref считаются, pdf.js их проверяет.
  const pdfDoc = () => {
    const page = (w, h, stream) => `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w} ${h}]/Resources<</Font<</F1 5 0 R>>>>/Contents ${stream} 0 R>>`
    const text = t => { const c = `BT /F1 48 Tf 40 300 Td (${t}) Tj ET`; return `<</Length ${c.length}>>\nstream\n${c}\nendstream` }
    const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>', page(400, 600, 6), page(600, 400, 7),
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>', text('Page one'), text('Page two')]
    let out = '%PDF-1.4\n'; const at = []
    objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = out.length
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')
    return Buffer.from(out + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`, 'latin1')
  }
  F.doc = fix('matrix-doc.pdf', pdfDoc())
  F.pdf = fix('matrix-pdf.xlsx', Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\n', 'latin1'))
  // Снимки «из галереи»: настоящие JPEG (кадр поддельной камеры не нужен) — из шаблона Android-тестов, если есть.
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
  F.photo1 = fix('IMG_0001.jpg', jpeg); F.photo2 = fix('IMG_0002.jpg', jpeg)
  // Три «снимка» по 700 КБ (несжимаемые) — архив больше предела в 1 МБ, как в пути Android.
  const big = k => { const b = Buffer.alloc(700000); for (let i = 0; i < b.length; i++) b[i] = (i * 2654435761 + k * 97) >>> 24; b[0] = 0xff; b[1] = 0xd8; b[b.length - 2] = 0xff; b[b.length - 1] = 0xd9; return b }
  F.big1 = fix('BIG_1.jpg', big(1)); F.big2 = fix('BIG_2.jpg', big(2)); F.big3 = fix('BIG_3.jpg', big(3))
}

/** Всё, что написано в книге .xlsx: имена листов и текст ячеек (строки и числа). */
function bookText(bytes) {
  const z = unzipSync(new Uint8Array(bytes)), dec = b => new TextDecoder().decode(b)
  const strip = x => x.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  const sheets = [...dec(z['xl/workbook.xml'] ?? new Uint8Array()).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => m[1])
  const text = Object.entries(z).filter(([k]) => /^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(k)).map(([, v]) => strip(dec(v))).join(' ')
  return { sheets, text }
}

// ---------- Экран ----------

class Node {
  constructor(o) { Object.assign(this, o) }
  get name() { return this.label || this.text || this.id }
  center() { return [(this.b[0] + this.b[2]) / 2, (this.b[1] + this.b[3]) / 2] }
  matches(want, exact) {
    // Compose 1.13 сливает тексты строки в одну подпись через перевод строки — сравнивать и по строкам.
    const fields = [this.label, this.text, this.id].filter(Boolean).flatMap(f => f.includes('\n') ? [f, ...f.split('\n').map(x => x.trim())] : [f])
    return exact ? fields.some(f => f === want) : fields.some(f => f.includes(want))
  }
}

class Screen {
  constructor(nodes) { this.nodes = nodes.map(n => new Node(n)) }
  texts() { return [...new Set(this.nodes.flatMap(n => (n.label || n.text || '').split('\n').map(x => x.trim())).filter(Boolean))] }
  has(want, exact) { return this.nodes.some(n => n.matches(want, exact)) }
  find(want, exact) {
    let hits = this.nodes.filter(n => n.matches(want, exact) && n.b[2] > n.b[0] && n.b[3] > n.b[1])
    // Открыто окно поверх (диалог, меню) — нажимать можно только в нём, как пальцем.
    const top = Math.max(...this.nodes.map(n => n.layer ?? 0))
    if (top > 0 && this.nodes.some(n => n.layer === top && n.clickable)) hits = hits.filter(n => n.layer === top)
    // Нажимаемое — раньше подписи внутри него; из нажимаемых — самое маленькое (кнопка, а не вся строка).
    const area = n => (n.b[2] - n.b[0]) * (n.b[3] - n.b[1])
    return hits.find(n => n.clickable && n.matches(want, exact) && (n.label === want || n.id === want || !exact)) ??
      hits.filter(n => n.clickable).sort((a, b) => area(a) - area(b))[0] ?? hits.sort((a, b) => area(a) - area(b))[0] ?? null
  }
  signature() { return this.texts().slice(0, 3).join(' · ').slice(0, 60) }
}

/** Дерево доступности Compose из DOM: подпись, свой текст, метка, роль, место. */
const DUMP = () => {
  const out = []
  const root = (() => { let r = null; const w = el => { for (const e of el.querySelectorAll('*')) { if (e.id === 'cmp_a11y_root') r = e; if (e.shadowRoot) w(e.shadowRoot) } }; w(document); return r })()
  if (!root) return out
  const CLICK = new Set(['button', 'checkbox', 'switch', 'tab', 'link', 'menuitem', 'radio', 'textbox', 'slider'])
  // Слой — верхний ребёнок корня: у каждого окна (экран, диалог, меню) своё дерево, новое — последним.
  let scrollers = 0
  const walk = (e, scroll, layer, sid = -1, sb = null, inList = false) => {
    for (const [k, c] of [...e.children].entries()) {
      const L = layer ?? k
      const role = c.getAttribute('role') ?? ''
      const own = [...c.childNodes].filter(t => t.nodeType === 3).map(t => t.textContent.trim()).filter(Boolean).join(' ')
      const r = c.getBoundingClientRect()
      // Прокрутка: списки (list/grid) и всё, у чего содержимое выходит за свои края (таблица вбок, строка пути).
      const spills = [...c.children].some(k => { const q = k.getBoundingClientRect(); return q.width > 0 && (q.left < r.left - 2 || q.right > r.right + 2 || q.top < r.top - 2 || q.bottom > r.bottom + 2) })
      const scroller = role === 'list' || role === 'grid' || spills
      out.push({ label: c.getAttribute('aria-label') ?? '', text: own, id: c.id ?? '', role, clickable: CLICK.has(role),
        enabled: c.getAttribute('aria-disabled') !== 'true', checked: c.getAttribute('aria-checked') === 'true' || c.getAttribute('aria-selected') === 'true',
        b: [r.left, r.top, r.right, r.bottom], scroll: !!scroll, all: (c.textContent || '').trim().slice(0, 200), layer: L, sid, sb, inList })
      walk(c, scroller || scroll, L, scroller ? ++scrollers : sid, scroller ? [r.left, r.top, r.right, r.bottom] : sb, inList || role === 'list' || role === 'grid')
    }
  }
  walk(root, false, null)
  return out
}

/** Флаги раскладки — как у Android: за краем, мелко, наложение. */
function layoutFlags(scr0, W, H) {
  const flags = []
  // Открыто окно поверх — видно и нажимаемо только оно: нижние слои не проверять.
  const top = Math.max(0, ...scr0.nodes.map(n => n.layer ?? 0))
  const scr = { nodes: scr0.nodes.filter(n => (n.layer ?? 0) === top) }
  const marked = scr.nodes.filter(n => (n.label || n.clickable) && n.b[2] > n.b[0] && n.b[3] > n.b[1])
  const seen = new Set()
  for (const n of marked) {
    const [x1, y1, x2, y2] = n.b
    if (!n.scroll && (x1 < -2 || y1 < -2 || x2 > W + 2 || y2 > H + 2)) flags.push(['ЗА КРАЕМ', `«${n.name.slice(0, 40)}» [${n.b.map(Math.round)}] окно ${W}×${H}`])
    if (n.clickable && n.enabled && !n.scroll && n.role !== 'textbox') {
      const w = x2 - x1, h = y2 - y1
      if ((w < 32 || h < 32) && !seen.has(n.name)) { seen.add(n.name); flags.push(['МЕЛКО', `«${n.name.slice(0, 60)}» ${Math.round(w)}×${Math.round(h)} px`]) }
    }
  }
  // Кнопка без подписи: VoiceOver скажет «кнопка», и только (автотест её тоже не найдёт).
  for (const n of scr.nodes) if (n.role === 'button' && !n.label && !n.text && !n.all && !seen.has('∅' + n.b.map(Math.round)))
    { seen.add('∅' + n.b.map(Math.round)); flags.push(['БЕЗ ПОДПИСИ', `кнопка [${n.b.map(Math.round)}]${n.id ? ' метка «' + n.id + '»' : ''}`]) }
  // Видимые: центр на экране и внутри своей прокрутки (уехавшие строки дерево ещё держит на старых местах).
  const shown = n => { const [x, y] = [(n.b[0] + n.b[2]) / 2, (n.b[1] + n.b[3]) / 2], b = n.sb; return x >= 0 && y >= 0 && x <= W && y <= H && (!b || (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) }
  const clicks = marked.filter(n => n.clickable && n.enabled && n.role !== 'textbox' && shown(n))
  for (let i = 0; i < clicks.length; i++) for (let j = i + 1; j < clicks.length; j++) {
    const a = clicks[i], b = clicks[j]
    const ix = Math.min(a.b[2], b.b[2]) - Math.max(a.b[0], b.b[0]), iy = Math.min(a.b[3], b.b[3]) - Math.max(a.b[1], b.b[1])
    if (ix <= 0 || iy <= 0) continue
    // Разные прокрутки (содержимое уезжает под неподвижную шапку, столбец, панель) — так и задумано.
    if (a.sid !== b.sid) continue
    // Строки одного ленивого списка: дерево доступности Compose держит уехавшие строки на старых местах.
    if (a.inList && b.inList) continue
    const inside = (p, q) => p.b[0] >= q.b[0] - 1 && p.b[1] >= q.b[1] - 1 && p.b[2] <= q.b[2] + 1 && p.b[3] <= q.b[3] + 1
    if (inside(a, b) || inside(b, a)) continue // вложенное (кнопка в строке) — не наложение
    const small = Math.min((a.b[2] - a.b[0]) * (a.b[3] - a.b[1]), (b.b[2] - b.b[0]) * (b.b[3] - b.b[1]))
    if (small && ix * iy > small / 3) flags.push(['НАЛОЖЕНИЕ', `«${a.name.slice(0, 30)}» и «${b.name.slice(0, 30)}»`])
  }
  return flags
}

// ---------- Путь ----------

class Fail extends Error {}
const sleep = ms => new Promise(r => setTimeout(r, ms))

class Run {
  constructor(page, ctx, name) { this.p = page; this.ctx = ctx; this.name = name; this.steps = []; this.flags = []; this.shot = 0; this.scr = new Screen([]); this.errors = []; this.downloads = []
    page.on('pageerror', e => this.errors.push(e.message))
    page.on('download', d => this.downloads.push(d))
  }
  ok(what, cond, was, want) { this.steps.push({ что: what, ок: !!cond, было: cond ? '' : was, ждали: want }); if (!cond) throw new Fail() }

  async dump() { return new Screen(await this.p.evaluate(DUMP)) }
  /** Экран успокоился (дерево доступности обновляется с задержкой) — снять и проверить раскладку. */
  async look(what) {
    let prev = '', scr = null
    // Дерево доступности Compose обновляется с задержкой до ~1 с: экран спокоен, когда дважды подряд тот же.
    let same = 0
    for (let i = 0; i < 16; i++) {
      await sleep(i ? 250 : 500)
      scr = await this.dump()
      const sig = JSON.stringify(scr.nodes.map(n => [n.label, n.text, n.id, n.b.map(Math.round)]))
      if (sig === prev) { if (++same >= 2) break } else same = 0
      prev = sig
    }
    this.scr = scr
    if (args.includes('--кадры')) await this.p.screenshot({ path: join(FIX, `${this.name} ${String(++this.shot ?? 0).padStart(3, '0')} ${what}.png`.replace(/[/«»]/g, '')) }).catch(() => {})
    if (this.errors.length) this.ok(what, false, 'ошибка страницы: ' + this.errors.join(' | ').slice(0, 600), 'без ошибок')
    const { width: W, height: H } = this.p.viewportSize()
    if (!(await this.p.$('.osmotr-camera'))) for (const [flag, detail] of layoutFlags(scr, W, H)) this.flags.push({ экран: scr.signature(), шаг: what, флаг: flag, подробно: detail })
    return scr
  }
  expect(what, { has = [], lacks = [], exact = false } = {}) {
    const miss = has.filter(h => !this.scr.has(h, exact)), extra = lacks.filter(h => this.scr.has(h, exact))
    this.ok(what, !miss.length && !extra.length, { нет: miss, лишнее: extra, 'на экране': this.scr.texts().slice(0, 25) }, { есть: has, нет: lacks })
  }
  async waitFor(what, want, { exact = false, ms = 8000 } = {}) {
    const t = Date.now()
    while (Date.now() - t < ms) { await this.look(what); if (this.scr.has(want, exact)) return; await sleep(300) }
    this.ok(what, false, this.scr.texts().slice(0, 25), want)
  }
  async tap(want, what = null, { long = false, exact = false, look = true } = {}) {
    let n = this.scr.find(want, exact)
    // После «Ещё» меню под нагрузкой раскрывается дольше — ждать до 5 с, а не нажимать «Ещё» снова (закроет).
    for (let i = 0; i < (this.lastTap === 'Ещё' ? 10 : 6) && !n; i++) { await sleep(500); this.scr = await this.dump(); n = this.scr.find(want, exact) }
    // Меню «Ещё» не раскрылось с первого касания (касание пришлось на конец прежней анимации) — ещё раз.
    if (!n && this.lastTap === 'Ещё' && want !== 'Ещё') {
      await this.tap('Ещё', 'меню — ещё раз', { exact: true })
      for (let i = 0; i < 6 && !n; i++) { await sleep(400); this.scr = await this.dump(); n = this.scr.find(want, exact) }
    }
    if (!n) this.ok(what ?? `нажать «${want}»`, false, this.scr.texts().slice(0, 30), want)
    // Не видно (лёжа, малый экран): прокрутить к нему — как человек, колесом/жестом по его прокрутке.
    for (let i = 0; i < 8 && n && !this.visible(n) && n.scroll; i++) {
      const vp = this.p.viewportSize()
      const box = n.sb ?? [0, 0, vp.width, vp.height]
      const cx = Math.min(Math.max((box[0] + box[2]) / 2, 5), vp.width - 5), cy = Math.min(Math.max((box[1] + box[3]) / 2, 5), vp.height - 5)
      const [nx, ny] = n.center(), dy = ny - cy, dx = nx - cx
      await this.p.mouse.move(cx, cy)
      if (Math.abs(dy) > 4 && (ny < 0 || ny > vp.height || n.b[1] < box[1] || n.b[3] > Math.min(box[3], vp.height))) await this.p.mouse.wheel(0, Math.sign(dy) * Math.min(Math.abs(dy), vp.height * 0.6))
      else { await this.p.keyboard.down('Shift'); await this.p.mouse.wheel(0, Math.sign(dx) * Math.min(Math.abs(dx), vp.width * 0.6)); await this.p.keyboard.up('Shift') }
      await this.look(`прокрутить к «${want}»`)
      n = this.scr.find(want, exact)
    }
    // Цель под плашкой внизу — человек промахнётся: флаг, и ждать, пока плашка уйдёт (до 8 с).
    const inside = (p, q) => p.b[0] >= q.b[0] - 1 && p.b[1] >= q.b[1] - 1 && p.b[2] <= q.b[2] + 1 && p.b[3] <= q.b[3] + 1
    const under = () => this.scr.nodes.find(b => b.id === 'плашка' && b.layer === n.layer && !inside(n, b) && n.center()[0] >= b.b[0] && n.center()[0] <= b.b[2] && n.center()[1] >= b.b[1] && n.center()[1] <= b.b[3])
    if (under() && !n.matches('плашка')) {
      this.flags.push({ экран: this.scr.signature(), шаг: what ?? `нажать «${want}»`, флаг: 'ПЛАШКА ЗАКРЫВАЕТ', подробно: `«${want}» под плашкой «${(under().all || '').slice(0, 40)}»` })
      for (let i = 0; i < 16 && under(); i++) { await sleep(500); await this.look('ждём, пока плашка уйдёт'); n = this.scr.find(want, exact) ?? n }
    }
    const [x, y] = n.center()
    const vp = this.p.viewportSize()
    // Пальцем за край экрана не нажать: такое — ошибка пути (не прокручивается), а не нажатие мимо.
    if (!this.visible(n)) this.ok(what ?? `нажать «${want}»`, false, `«${want}» за краем экрана (${Math.round(x)}, ${Math.round(y)})`, 'видно на экране')
    if (long) { await this.p.mouse.move(x, y); await this.p.mouse.down(); await sleep(800); await this.p.mouse.up() }
    else await this.p.mouse.click(x, y)
    this.lastTap = want
    if (look) await this.look(what ?? `нажать «${want}»`)
  }
  // Скорость быстрого человека: при ≈15 мс на знак ввод Compose переставляет буквы (гонка в самом Compose).
  /** Центр на экране и внутри своей прокрутки (не под шапкой и не под краем списка). */
  /** Виден целиком по высоте (обрезанный краем пункт меню ловит касание краем меню), центр — в своей прокрутке. */
  visible(n) {
    const vp = this.p.viewportSize(), [x, y] = n.center(), b = n.sb
    const top = Math.max(0, b ? b[1] : 0) - 2, bottom = Math.min(vp.height, b ? b[3] : vp.height) + 2
    return x >= 0 && x <= vp.width && n.b[1] >= top && n.b[3] <= bottom && (!b || (x >= b[0] - 1 && x <= b[2] + 1))
  }
  async type(text, what) { await this.p.keyboard.type(text, { delay: 40 }); await this.look(what ?? `набрать ${text}`) }
  async search(text) {
    const n = this.scr.nodes.find(n => n.role === 'textbox' && n.b[2] > n.b[0])
    this.ok('поле поиска', n, this.scr.texts().slice(0, 30), 'поле ввода')
    const [x, y] = n.center(); await this.p.mouse.click(x, y); await sleep(300)
    await this.type(text, `поиск: ${text}`)
  }
  /** Сколько осмотрено — число перед «из N осмотрено» в сводке описи. */
  inspected() {
    const i = this.scr.nodes.findIndex(n => /^из \d+ осмотрено$/.test(n.text || n.label))
    const prev = i > 0 ? this.scr.nodes[i - 1] : null
    return prev && /^\d+$/.test(prev.text || prev.label) ? Number(prev.text || prev.label) : null
  }
  async waitInspected(what, n, ms = 8000) {
    const t = Date.now()
    while (Date.now() - t < ms) { await this.look(what); if (this.inspected() === n) return; await sleep(300) }
    this.ok(what, false, `осмотрено ${this.inspected()}`, `осмотрено ${n}`)
  }
  found() { return this.scr.texts().find(t => t.startsWith('Найдено:')) ?? '' }
  async back(what = 'назад') { await this.p.goBack().catch(() => {}); await this.look(what) }
  async scrollTo(want, tries = 10) {
    for (let i = 0; i < tries; i++) {
      if (this.scr.has(want)) return
      const { width: W, height: H } = this.p.viewportSize()
      await this.p.mouse.move(W / 2, H * 0.6); await this.p.mouse.wheel(0, H * 0.4)
      await this.look(`прокрутить к «${want}»`)
    }
    this.expect(`прокрутить к «${want}»`, { has: [want] })
  }
  /** Выбор файла(ов): нажатие [want] открывает выбор, кладём [files]. */
  /** «Новая опись» с 3.13 спрашивает объект: первый раз завести, дальше выбрать. */
  async choose(want, files, what) {
    await this.pick(want, files, what)
    if (want !== 'Новая опись') return
    await this.waitFor('в какой объект', 'В какой объект', { ms: 5000 })
    if (this.scr.has('объект: Матрица')) await this.tap('объект: Матрица', 'выбрать объект', { exact: true })
    else {
      await this.tap('Новый объект…', 'завести объект', { exact: true })
      await this.tap('объект: название', 'поле названия', { exact: true })
      await this.type('Матрица', 'название объекта')
      await this.tap('Создать', 'создать объект', { exact: true })
    }
    await this.tap('Сюда', 'опись в объект', { exact: true })
    await sleep(800); await this.look(what)
  }
  async pick(want, files, what) {
    let c = null
    const picks = async () => this.p.evaluate(() => [globalThis.osmotrWeb?.picks ?? 0, globalThis.osmotrWeb?.pickActive ?? null])
    const before = (await picks())[0]
    for (let i = 0; i < 2 && !c; i++) { // окно ещё закрывалось — нажатие ушло в затемнение: ещё раз
      const fc = this.p.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null)
      if (i) {
        await this.look(what + ': ещё раз')
        // Просило ли приложение выбор файла в первый раз: да — браузер не открыл (повтор не поможет).
        if ((await picks())[0] > before || !this.scr.find(want)) break
      }
      await this.tap(want, what, { look: false })
      c = await fc
    }
    const [after, active] = await picks()
    // Приложение просило выбор файла при касании, а перехват Playwright под нагрузкой события не дал —
    // файл в само поле выбора, которое создало приложение (как выбор в открывшемся окне).
    if (!c && after > before && active) {
      const list = (Array.isArray(files) ? files : [files]).map(f => ({ name: f.split('/').pop(), b64: readFileSync(f).toString('base64') }))
      const ok = await this.p.evaluate(fs => {
        const got = globalThis.osmotrWeb?.lastPick; if (!got) return false
        for (const f of fs) got(f.name, Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)), Date.now())
        got(null, null, 0); return true
      }, list)
      if (ok) {
        this.steps.push({ что: what + ': окно выбора не перехвачено (Playwright) — файл отдан приложению напрямую', ок: true, было: '', ждали: '' })
        await sleep(1500); await this.look(what); return
      }
    }
    this.ok(what + ': выбор файла открылся', c, after > before ? `приложение просило выбор файла (${after - before} раз), браузер не открыл; касание пользователя активно: ${active}` : 'касание не дошло: приложение выбор файла не просило', 'окно выбора')
    await c.setFiles(files)
    await sleep(1500); await this.look(what)
  }
  async nodes() {
    return this.p.evaluate(() => new Promise(ok => {
      const r = indexedDB.open('osmotr-fs')
      r.onsuccess = () => { const q = r.result.transaction('nodes').objectStore('nodes').getAll(); q.onsuccess = () => ok(q.result.map(n => ({ p: n.p, d: n.d, s: n.s, hd: n.hd || (n.x ? [...n.x.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join('') : '') }))) }
    }))
  }
  async files(re) { return (await this.nodes()).filter(n => !n.d && re.test(n.p)) }
  async waitFiles(re, count, ms = 15000) {
    const t = Date.now()
    let f = []
    while (Date.now() - t < ms) { f = await this.files(re); if (f.length >= count) break; await sleep(400) }
    return f
  }
  /** Отданное через «Поделиться» (окно системы подменено — см. SHARE): имена, размеры, байты. */
  async sharedMark() { this.shareMark = await this.p.evaluate(() => window.__shared.length) }
  async shared(what, ms = 30000) {
    const t = Date.now(), n0 = this.shareMark ?? await this.p.evaluate(() => window.__shared.length)
    this.shareMark = null
    let n = n0
    while (Date.now() - t < ms && n === n0) { await sleep(300); n = await this.p.evaluate(() => window.__shared.length) }
    this.ok(what, n > n0, 'ничего не отдано', '«Поделиться» с файлами')
    return this.p.evaluate(async i => Promise.all(window.__shared[i].files.map(async f => ({ name: f.name, type: f.type, size: f.size,
      b64: f.size < 600e6 ? await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] ?? ''); fr.readAsDataURL(f) }) : '' }))), n - 1)
      .then(fs => fs.map(f => ({ ...f, bytes: Buffer.from(f.b64, 'base64') })))
  }
  async waitGone(re, ms = 10000) {
    const t = Date.now(); let f = []
    while (Date.now() - t < ms) { f = await this.files(re); if (!f.length) break; await sleep(400) }
    return f
  }
  async download(what, ms = 30000) {
    const t = Date.now(), n = this.downloads.length
    while (Date.now() - t < ms && this.downloads.length === n) await sleep(300)
    this.ok(what, this.downloads.length > n, 'скачивания нет', 'файл')
    const d = this.downloads[this.downloads.length - 1]
    return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) }
  }
}

// ---------- Пути ----------

async function start(r) {
  await r.p.goto(BASE); await r.p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 60000 })
  // iPhone во вкладке Safari (матрица — с адресом iPhone): подсказка «на экран „Домой“» — есть и закрывается.
  await r.p.waitForSelector('.osmotr-install', { timeout: 3000 }).catch(() => null)
  r.ok('во вкладке Safari — подсказка «на экран „Домой“»', !!(await r.p.$('.osmotr-install')), 'нет', 'есть')
  await r.p.click('.osmotr-install button')
  await r.look('главная')
}
async function fresh(r) {
  await start(r)
  await r.choose('Новая опись', F.good, 'загрузить опись пути')
  await r.waitFor('опись открылась', 'из 12 осмотрено')
  r.expect('опись открылась', { has: ['из 12 осмотрено', 'МТ-101'] })
}
async function camera(r, what) {
  await r.p.waitForSelector('.osmotr-camera .shutter:not([disabled])', { timeout: 15000 }).catch(() => null)
  const ok = !!(await r.p.$('.osmotr-camera .shutter:not([disabled])'))
  r.ok(what, ok, ok ? '' : (await r.p.textContent('.osmotr-camera .message').catch(() => '')) || 'спуск не готов', 'камера открыта')
}
/**
 * [n] быстрых касаний спуска — прямо в кнопку, по 60 мс (Playwright перед своим щелчком проверяет кнопку
 * и в WebKit тратит на это ~1,5 с — мерили бы его, а не приложение). Ответ — сколько заняли касания.
 */
async function shoot(r, n) {
  return r.p.evaluate(async k => {
    const b = document.querySelector('.osmotr-camera .shutter'), t = performance.now()
    for (let i = 0; i < k; i++) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); await new Promise(z => setTimeout(z, 60)) }
    return Math.round(performance.now() - t)
  }, n)
}
async function taken(r, n) {
  return r.p.waitForFunction(k => document.querySelector('.osmotr-camera .counter')?.textContent === 'Снято: ' + k, n, { timeout: 20000 }).then(() => true, () => false)
}

const PATHS = {
  async 'поиск → карточка → назад'(r) {
    await fresh(r)
    await r.search('105')
    await r.waitFor('нашлось по номеру', 'МТ-105')
    await r.tap('Шкаф металлический 5', 'открыть найденное')
    await r.waitFor('карточка предмета', 'Опись «matrix-good»')
    await r.back()
    await r.waitFor('вернулись в опись', 'из 12 осмотрено')
    r.expect('поиск чист', { lacks: ['Найдено:'] })
  },
  async 'осмотрено выделением и снять'(r) {
    await fresh(r)
    await r.tap('Шкаф металлический 1', 'выделить долгим нажатием', { long: true, exact: true })
    await r.waitFor('панель выделения', 'Осмотрено (1)')
    r.expect('панель выделения', { has: ['Отмечено: 1', 'Осмотрено (1)'] })
    await r.tap('Осмотрено (1)')
    await r.waitInspected('метка «осмотрено»: 1 из 12', 1)
    r.expect('метка у предмета', { has: ['осмотрено'], exact: true })
    await r.tap('Шкаф металлический 1', 'выделить снова', { long: true, exact: true })
    await r.tap('Снять (1)')
    await r.waitInspected('метка снята: 0 из 12', 0)
    r.expect('без метки', { lacks: ['осмотрено'], exact: true })
  },
  async 'осмотрено в карточке и снять'(r) {
    await fresh(r)
    await r.tap('МТ-102', 'открыть предмет', { exact: true })
    await r.tap('Отметить осмотренным')
    await r.waitFor('отмечено в карточке', 'Осмотрено — снять отметку')
    await r.tap('Осмотрено — снять отметку')
    await r.waitFor('снято в карточке', 'Отметить осмотренным')
    await r.back()
    await r.waitInspected('в описи: 0 из 12', 0)
    r.expect('без метки', { lacks: ['осмотрено'], exact: true })
  },
  async 'снимки предмета — осмотрено, сегодня, на главной'(r) {
    await fresh(r)
    await r.tap('Снять', 'камера первого предмета', { look: false })
    await camera(r, 'камера открылась')
    await shoot(r, 2)
    r.ok('снято 2', await taken(r, 2), 'счётчик не дошёл', 'Снято: 2')
    await r.p.click('.osmotr-camera .done')
    await r.waitInspected('опись после съёмки: 1 из 12', 1)
    r.expect('осмотрено и сегодня', { has: ['сегодня +1', 'осмотрено'] })
    await r.back('на главную')
    await r.waitFor('главная: объект', 'Матрица')
  },
  async 'поворот и тема не теряют поиск'(r) {
    await fresh(r)
    await r.search('10')
    await r.waitFor('нашлось', 'Найдено:')
    const before = r.found()
    const { width, height } = r.p.viewportSize()
    await r.p.setViewportSize({ width: height, height: width }); await r.look('повернули')
    await r.waitFor('после поворота — тот же поиск', before, { exact: true })
    await r.p.emulateMedia({ colorScheme: r.ctx.dark ? 'light' : 'dark' }); await r.look('сменили тему')
    await r.waitFor('после смены темы — тот же поиск', before, { exact: true })
    await r.p.emulateMedia({ colorScheme: r.ctx.dark ? 'dark' : 'light' }); await r.p.setViewportSize({ width, height })
    await r.waitFor('после возврата — тот же поиск', before, { exact: true })
  },
  async 'столбцы: поправить и не сохранять'(r) {
    await fresh(r)
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Столбцы описи')
    await r.waitFor('экран столбцов', 'Как прочитано:')
    r.expect('экран столбцов', { has: ['Столбцы описи', 'Инв. №', 'Наименование', 'Сохранить', 'Сводка'] })
    await r.tap('Наименование', 'столбец наименований', { exact: true })
    await r.waitFor('выбор поля', 'Не брать этот столбец')
    await r.tap('Инвентарный номер', 'указать: инвентарник', { exact: true })
    await r.waitFor('предупреждение', 'проверьте столбец')
    await r.back('назад с несохранённым')
    await r.waitFor('спросили', 'Не сохранять изменения?')
    await r.tap('Не сохранять', null, { exact: true })
    await r.waitFor('опись как была', 'из 12 осмотрено')
    r.expect('опись как была', { has: ['МТ-101'] })
  },
  async 'столбцы: не брать стоимость и вернуть'(r) {
    await fresh(r)
    r.expect('стоимость есть', { has: ['первонач.'] })
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Столбцы описи')
    await r.waitFor('экран столбцов', 'Как прочитано:')
    const visible = name => { const n = r.scr.find(name, true); const vp = r.p.viewportSize(); return n && n.b[2] <= vp.width && n.b[0] >= 0 }
    for (let i = 0; i < 6 && !visible('Стоимость'); i++) {
      const t = r.scr.find('таблица') ?? { b: [0, 200, r.p.viewportSize().width, 400] }
      await r.p.mouse.move((t.b[0] + t.b[2]) / 2, t.b[1] + 100)
      await r.p.keyboard.down('Shift'); await r.p.mouse.wheel(0, 300); await r.p.keyboard.up('Shift')
      await r.look('вбок к «Стоимость»')
    }
    await r.tap('Стоимость', 'столбец стоимости', { exact: true })
    await r.tap('Не брать этот столбец')
    await r.tap('Сохранить')
    await r.waitFor('опись', 'из 12 осмотрено')
    r.expect('стоимости нет', { lacks: ['первонач.'] })
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Столбцы описи')
    await r.tap('Как решит приложение')
    await r.tap('Сохранить')
    await r.waitFor('стоимость вернулась', 'первонач.')
  },
  async 'столбцы: лист не брать и вернуть'(r) {
    await fresh(r)
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Столбцы описи')
    await r.tap('лист Опись', 'лист «Опись»')
    await r.tap('брать лист', 'не брать лист')
    await r.waitFor('предметов нет — сохранить нельзя', 'Ни одного предмета')
    await r.tap('брать лист', 'брать снова')
    await r.waitFor('снова 12', '12 предметов')
    await r.back('назад: изменений нет')
    await r.waitFor('опись, без вопроса', 'из 12 осмотрено')
    r.expect('без вопроса', { lacks: ['Не сохранять изменения?'] })
  },
  async 'объект: документ PDF, страницы, поворот; ТС: геометка, топливо'(r) {
    await start(r)
    await r.tap('Новый объект', 'новый объект')
    await r.waitFor('окно объекта', 'Учреждение')
    await r.tap('объект: название', 'поле названия', { exact: true })
    await r.type('Matrix docs', 'название')
    await r.tap('Создать', 'создать', { exact: true })
    await r.waitFor('объект открыт', 'Все документы')
    await r.scrollTo('Документы'); await r.tap('Документы', 'документы', { exact: true })
    await r.choose('добавить документ', F.doc, 'добавить pdf')
    await r.waitFiles(/matrix-doc\.pdf$/, 1)
    await r.waitFor('плитка pdf', 'matrix-doc')
    await r.tap('matrix-doc', 'открыть pdf')
    await r.waitFor('страницы pdf', 'Страница 1', { ms: 15000 })
    r.expect('две страницы', { has: ['1 / 2'] })
    await r.tap('Повернуть страницу', 'поворот страницы')
    await r.tap('номер страницы', 'панель страниц', { exact: true })
    await r.waitFor('миниатюры', 'Страница 1 из 2')
    await r.tap('миниатюра 2', 'вторая страница', { exact: true })
    await r.waitFor('вторая открыта', '2 / 2')
    await r.p.waitForTimeout(1500); await r.p.screenshot({ path: join(FIX, 'pdf-страница.png') })
    await r.back('из pdf'); await r.back('из документов')
    await r.waitFor('снова объект', 'Все документы')
    await r.p.context().setGeolocation({ latitude: 42.87462, longitude: 74.56976 }).catch(() => {})
    await r.p.context().grantPermissions(['geolocation'], { origin: BASE }).catch(() => {})
    await r.scrollTo('Движимое'); await r.tap('Движимое', 'движимое', { exact: true })
    await r.tap('кнопка категории', 'добавить тс', { exact: true })
    await r.type('01KG777ABC', 'госномер')
    await r.tap('Добавить', 'добавить', { exact: true })
    await r.tap('карточка параметров', 'параметры тс', { exact: true })
    await r.waitFor('форма тс', 'Тип топлива')
    await r.tap('Прикрепить геометку', 'геометка')
    await r.waitFor('координаты в адресе', '42.87462, 74.56976', { ms: 10000 })
  },
  async 'битый, PDF, без списка, повтор'(r) {
    await start(r)
    await r.choose('Новая опись', F.broken, 'битый файл')
    await r.waitFor('причина — повреждён', 'повреждён')
    await r.tap('Готово', 'закрыть окно', { exact: true })
    await r.choose('Новая опись', F.pdf, 'PDF под видом xlsx')
    await r.waitFor('причина — PDF', 'PDF')
    await r.tap('Готово', 'закрыть окно', { exact: true })
    await r.choose('Новая опись', F.act, 'книга без списка')
    await r.waitFor('столбцы спрошены', 'Список предметов сам не нашёлся')
    await r.back('закрыть столбцы')
    await r.waitFor('пустое состояние описи', 'Указать столбцы')
    r.expect('пустое состояние', { has: ['Загрузить другой файл'] })
    await r.back('на главную')
    await r.choose('Новая опись', F.good, 'хорошая опись')
    await r.waitFor('открылась', 'из 12 осмотрено')
    await r.back('на главную')
    await r.choose('Новая опись', F.good, 'та же второй раз')
    await r.waitFor('уже загружена', 'уже загружена')
  },
  async 'старый Excel (.xls) — опись'(r) {
    await start(r)
    await r.choose('Новая опись', F.xls, 'опись .xls')
    await r.waitFor('открылась', 'из 8 осмотрено')
    r.expect('предметы и год', { has: ['777/1001', 'Сканер штрих-кода Honeywell', '2019 г.'] })
    const f = await r.files(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/02-inv1\/.*\.xlsx$/)
    r.ok('хранится как .xlsx', f.length >= 1 && f[0].hd.startsWith('504b'), f, 'файл описи — zip (.xlsx)')
  },
  async 'замена чужой описью — спросить'(r) {
    await fresh(r)
    await r.tap('Снять', 'камера первого предмета', { look: false }); await camera(r, 'камера'); await shoot(r, 1)
    r.ok('снято', await taken(r, 1), 'нет', 'Снято: 1'); await r.p.click('.osmotr-camera .done')
    await r.waitInspected('осмотрен один', 1)
    await r.tap('Ещё', 'меню', { exact: true })
    await r.choose('Заменить файл описи', F.other, 'выбрать чужую опись')
    await r.waitFor('спросили перед заменой', 'Заменить файл описи?')
    r.expect('спросили', { has: ['Похоже, это другая опись.'] })
    await r.tap('Отмена', null, { exact: true })
    await r.waitInspected('опись как была: 1 из 12', 1)
  },
  async 'замена и «вернуть прежний файл»'(r) {
    await fresh(r)
    await r.tap('Ещё', 'меню', { exact: true })
    await r.choose('Заменить файл описи', F.other, 'выбрать чужую опись')
    if (r.scr.has('Заменить файл описи?')) { await r.tap('Заменить', 'заменить', { exact: true }); await sleep(1500) }
    await r.waitFor('чужая опись на экране', 'Кресло')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Вернуть прежний файл описи', 'вернуть')
    await r.waitFor('прежняя опись на экране', 'МТ-101')
    r.expect('без чужой', { lacks: ['Кресло 1'] })
  },
  async 'папки: новая, переименовать, комментарий'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка')
    await r.type('Насос 1', 'имя папки')
    await r.tap('Создать', 'создать', { exact: true })
    await r.waitFor('в папке', 'Насос 1')
    r.ok('папка создана', (await r.nodes()).some(n => n.p === ROOT + '/Насос 1' && n.d), (await r.nodes()).map(n => n.p), 'Насос 1')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Переименовать', 'переименовать', { exact: true })
    await r.p.keyboard.press('Control+A'); await r.type('Насос 2', 'новое имя')
    await r.tap('Готово', 'готово', { exact: true })
    await r.waitFor('переименована', 'Насос 2')
    const names = (await r.nodes()).filter(n => n.d).map(n => n.p)
    r.ok('папка переименована', names.includes(ROOT + '/Насос 2') && !names.includes(ROOT + '/Насос 1'), names, 'Насос 2 вместо Насос 1')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Добавить комментарий', 'комментарий')
    await r.type('Течь по сальнику', 'текст')
    await r.tap('Готово', 'готово', { exact: true })
    await r.waitFor('комментарий на экране', 'Течь по сальнику')
    r.ok('комментарий в папке', (await r.files(/\/Насос 2\/Комментарий\.txt$/)).length === 1, '', 'Комментарий.txt')
  },
  async 'экраны: папки, поиск, дерево'(r) {
    await fresh(r)
    await r.tap('Папки описи', 'папки описи')
    for (const want of ['Поиск', 'Структура']) {
      if (!r.scr.find(want)) continue
      await r.tap(want, want)
      await r.back(`назад из «${want}»`)
    }
  },
  async 'съёмка: серия, «Готово» сразу, второй заход'(r) {
    await fresh(r)
    await r.tap('Снять', 'снять МТ-101', { look: false })
    await camera(r, 'камера открылась')
    const tapMs = await shoot(r, 10)
    // 10 касаний по 60 мс — 600 мс, если спуск не держит палец; держит (кадр сжимается на месте) — дольше.
    // WebKit для Linux рисует без видеокарты (кадр 4K читается ~1 с) — его время о iPhone не говорит: сведение, не провал.
    if (r.engine === 'webkit') r.steps.push({ что: `10 касаний: ${tapMs} мс (WebKit для Linux, программная отрисовка — сведение)`, ок: true, было: '', ждали: '' })
    else r.ok('10 касаний подряд не ждут друг друга', tapMs < 2500, `${tapMs} мс`, '< 2,5 с на 10 касаний')
    const stats = () => r.p.evaluate(() => ({ ...(globalThis.osmotrWeb?.cameraStats ?? { accepted: 0, rejected: 0 }) }))
    const s1 = await stats()
    r.ok('принято касаний — не меньше трёх (больше трёх несжатых кадров спуск не берёт)', s1.accepted >= 3 && s1.accepted + s1.rejected === 10, s1, '≥ 3 из 10')
    const t1 = Date.now(); await r.p.click('.osmotr-camera .done'); await sleep(300)
    r.ok('«Готово» закрывает сразу', !(await r.p.$('.osmotr-camera')), `через ${Date.now() - t1} мс`, 'закрыт')
    await r.look('вернулись из камеры')
    await r.tap('Снять', 'снова снять МТ-101', { look: false })
    await camera(r, 'второй заход'); await shoot(r, 2); await sleep(500); await r.p.click('.osmotr-camera .done')
    const want = (await stats()).accepted
    const files = await r.waitFiles(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/1\. МТ-101[^/]*\/[^/]+\.jpg$/, want, 30000)
    await sleep(1500)
    const tmps = await r.files(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/1\. МТ-101[^/]*\/\.[^/]*\.tmp$/)
    r.ok('все принятые кадры двух заходов в папке', files.length === want && !tmps.length, { в_папке: files.length, принято: want, временные: tmps.length }, `${want} .jpg, временных нет`)
    r.ok('кадры — JPEG', files.every(f => f.hd.startsWith('ffd8')), files.map(f => f.hd.slice(0, 4)), 'ffd8 у каждого')
    r.ok('имена как на Android', files.every(f => /\/(1\. МТ-101[^/]*)\/\1_\d{8}_\d{6}_\d{3}\.jpg$/.test(f.p)), files.map(f => f.p).slice(0, 3), '«<папка>_ГГГГММДД_ЧЧММСС_NNN.jpg»')
    await r.waitInspected('осмотрен один', 1)
  },
  async 'камера: видео, сетка, 4:3 и 16:9 — запоминаются'(r) {
    await fresh(r)
    await r.tap('Снять', 'снять МТ-101', { look: false })
    await camera(r, 'камера открылась')
    const cam = () => r.p.evaluate(() => {
      const q = s => document.querySelector('.osmotr-camera ' + s)
      return { grid: !q('.grid')?.hidden, aspect: q('.aspect')?.textContent, modes: !q('.modes')?.hidden,
        mode: q('.modes [aria-pressed="true"]')?.dataset.mode, last: globalThis.osmotrWeb?.cameraStats?.last }
    })
    const ratioOf = l => l ? Math.max(l[0], l[1]) / Math.min(l[0], l[1]) : 0
    let c = await cam()
    r.ok('по умолчанию: 4:3, без сетки', c.aspect === '4:3' && !c.grid, c, '4:3, сетка выкл')
    await r.p.click('.osmotr-camera .grid-toggle')
    r.ok('сетка включилась', (await cam()).grid, '', 'сетка видна')
    if (process.env.SHOTS) await r.p.screenshot({ path: `${process.env.SHOTS}/камера-${r.engine}-${r.p.viewportSize().width}.png` })
    await shoot(r, 1); r.ok('снято', await taken(r, 1), '', 'Снято: 1')
    c = await cam(); r.ok('кадр 4:3', Math.abs(ratioOf(c.last) - 4 / 3) < 0.02, c.last, '4:3')
    await r.p.click('.osmotr-camera .aspect'); await camera(r, 'камера в 16:9')
    c = await cam(); r.ok('формат 16:9', c.aspect === '16:9', c.aspect, '16:9')
    await shoot(r, 1); r.ok('снято 2', await taken(r, 2), '', 'Снято: 2')
    c = await cam(); r.ok('кадр 16:9', Math.abs(ratioOf(c.last) - 16 / 9) < 0.02, c.last, '16:9')
    let videos = 0
    if (c.modes) {
      await r.p.click('.osmotr-camera .modes [data-mode="video"]')
      r.ok('режим ВИДЕО', (await cam()).mode === 'video', '', 'video')
      await r.p.click('.osmotr-camera .shutter')
      await r.p.waitForSelector('.osmotr-camera .timer:not([hidden])', { timeout: 10000 }).catch(() => null)
      if (process.env.SHOTS) await r.p.screenshot({ path: `${process.env.SHOTS}/запись-${r.engine}-${r.p.viewportSize().width}.png` })
      r.ok('идёт запись — таймер', !!(await r.p.$('.osmotr-camera.recording .timer:not([hidden])')), '', '● 00:0N')
      await sleep(2500)
      await r.p.click('.osmotr-camera .shutter')
      r.ok('видео записано', await taken(r, 3), await r.p.textContent('.osmotr-camera .message').catch(() => ''), 'Снято: 3')
      videos = 1
    } else r.steps.push({ что: 'в этом браузере нет MediaRecorder — режима ВИДЕО нет (на iPhone он есть)', ок: true, было: '', ждали: '' })
    await r.p.click('.osmotr-camera .done'); await r.look('вернулись из камеры')
    await r.tap('Снять', 'снова камера', { look: false }); await camera(r, 'второй заход')
    c = await cam()
    r.ok('выбор запомнился', c.grid && c.aspect === '16:9' && (!c.modes || c.mode === 'video'), c, 'сетка, 16:9, ВИДЕО')
    // Вернуть как было — для остальных путей того же браузера.
    await r.p.click('.osmotr-camera .grid-toggle'); await r.p.click('.osmotr-camera .aspect')
    if (c.modes) await r.p.click('.osmotr-camera .modes [data-mode="photo"]')
    await r.p.click('.osmotr-camera .done')
    const dir = /^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/1\. МТ-101[^/]*\//
    const jpg = await r.waitFiles(new RegExp(dir.source + /[^/]+\.jpg$/.source), 2)
    r.ok('два снимка', jpg.length === 2 && jpg.every(f => f.hd.startsWith('ffd8')), jpg.map(f => f.p), '2 .jpg')
    if (!videos) return
    const vid = await r.waitFiles(new RegExp(dir.source + /[^/]+\.(mp4|webm)$/.source), 1, 20000)
    r.ok('видео в папке предмета, имя как у снимков', vid.length === 1 && vid[0].s > 1000 && /\/(1\. МТ-101[^/]*)\/\1_\d{8}_\d{6}_\d{3}\.(mp4|webm)$/.test(vid[0].p),
      vid, '«<папка>_ГГГГММДД_ЧЧММСС_NNN.mp4»')
    const recs = await r.files(new RegExp(dir.source + /\.[^/]*\.rec$/.source))
    r.ok('временных нет', !recs.length, recs, 'нет .rec')
    await r.tap('МТ-101', 'карточка МТ-101')
    await r.waitFor('карточка', 'Отметить')
    await r.scrollTo(', Видео')
    { const { width: W, height: H } = r.p.viewportSize(); await r.p.mouse.move(W / 2, H * 0.6); await r.p.mouse.wheel(0, H); await r.look('видео целиком на экране') }
    if (process.env.SHOTS) { await sleep(1500); await r.p.screenshot({ path: `${process.env.SHOTS}/видео-${r.engine}-${r.p.viewportSize().width}.png` }) }
    await r.tap(vid[0].p.split('/').pop() + ', Видео', 'открыть видео')
    await r.p.waitForSelector('.osmotr-player video', { timeout: 8000 }).catch(() => null)
    const ok = await r.p.evaluate(() => new Promise(done => {
      const v = document.querySelector('.osmotr-player video')
      if (!v) return done('нет проигрывателя')
      if (v.readyState >= 1) return done(v.duration > 1 || v.duration === Infinity ? 'ok' : 'длительность ' + v.duration)
      v.onloadedmetadata = () => done(v.duration > 1 || v.duration === Infinity ? 'ok' : 'длительность ' + v.duration)
      v.onerror = () => done('ошибка ' + v.error?.code)
      setTimeout(() => done('не загрузилось'), 8000)
    }))
    r.ok('видео играется', ok === 'ok', ok, 'метаданные, длительность > 1 с')
    await r.back('«назад» закрывает проигрыватель')
    r.ok('проигрыватель закрыт', !(await r.p.$('.osmotr-player')), '', 'закрыт')
  },
  async 'камера: отказ в доступе — понятная причина'(r) {
    // Отказ — на прототипе: в WebKit свойство самого navigator.mediaDevices не перезаписывается.
    await r.p.addInitScript(() => { Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { configurable: true, value: () => Promise.reject(new DOMException('нет', 'NotAllowedError')) }) })
    await fresh(r)
    await r.tap('Снять', 'камера', { look: false })
    await r.p.waitForSelector('.osmotr-camera .message:not([hidden])', { timeout: 10000 }).catch(() => null)
    const msg = await r.p.textContent('.osmotr-camera .message').catch(() => '')
    r.ok('причина словами', /доступ к камере/.test(msg ?? ''), msg, 'про доступ к камере')
    r.ok('спуск выключен', !!(await r.p.$('.osmotr-camera .shutter[disabled]')), '', 'disabled')
    await r.p.click('.osmotr-camera .done'); await r.look('закрыли')
    r.expect('опись цела', { has: ['из 12 осмотрено'] })
  },
  async 'камера: нагрузка — случайные действия'(r) {
    await fresh(r)
    let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n
    let shots = 0
    for (let round = 0; round < 3; round++) {
      await r.tap('Снять', `заход ${round + 1}`, { look: false }); await camera(r, `камера ${round + 1}`)
      for (let i = 0; i < 25; i++) {
        const a = rnd(4)
        if (a < 2) { await r.p.click('.osmotr-camera .shutter', { noWaitAfter: true }).catch(() => {}); shots++ }
        else if (a === 2) { const { width, height } = r.p.viewportSize(); await r.p.mouse.click(rnd(width), rnd(height) * 0.7) }
        else await r.p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
      }
      await sleep(800); await r.p.click('.osmotr-camera .done').catch(() => {})
      await r.look(`после захода ${round + 1}`)
    }
    const files = await r.waitFiles(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/1\. МТ-101[^/]*\/[^/]+\.jpg$/, 1, 20000)
    r.ok('без падений, снимки легли', files.length >= 1 && files.length <= shots, { снято: files.length, нажатий: shots }, '1…нажатий')
  },
  async 'галерея: фото в папку'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Фото', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Галерея')
    await r.choose('Галерея', [F.photo1, F.photo2], 'из галереи два фото')
    const f = await r.waitFiles(/^\/Осмотры\/Фото\/[^/]+\.jpg$/, 2)
    r.ok('два снимка в папке', f.length === 2, f.map(x => x.p), '2 .jpg')
    await r.waitFor('снимки на экране', 'снимок')
  },
  async 'просмотр: листать, удалить, вернуть'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Просмотр', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать')
    await r.tap('Снимать', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 3)
    r.ok('снято 3', await taken(r, 3), '', 'Снято: 3'); await r.p.click('.osmotr-camera .done')
    await r.waitFor('сетка', 'снимок')
    await r.tap('снимок', 'открыть первый')
    await r.waitFor('просмотр', 'из 3')
    await r.tap('Удалить', 'удалить снимок', { exact: true })
    await r.waitFor('удалено — «Вернуть»', 'Вернуть')
    let f = await r.files(/^\/Осмотры\/Просмотр\/[^/]+\.jpg$/)
    r.ok('в папке 2', f.length === 2, f.length, 2)
    await r.tap('Вернуть', 'вернуть', { exact: true })
    f = await r.waitFiles(/^\/Осмотры\/Просмотр\/[^/]+\.jpg$/, 3)
    r.ok('вернулся', f.length === 3, f.length, 3)
  },
  async 'папка: удалить и вернуть'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Удалить меня', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать')
    await r.tap('Снимать', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 1)
    r.ok('снято', await taken(r, 1), '', 'Снято: 1'); await r.p.click('.osmotr-camera .done')
    await r.waitFor('снимок', 'снимок')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Удалить папку')
    await r.tap('Удалить', 'подтвердить', { exact: true })
    await r.waitFor('удалено — «Вернуть»', 'Вернуть')
    r.ok('папки нет', !(await r.nodes()).some(n => n.p === ROOT + '/Удалить меня'), '', 'нет')
    await r.tap('Вернуть', 'вернуть', { exact: true })
    const f = await r.waitFiles(/^\/Осмотры\/Удалить меня\/[^/]+\.jpg$/, 1)
    r.ok('папка со снимком вернулась', f.length === 1, f, 1)
  },
  async 'перезагрузка: всё на месте'(r) {
    await fresh(r)
    await r.tap('Снять', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 2)
    r.ok('снято', await taken(r, 2), '', 'Снято: 2'); await r.p.click('.osmotr-camera .done')
    await r.waitInspected('осмотрен один', 1)
    await r.p.reload(); await r.p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 60000 })
    await r.p.waitForSelector('.osmotr-install', { timeout: 3000 }).then(() => r.p.click('.osmotr-install button'), () => {})
    await r.waitFor('главная после перезагрузки', 'Матрица')
    await r.tap('Матрица', 'объект')
    await r.scrollTo('Механизмы и оборудование'); await r.tap('Механизмы и оборудование', 'механизмы')
    await r.tap('matrix-good', 'опись')
    await r.waitInspected('опись после перезагрузки: 1 из 12', 1)
    r.ok('снимки на месте', (await r.files(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/1\. МТ-101[^/]*\/[^/]+\.jpg$/)).length === 2, '', 2)
  },
  async '«назад» браузера — шаг назад в приложении'(r) {
    await fresh(r)
    await r.tap('МТ-102', 'карточка', { exact: true })
    await r.back('назад из карточки')
    await r.waitFor('опись', 'из 12 осмотрено')
    await r.back('назад из описи')
    await r.waitFor('главная', 'Новая опись')
    await r.back('назад на главной')
    r.ok('страница та же', r.p.url().startsWith(BASE), r.p.url(), BASE)
    await r.look('главная после «назад»')
    r.expect('приложение на месте', { has: ['Новая опись'] })
  },
  async 'голос: запись в папке'(r) {
    await start(r)
    // WebKit для Linux собран без MediaRecorder (на iPhone он есть) — проверить, что приложение говорит это прямо.
    const noRecorder = await r.p.evaluate(() => typeof MediaRecorder === 'undefined')
    await r.tap('Новая папка', 'новая папка'); await r.type('Голос', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Диктофон')
    if (noRecorder) { await r.waitFor('браузер без записи звука — сказано прямо', 'запись голоса недоступна'); return }
    await r.tap('Записать', 'записать')
    if (!r.scr.has('Остановить')) await r.tap('Записать', 'записать ещё раз (после разрешения)')
    await sleep(2500)
    await r.tap('Остановить', 'остановить')
    const f = await r.waitFiles(/^\/Осмотры\/Голос\/Голос_голос_\d{8}_\d{6}\.m4a$/, 1)
    r.ok('заметка в папке', f.length === 1 && f[0].s > 1000, f, '«Голос_голос_….m4a»')
  },
  async 'выгрузка: отчёты всех видов'(r) {
    await fresh(r)
    await r.tap('Шкаф металлический 1', 'выделить', { long: true, exact: true })
    await r.tap('Осмотрено (1)')
    for (const kind of ['Отчёт: всё', 'Отчёт: осмотренное', 'Отчёт: не осмотренное']) {
      await r.tap('Выгрузить опись', 'выгрузка')
      await r.waitFor('виды отчёта', kind)
      await r.sharedMark()
      await r.tap(kind, kind, { look: false })
      const [d] = await r.shared(`${kind} — наружу`)
      r.ok(`${kind}: книга Excel`, d && d.bytes[0] === 0x50 && d.bytes[1] === 0x4b && /\.xlsx$/.test(d.name), d?.name, '.xlsx')
      const b = bookText(d.bytes)
      r.ok(`${kind}: все столбцы описи`, ['№ п/п', 'Наименование', 'Инв. номер', 'Стоимость'].every(h => b.text.includes(h)), b.text.slice(0, 300), 'столбцы описи как есть')
      await r.look(`после «${kind}»`)
    }
  },
  async 'выгрузки: архив, вложенность, частями, сохранить, удалить'(r) {
    await r.p.addInitScript(() => {
      window.__saved = []
      window.showSaveFilePicker = async o => ({ createWritable: async () => ({ write: async b => { window.__saved.push({ name: o.suggestedName, size: b.size }) }, close: async () => {} }) })
    })
    await fresh(r)
    await r.tap('Снять', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 3)
    r.ok('снято', await taken(r, 3), '', 'Снято: 3'); await r.p.click('.osmotr-camera .done')
    await r.waitInspected('осмотрен один', 1)
    await r.tap('Папки описи', 'папки описи')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.sharedMark()
    await r.tap('Отправить архивом', 'архив', { look: false })
    const [d] = await r.shared('архив — наружу')
    const names = Object.keys(unzipSync(new Uint8Array(d.bytes)))
    r.ok('вложенность как на Android', names.filter(n => /^matrix-good\/1\. МТ-101[^/]*\/[^/]+\.jpg$/.test(n)).length === 3, names, '«matrix-good/1. МТ-101 — …/….jpg» ×3')
    r.ok('опись и отчёт в архиве', names.some(n => /^matrix-good\/.*\.xlsx$/.test(n)), names, '.xlsx описи')
    await r.look('после архива')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Выгрузки', 'выгрузки', { exact: true })
    await r.waitFor('экран выгрузок', 'По частям')
    await r.tap('Сохранить', 'сохранить файлом', { exact: true })
    await sleep(1500)
    const saved = await r.p.evaluate(() => window.__saved)
    r.ok('«Сохранить» — архив файлом', saved.length === 1 && /\.zip$/.test(saved[0].name) && saved[0].size === d.bytes.length, saved, d.bytes.length + ' Б')
    // Части: архив больше предела — папка с тремя снимками по 700 КБ из галереи.
    await r.back('из выгрузок'); await r.back('на главную'); await r.back('на главную')
    await r.waitFor('главная', 'Новая опись')
    await r.tap('Новая папка', 'новая папка'); await r.type('Большие', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Галерея')
    await r.choose('Галерея', [F.big1, F.big2, F.big3], 'три снимка по 700 КБ')
    r.ok('три снимка в папке', (await r.waitFiles(/^\/Осмотры\/Большие\/[^/]+\.jpg$/, 3)).length === 3, '', 3)
    await r.sharedMark()
    await r.tap('Ещё', 'меню', { exact: true }); await r.tap('Отправить архивом', 'архив побольше', { look: false })
    await r.shared('архив 2,1 МБ — наружу')
    await r.look('после архива')
    await r.tap('Ещё', 'меню', { exact: true }); await r.tap('Выгрузки', 'выгрузки', { exact: true })
    await r.waitFor('экран выгрузок', 'Большие')
    await r.tap('По частям', 'по частям', { exact: true })
    await r.tap('Свой предел, МБ', 'свой предел', { exact: true })
    await r.type('1', 'предел 1 МБ')
    await r.sharedMark()
    await r.tap('Разбить и отправить', null, { exact: true, look: false })
    const sent = await r.shared('части — наружу')
    await r.look('после разбиения')
    r.ok('частей ≥ 2, каждая ≤ 1 МБ, самостоятельный архив', sent.length >= 2 && sent.every(x => x.size <= 1048576 && x.bytes[0] === 0x50 && x.bytes[1] === 0x4b),
      sent.map(x => `${x.name} ${x.size}`), '≥ 2 .zip ≤ 1 МБ')
    const inParts = sent.flatMap(x => Object.keys(unzipSync(new Uint8Array(x.bytes))))
    r.ok('вместе — все три снимка', inParts.filter(n => /^Большие\/.*\.jpg$/.test(n)).length === 3, inParts, '3 снимка «Большие/…»')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Удалить все', 'удалить все')
    await r.tap('Удалить', 'подтвердить', { exact: true })
    await sleep(1500)
    const left = await r.waitGone(/^\/app\/cache\/exports\/.*\.zip$/)
    r.ok('«Удалить все» освобождает место', !left.length, left.map(x => x.p), 'пусто')
  },
  async 'прикрепить опись к папке'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Цех', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.choose('Прикрепить опись', F.attach, 'прикрепить опись')
    await r.waitFor('предмет на экране', 'Станок токарный')
    r.ok('опись в папке', (await r.files(/^\/Осмотры\/Цех\/Опись — .*\.xlsx$/)).length === 1, (await r.files(/^\/Осмотры\/Цех\//)).map(f => f.p), '«Опись — ….xlsx» в «Цех»')
  },
  async 'осмотрено ранее — импорт отметок'(r) {
    await fresh(r)
    await r.tap('Ещё', 'меню', { exact: true })
    await r.choose('Импорт осмотренного', F.earlier, 'книга осмотренного')
    await r.waitFor('что отметить', 'Отметить осмотренными')
    await r.tap('Отметить осмотренными', 'отметить')
    await r.waitInspected('отмечен МТ-102: 1 из 12', 1)
    const e = await r.files(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/Осмотрено ранее\.txt$/)
    r.ok('«Осмотрено ранее.txt» в папке описи', e.length === 1, '', 'файл')
  },
  async 'нерабочее и ремонт — после снимков'(r) {
    await fresh(r)
    await r.tap('МТ-101', 'карточка', { exact: true })
    await r.waitFor('до снимков — нельзя', 'Нерабочее — сначала снимки')
    await r.tap('Снимать', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 1)
    r.ok('снято', await taken(r, 1), '', 'Снято: 1'); await r.p.click('.osmotr-camera .done')
    await r.waitFor('после снимка — можно', 'чип ремонт')
    await r.tap('чип ремонт', 'требуется ремонт', { exact: true })
    const lines = async name => { const f = await r.p.evaluate(n => new Promise(ok => { const q = indexedDB.open('osmotr-fs'); q.onsuccess = () => { const g = q.result.transaction('nodes').objectStore('nodes').get(n); g.onsuccess = () => ok(g.result?.x ? new TextDecoder().decode(g.result.x) : '') } }), '/Осмотры/Матрица/Механизмы и оборудование/matrix-good/' + name); return f.split('\n').map(x => x.trim()).filter(Boolean) }
    let t = Date.now(); while (Date.now() - t < 5000 && !(await lines('Требуется ремонт.txt')).includes('МТ-101')) await sleep(300)
    r.ok('«Требуется ремонт.txt» — МТ-101', (await lines('Требуется ремонт.txt')).includes('МТ-101'), await lines('Требуется ремонт.txt'), ['МТ-101'])
    await r.look('ремонт отмечен')
    r.expect('одно из двух: «нерабочее» спрятано', { lacks: ['чип нерабочее'], exact: true })
    await r.tap('чип ремонт', 'снять ремонт', { exact: true })
    await r.waitFor('снова оба', 'чип нерабочее')
    await r.tap('чип нерабочее', 'нерабочее', { exact: true })
    t = Date.now(); while (Date.now() - t < 5000 && !(await lines('Нерабочие.txt')).includes('МТ-101')) await sleep(300)
    r.ok('«Нерабочие.txt» — МТ-101', (await lines('Нерабочие.txt')).includes('МТ-101'), await lines('Нерабочие.txt'), ['МТ-101'])
    r.ok('ремонт снят', !(await lines('Требуется ремонт.txt')).includes('МТ-101'), await lines('Требуется ремонт.txt'), [])
    await r.back('в опись')
    await r.waitFor('в описи — «нерабочее»', 'нерабочее')
  },
  async 'такие же — в одну папку'(r) {
    await fresh(r)
    await r.tap('Шкаф металлический 1', 'выделить', { long: true, exact: true })
    await r.tap('Шкаф металлический 2', 'добавить к выделенным', { exact: true })
    await r.tap('Шкаф металлический 3', 'добавить к выделенным', { exact: true })
    await r.waitFor('в одну папку (3)', 'В одну папку (3)')
    await r.tap('В одну папку (3)')
    const dirs = async () => (await r.nodes()).filter(n => n.d && /^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/[^/]+ \+\d+ шт$/.test(n.p)).map(n => n.p)
    let t = Date.now(); while (Date.now() - t < 8000 && !(await dirs()).length) await sleep(300)
    const d = (await dirs())[0]
    r.ok('папка «… +2 шт»', d && d.endsWith('+2 шт'), await dirs(), '«1. МТ-101 … +2 шт»')
    r.ok('состав — «Инвентарники.txt»', (await r.files(new RegExp('^' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/Инвентарники\\.txt$'))).length === 1, '', 'файл')
    await r.waitFor('в папке «+2 шт»', 'Добавить из описи')
    await r.tap('Добавить из описи')
    await r.tap('Шкаф металлический 4', 'добавить четвёртый', { exact: true })
    await r.tap('Готово', 'готово')
    t = Date.now(); while (Date.now() - t < 8000 && !(await dirs()).some(x => x.endsWith('+3 шт'))) await sleep(300)
    r.ok('четыре в папке — «+3 шт»', (await dirs()).some(x => x.endsWith('+3 шт')), await dirs(), '«… +3 шт»')
  },
  async 'папка: переместить'(r) {
    await start(r)
    for (const name of ['Корпус Б', 'Корпус А']) {
      await r.tap('Новая папка', 'новая папка'); await r.type(name, 'имя'); await r.tap('Создать', null, { exact: true })
      await r.waitFor('в папке', 'Снимать'); if (name === 'Корпус Б') { await r.back('на главную'); await r.waitFor('главная', 'Новая опись') }
    }
    await r.tap('Новая папка', 'новая папка внутри'); await r.type('Насос', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в «Насос»', 'Насос')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Переместить папку')
    await r.waitFor('дерево в окне', 'Сюда')
    const b = r.scr.nodes.filter(n => n.matches('Корпус Б', true)).pop()
    r.ok('«Корпус Б» в дереве', b, r.scr.texts(), 'Корпус Б')
    const [x, y] = b.center(); await r.p.mouse.click(x, y); await r.look('выбрали «Корпус Б»')
    await r.tap('Сюда', null, { exact: true })
    let t = Date.now(); const moved = async () => (await r.nodes()).some(n => n.d && n.p === '/Осмотры/Корпус Б/Насос')
    while (Date.now() - t < 6000 && !(await moved())) await sleep(300)
    r.ok('перенесена', await moved() && !(await r.nodes()).some(n => n.p === '/Осмотры/Корпус А/Насос'), (await r.nodes()).filter(n => n.d).map(n => n.p), '/Осмотры/Корпус Б/Насос')
  },
  async 'снимки: выбрать, переместить, удалить'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Насос', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать')
    await r.tap('Новая папка', 'вложенная'); await r.type('До ремонта', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в «До ремонта»', 'Снимать'); await r.back('в «Насос»'); await r.waitFor('«Насос»', 'До ремонта')
    await r.tap('Снимать', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 3)
    r.ok('снято 3', await taken(r, 3), '', 'Снято: 3'); await r.p.click('.osmotr-camera .done')
    await r.waitFor('сетка', 'снимок')
    const cells = () => r.scr.nodes.filter(n => n.id === 'снимок')
    const tapNode = async (n, long) => { const [x, y] = n.center(); if (long) { await r.p.mouse.move(x, y); await r.p.mouse.down(); await sleep(800); await r.p.mouse.up() } else await r.p.mouse.click(x, y); await r.look('снимок') }
    await tapNode(cells()[0], true); await tapNode(cells()[1], false)
    await r.tap('Переместить', 'переместить выбранные')
    await r.waitFor('куда', 'Сюда')
    const d = r.scr.nodes.filter(n => n.matches('До ремонта', true)).pop(); const [x, y] = d.center(); await r.p.mouse.click(x, y); await r.look('выбрали')
    await r.tap('Сюда', null, { exact: true })
    const sub = await r.waitFiles(/^\/Осмотры\/Насос\/До ремонта\/[^/]+\.jpg$/, 2)
    r.ok('два снимка переехали', sub.length === 2 && (await r.files(/^\/Осмотры\/Насос\/[^/]+\.jpg$/)).length === 1, sub.map(f => f.p), '2 в «До ремонта», 1 на месте')
    await r.waitFor('остался один', 'снимок')
    await tapNode(cells()[0], true)
    await r.tap('Удалить', 'удалить', { exact: true })
    await r.waitFor('«Вернуть»', 'Вернуть')
    r.ok('удалён', !(await r.files(/^\/Осмотры\/Насос\/[^/]+\.jpg$/)).length, '', 0)
    await r.tap('Вернуть', null, { exact: true })
    r.ok('вернулся', (await r.waitFiles(/^\/Осмотры\/Насос\/[^/]+\.jpg$/, 1)).length === 1, '', 1)
  },
  async 'контакты: добавить и удалить'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Насос', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Контакты')
    await r.tap('Добавить', 'добавить', { exact: true })
    await r.type('Иванов Иван', 'ФИО')
    await r.tap('Готово', null, { exact: true })
    await r.waitFor('контакт в списке', 'Иванов Иван')
    const book = await r.waitFiles(/^\/Осмотры\/Насос\/Контакты\.xlsx$/, 1)
    r.ok('«Контакты.xlsx» в папке', book.length === 1, '', 'файл')
    await r.tap('Иванов Иван', 'открыть контакт')
    await r.tap('Удалить', 'удалить контакт')
    await r.waitFor('спросили', 'Удалить контакт?')
    await r.tap('Удалить', 'подтвердить', { exact: true })
    await r.waitFor('пусто', 'Контактов пока нет')
  },
  async 'выгрузка описи: всё, новое, за сегодня'(r) {
    await fresh(r)
    const shootItem = async (inv, n) => {
      const row = r.scr.nodes.find(x => x.matches(inv, true)); r.ok(`строка ${inv}`, row, r.scr.texts(), inv)
      const cam = r.scr.nodes.filter(x => x.label === 'Снять' && Math.abs((x.b[1] + x.b[3]) / 2 - (row.b[1] + row.b[3]) / 2) < 60)[0]
      r.ok(`камера ${inv}`, cam, '', 'кнопка «Снять» в строке')
      const [x, y] = cam.center(); await r.p.mouse.click(x, y)
      await camera(r, `камера ${inv}`); await shoot(r, n); r.ok('снято', await taken(r, n), '', n); await r.p.click('.osmotr-camera .done'); await r.look('после съёмки')
    }
    const archive = async (kind) => {
      await r.tap('Выгрузить опись', 'выгрузка')
      await r.waitFor('виды выгрузки', kind)
      await r.sharedMark(); await r.tap(kind, kind, { look: false })
      const [z] = await r.shared(`${kind} — наружу`); await r.look(`после «${kind}»`)
      return Object.keys(unzipSync(new Uint8Array(z.bytes))).filter(n => /\.jpg$/.test(n))
    }
    await shootItem('МТ-101', 2)
    r.ok('«Всё архивом» — 2 снимка', (await archive('Всё архивом')).length === 2, '', 2)
    await shootItem('МТ-102', 1)
    const fresh1 = await archive('Новое с прошлой выгрузки')
    r.ok('«Новое с прошлой» — только новый', fresh1.length === 1 && /МТ-102/.test(fresh1[0]), fresh1, '1 снимок МТ-102')
    r.ok('«За сегодня» — все 3', (await archive('За сегодня')).length === 3, '', 3)
  },
  async 'диагностика — наружу без личного'(r) {
    await start(r)
    // Личное в именах папок и комментарии — в диагностику попасть не должно.
    await r.tap('Новая папка', 'новая папка'); await r.type('Иванов Иван 0555123456', 'имя с личным'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Снимать'); await r.back('на главную'); await r.waitFor('главная', 'Новая опись')
    await r.tap('Ещё', 'меню', { exact: true })
    await r.tap('Диагностика', null, { exact: true })
    await r.sharedMark()
    await r.tap('Отправить', 'отправить диагностику', { exact: true, look: false })
    const [z] = await r.shared('диагностика — наружу')
    const files = unzipSync(new Uint8Array(z.bytes)); const all = Object.values(files).map(b => new TextDecoder().decode(b)).join('\n')
    r.ok('архив с журналом приложения', Object.keys(files).length >= 1 && all.length > 20, Object.keys(files), 'файлы')
    r.ok('без личного', !/Иванов|0555123456/.test(all), all.match(/.{0,40}(Иванов|0555123456).{0,40}/)?.[0], 'ни имени, ни телефона')
  },
  async 'журнал описи — подпись в браузере'(r) {
    await fresh(r)
    await r.tap('Снять', 'камера', { look: false }); await camera(r, 'камера'); await shoot(r, 1)
    r.ok('снято', await taken(r, 1), '', 1); await r.p.click('.osmotr-camera .done')
    await r.waitInspected('осмотрен', 1)
    r.ok('журнал описи — файл', (await r.files(/^\/Осмотры\/Матрица\/Механизмы и оборудование\/matrix-good\/Журнал\.jsonl$/)).length === 1, '', 'Журнал.jsonl')
    await r.tap('Выгрузить опись', 'выгрузка'); await r.waitFor('виды', 'Отчёт: всё')
    await r.sharedMark(); await r.tap('Отчёт: всё', null, { look: false })
    const [d] = await r.shared('отчёт — наружу'); const b = bookText(d.bytes)
    r.ok('в отчёте — лист «Журнал»', b.sheets.includes('Журнал'), b.sheets, 'Журнал')
    r.ok('журнал цел, подпись сходится', /Журнал цел/.test(b.text), b.text.match(/Журнал[^.]{0,80}/)?.[0], '«Журнал цел: …»')
  },
  async 'шаблоны: 23 кривые описи — xlsx и xls'(r) {
    await start(r)
    const { readdirSync } = await import('node:fs')
    const names = readdirSync(F.templates).filter(n => n.endsWith('.xlsx')).sort()
    const bad = []
    for (const n of names) for (const f of [F.templates + n, F.templates + 'xls/' + n.slice(0, -1)]) {
      await r.choose('Новая опись', f, `опись ${f.split('/').pop()}`)
      const t = Date.now(); let ok = false
      while (Date.now() - t < 15000) { await r.look('опись'); if (r.scr.texts().some(x => /^из \d+ осмотрено$/.test(x))) { ok = true; break } if (r.scr.has('Опись не добавлена') || r.scr.has('уже загружена')) break; await sleep(300) }
      if (!ok) bad.push(f.split('/').slice(-2).join('/') + ': ' + r.scr.texts().slice(0, 6).join(' | '))
      await r.back('на главную'); await r.waitFor('главная', 'Новая опись')
      // Следующая — с чистого листа: та же опись в .xls вторым файлом — «уже загружена» по имени папки.
      await r.p.evaluate(() => new Promise(ok => { const q = indexedDB.open('osmotr-fs'); q.onsuccess = () => ok() }))
    }
    r.ok('все кривые описи открываются', !bad.length, bad, '0 отказов')
  },
  async 'без сети: открывается, снимает, опись, архив'(r) {
    await start(r)
    // Приложение — в кэше (service worker), потом сети нет совсем.
    const cached = await r.p.evaluate(async () => { if (!navigator.serviceWorker) return 'нет service worker'
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(z => setTimeout(() => z(null), 30000))]); if (!reg) return 'не зарегистрирован'
      for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) await new Promise(z => setTimeout(z, 500))
      const keys = await caches.keys(); const c = keys.find(k => k.startsWith('osmotr-')); return c ? (await (await caches.open(c)).keys()).length : 'кэша нет' })
    r.ok('приложение в кэше', typeof cached === 'number' && cached >= 10, cached, '≥ 10 файлов')
    const controlled = await r.p.evaluate(() => !!navigator.serviceWorker.controller)
    r.ok('страницей управляет service worker', controlled, '', 'controller')
    // WebKit в Playwright не перезагружает страницу в режиме «без сети» («internal error») — его предел, не Safari.
    if (r.engine === 'webkit') { r.steps.push({ что: 'WebKit: перезагрузка без сети в Playwright невозможна — проверены кэш и service worker', ок: true, было: '', ждали: '' }); return }
    await r.p.context().setOffline(true)
    await r.p.reload(); await r.p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 60000 })
    await r.p.waitForSelector('.osmotr-install', { timeout: 3000 }).then(() => r.p.click('.osmotr-install button'), () => {})
    await r.waitFor('без сети — открылось', 'Новая опись')
    await r.choose('Новая опись', F.good, 'опись без сети')
    await r.waitFor('опись открылась', 'из 12 осмотрено')
    await r.tap('Снять', 'камера', { look: false }); await camera(r, 'камера без сети'); await shoot(r, 2)
    r.ok('снято без сети', await taken(r, 2), '', 'Снято: 2'); await r.p.click('.osmotr-camera .done')
    await r.waitInspected('осмотрен без сети', 1)
    await r.tap('Выгрузить опись', 'выгрузка'); await r.waitFor('виды', 'Всё архивом')
    await r.sharedMark(); await r.tap('Всё архивом', null, { look: false })
    const [z] = await r.shared('архив без сети')
    r.ok('архив без сети — два снимка', Object.keys(unzipSync(new Uint8Array(z.bytes))).filter(n => /\.jpg$/.test(n)).length === 2, '', 2)
    await r.p.context().setOffline(false)
  },
  async 'большие объёмы: 100 снимков по 2,5 МБ, архив, части'(r) {
    // Долгий — в одном сочетании на движок (телефон, стоя, светлая).
    if (r.ctx.size !== 'телефон' || r.ctx.rot || r.ctx.dark) { r.steps.push({ что: 'большие объёмы — только телефон стоя, светлая', ок: true, было: '', ждали: '' }); return }
    const big = Array.from({ length: 100 }, (_, i) => { const p = join(FIX, `BIGV_${String(i).padStart(3, '0')}.jpg`); try { readFileSync(p) } catch { const b = Buffer.alloc(2_500_000); for (let j = 0; j < b.length; j += 4) b.writeUInt32LE((j * 2654435761 + i * 40503) >>> 0, j); b[0] = 0xff; b[1] = 0xd8; b[b.length - 2] = 0xff; b[b.length - 1] = 0xd9; writeFileSync(p, b) } return p })
    const hash = b => createHash('sha256').update(b).digest('hex')
    const orig = new Set(big.map(p => hash(readFileSync(p))))
    await start(r)
    await r.tap('Новая папка', 'новая папка'); await r.type('Большая', 'имя'); await r.tap('Создать', null, { exact: true })
    await r.waitFor('в папке', 'Галерея')
    let t = Date.now()
    await r.choose('Галерея', big, '100 снимков по 2,5 МБ')
    const got = await r.waitFiles(/^\/Осмотры\/Большая\/[^/]+\.jpg$/, 100, 240000)
    r.ok('100 снимков в папке', got.length === 100, got.length, 100)
    r.steps.push({ что: `галерея: ${((Date.now() - t) / 1000).toFixed(0)} с`, ок: true, было: '', ждали: '' })
    const linear = async () => Math.round((await r.p.evaluate(() => globalThis.osmotrWeb.wasmBytes?.() ?? 0)) / 1048576)
    r.ok('память приложения после галереи ≤ 64 МБ', (await linear()) <= 64, `${await linear()} МБ`, '≤ 64 МБ')
    await r.sharedMark(); t = Date.now()
    await r.tap('Ещё', 'меню', { exact: true }); await r.tap('Отправить архивом', 'архив', { look: false })
    const [z] = await r.shared('архив на 250 МБ', 240000)
    const entries = Object.entries(unzipSync(new Uint8Array(z.bytes))).filter(([n]) => n.endsWith('.jpg'))
    r.ok('архив целый: 100 снимков байт в байт', entries.length === 100 && entries.every(([, v]) => orig.has(hash(v))), entries.length, 100)
    r.ok('память приложения после архива ≤ 64 МБ (архив — частями, не целиком)', (await linear()) <= 64, `${await linear()} МБ`, '≤ 64 МБ')
    r.steps.push({ что: `архив: ${((Date.now() - t) / 1000).toFixed(0)} с`, ок: true, было: '', ждали: '' })
    await r.look('после архива')
    await r.tap('Ещё', 'меню', { exact: true }); await r.tap('Выгрузки', 'выгрузки', { exact: true })
    await r.tap('По частям', 'по частям', { exact: true })
    await r.tap('Свой предел, МБ', 'свой предел', { exact: true }); await r.type('50', 'предел 50 МБ')
    await r.sharedMark(); await r.tap('Разбить и отправить', null, { exact: true, look: false })
    const parts = await r.shared('части по 50 МБ', 240000)
    const inParts = parts.flatMap(x => Object.entries(unzipSync(new Uint8Array(x.bytes))).filter(([n]) => n.endsWith('.jpg')))
    r.ok('части ≤ 50 МБ, вместе — все 100 снимков байт в байт', parts.length >= 5 && parts.every(x => x.size <= 50 * 1048576) && inParts.length === 100 && inParts.every(([, v]) => orig.has(hash(v))),
      { частей: parts.length, снимков: inParts.length }, '≥ 5 частей, 100 снимков')
    r.ok('память приложения после деления ≤ 64 МБ', (await linear()) <= 64, `${await linear()} МБ`, '≤ 64 МБ')
  },
  async 'ввод: быстро, в середину, замена, стирание'(r) {
    await start(r)
    await r.tap('Новая папка', 'новая папка')
    const field = async () => r.p.evaluate(() => { let t = null; const w = el => { for (const e of el.querySelectorAll('*')) { if (e.getAttribute?.('role') === 'textbox') t = e.textContent; if (e.shadowRoot) w(e.shadowRoot) } }; w(document); return t })
    const check = async (what, want) => { let v = ''; const t = Date.now(); while (Date.now() - t < 3000) { v = await field(); if (v === want) break; await sleep(150) } r.ok(what, v === want, v, want) }
    // Как клавиатура iPhone: каждая буква — вставкой текста, без пауз (за кадр — несколько).
    for (const ch of 'Корпус А Насос 12') await r.p.keyboard.insertText(ch)
    await check('быстрая вставка по букве — по порядку', 'Корпус А Насос 12')
    // Между правками — пауза человека (≥ 100 мс); быстрые серии букв — без пауз.
    await sleep(150); await r.p.keyboard.press('Home'); await sleep(150); for (const ch of '№1 ') await r.p.keyboard.insertText(ch)
    await check('в начало строки', '№1 Корпус А Насос 12')
    await sleep(150); await r.p.keyboard.press('End'); await sleep(150); await r.p.keyboard.press('Backspace'); await sleep(120); await r.p.keyboard.press('Backspace')
    await check('стирание с конца', '№1 Корпус А Насос ')
    await sleep(150); await r.p.keyboard.press('ControlOrMeta+A'); await sleep(150); for (const ch of 'Цех') await r.p.keyboard.insertText(ch)
    await check('замена выделенного', 'Цех')
    await r.p.keyboard.type(' ТЭЦ-2 щит', { delay: 5 })
    await check('нажатия клавиш вперемешку со вставкой', 'Цех ТЭЦ-2 щит')
    await r.tap('Создать', null, { exact: true })
    r.ok('папка с таким именем', (await r.nodes()).some(n => n.d && n.p === '/Осмотры/Цех ТЭЦ-2 щит'), '', '/Осмотры/Цех ТЭЦ-2 щит')
  },
  async 'большая опись: 3000 предметов, поиск'(r) {
    await start(r)
    const t0 = Date.now()
    await r.choose('Новая опись', F.big, 'большая опись')
    await r.waitFor('открылась', 'из 3000 осмотрено', { ms: 60000 })
    const loadMs = Date.now() - t0
    r.ok('загрузка ≤ 20 с', loadMs < 20000, `${loadMs} мс`, '< 20 с')
    const t1 = Date.now()
    await r.search('12345')
    await r.waitFor('нашлось', 'БГ-12345')
    r.ok('поиск ≤ 5 с', Date.now() - t1 < 5000, `${Date.now() - t1} мс`, '< 5 с (под нагрузкой прогона)')
  },
}

// ---------- Прогон ----------

/** «Поделиться» без окна системы: файлы ловятся здесь — путь iPhone (Safari), а не скачивание. */
/** Журнал событий ввода — к отчёту упавшего пути (перестановки букв ловятся только под нагрузкой). */
const INPUT_LOG = () => {
  window.__inputLog = []
  const t0 = performance.now()
  for (const t of ['keydown', 'keyup', 'beforeinput', 'input', 'compositionend'])
    addEventListener(t, e => { const l = window.__inputLog; l.push(`${(performance.now() - t0).toFixed(0)} ${t} ${e.key ?? ''} ${e.inputType ?? ''} ${JSON.stringify(e.data ?? '')} dom=${JSON.stringify((e.target?.textContent ?? '').slice(-10))}`); if (l.length > 400) l.shift() }, true)
}
const SHARE = () => {
  window.__shared = []
  navigator.canShare = () => true
  navigator.share = async d => { window.__shared.push({ title: d.title, files: d.files ?? [] }) }
}

const SIZES = { телефон: [393, 852, 3], малый: [375, 667, 2], планшет: [820, 1180, 2] }
const engines = key('--движки', 'chromium,webkit').split(',')
const sizes = key('--размеры', 'телефон,малый,планшет').split(',')
const rots = key('--ориентации', '0,1').split(',').map(Number)
const themes = key('--темы', 'light,dark').split(',')
const only = key('--пути', '')
const paths = Object.entries(PATHS).filter(([k]) => !only || only.split(',').some(o => k.includes(o)))
const runs = []

const threads = Number(key('--потоки', '1'))
const combos = []
for (const engine of engines) for (const size of sizes) for (const rot of rots) for (const theme of themes) combos.push({ engine, size, rot, theme })
const label = c => `${c.engine}, ${c.rot ? 'лёжа' : 'стоя'}, ${c.size}, ${c.theme}`
const order = combos.flatMap(c => paths.map(([name]) => `${label(c)}\u0000${name}`))
const results = new Map()

for (const engine of engines) {
  const type = { chromium, webkit }[engine]
  let browser
  try { browser = await type.launch(engine === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(BASE.startsWith('https:') ? ['--ignore-certificate-errors'] : [])] } : {}) }
  catch (e) { process.stderr.write(`${engine}: не запускается — ${String(e.message).split('\n')[0]}\n`); runs.push({ сочетание: engine, путь: '(движок)', ок: false, шаги: [{ что: 'запуск', ок: false, было: String(e.message).split('\n')[0], ждали: 'браузер' }], флаги: [] }); continue }
  // Пути независимы (своё чистое хранилище у каждого) — по [threads] сразу.
  const jobs = combos.filter(c => c.engine === engine).flatMap(c => paths.map(([name, fn]) => ({ c, name, fn })))
  let next = 0, done = 0
  const worker = async () => {
    while (next < jobs.length) {
      const { c, name, fn } = jobs[next++]
      const [w, h, scale] = SIZES[c.size]
      const context = await browser.newContext({ ignoreHTTPSErrors: BASE.startsWith('https:'),
        // Мобильный WebKit в Playwright не умеет колесо мыши, а настоящего жеста прокрутки ему не послать —
        // окно WebKit «настольное»: движок, отрисовка, ввод и хранилище те же, прокрутка в тесте — колесом.
        viewport: c.rot ? { width: h, height: w } : { width: w, height: h }, deviceScaleFactor: scale, isMobile: engine !== 'webkit', hasTouch: true,
        colorScheme: c.theme, locale: 'ru-RU', acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      })
      try { await context.grantPermissions(['camera', 'microphone'], { origin: BASE }) } catch {}
      await context.addInitScript(SHARE)
      await context.addInitScript(INPUT_LOG)
      const page = await context.newPage()
      const r = new Run(page, { rot: c.rot, size: c.size, theme: c.theme, dark: c.theme === 'dark' }, name)
      r.engine = c.engine
      let ok = true
      try { await fn(r) } catch (e) { ok = false; if (!(e instanceof Fail)) r.steps.push({ что: 'прогон', ок: false, было: String(e.stack ?? e).slice(0, 500), ждали: 'без исключений' }) }
      if (!ok) { const log = await page.evaluate(() => (window.__inputLog ?? []).slice(-80)).catch(() => []); if (log.length) r.steps.push({ что: 'журнал ввода (последние события)', ок: false, было: log.join(' ¦ '), ждали: '' }) }
      if (!ok) await page.screenshot({ path: join(FIX, `✗ ${label(c)} — ${name}.png`.replace(/[/«»]/g, '')) }).catch(() => {})
      results.set(`${label(c)}\u0000${name}`, { сочетание: label(c), путь: name, ок: ok, шаги: r.steps, флаги: r.flags })
      process.stderr.write(`  ${ok ? '✓' : '✗'} ${label(c)} · ${name}  флагов ${r.flags.length}  [${++done}/${jobs.length}]\n`)
      await context.close()
    }
  }
  await Promise.all(Array.from({ length: threads }, worker))
  await browser.close()
}
for (const k of order) if (results.has(k)) runs.push(results.get(k))

const labels = [...new Set(runs.map(r => r.сочетание))], names = [...new Set(runs.map(r => r.путь))]
const out = ['# Матрица путей PWA «Осмотра»', '', '✓ — путь прошёл, ✗ — нет; число — флаги раскладки на экранах пути (подробности ниже).', '',
  '| путь | ' + labels.join(' | ') + ' |', '|---|' + '---|'.repeat(labels.length)]
for (const n of names) out.push(`| ${n} | ` + labels.map(l => { const r = runs.find(x => x.путь === n && x.сочетание === l); return r ? (r.ок ? '✓' : '✗') + (r.флаги.length ? ' ' + r.флаги.length : '') : '' }).join(' | ') + ' |')
const bad = runs.filter(r => !r.ок)
if (bad.length) {
  out.push('', '## Не прошло', '')
  for (const r of bad) {
    out.push(`### ${r.путь} — ${r.сочетание}`)
    for (const s of r.шаги.filter(s => !s.ок)) out.push(`- ${s.что}: было \`${JSON.stringify(s.было).slice(0, 600)}\`, ждали \`${JSON.stringify(s.ждали)}\``)
    out.push('')
  }
}
const flags = new Map()
for (const r of runs) for (const f of r.флаги) { const k = f.флаг + '\u0000' + f.подробно; if (!flags.has(k)) flags.set(k, new Set()); flags.get(k).add(`${r.сочетание} · ${f.шаг}`) }
if (flags.size) {
  out.push('', '## Флаги раскладки', '', '| флаг | что | где (сочетание · шаг) |', '|---|---|---|')
  for (const [k, where] of [...flags].sort()) { const [fl, det] = k.split('\u0000'); const w = [...where].sort(); out.push(`| **${fl}** | ${det} | ${w.slice(0, 3).join('; ')}${w.length > 3 ? ` и ещё ${w.length - 3}` : ''} |`) }
}
out.push('', `Снимки экранов непрошедших путей — ${FIX}`)
const text = out.join('\n') + '\n'
const md = key('--md', '')
if (md) writeFileSync(md, text); else process.stdout.write(text)
process.stderr.write(`путей не прошло: ${bad.length}, флагов раскладки: ${flags.size}\n`)
process.exit(bad.length || flags.size ? 1 : 0)
