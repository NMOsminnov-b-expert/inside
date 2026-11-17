// Инструкции по осмотрам — как в приложении «Осмотр» (core/Instructions.kt, ui/InstructionsScreen.kt): список по
// группам, поиск по тексту всех инструкций, документ — разделы полосой оглавления, текст с жирным и курсивом на
// местах, фото и памятки, страницы бланка, исходный файл для организации.
//
// Инструкции — документы компании, в git не кладутся: лежат в data/local/instructions (кладёт
// tools/osmotr/instructions.py из репозитория приложения). Нет папки — экран говорит, что инструкций на устройстве нет.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: инструкции отдаёт сервер (раздел справки), с правами на чтение у осмотрщиков.

const BASE = './data/local/instructions/';
let index = null;        // [{ id, title, group }] | false — нет на устройстве
let loading = null;
const docs = new Map();  // id → doc.json

export const instrUrl = (id, file) => BASE + encodeURIComponent(id) + '/' + encodeURIComponent(file);

// Оглавление; done — вызвать, когда загрузится (для перерисовки).
export function instrIndex(done) {
  if (index !== null) return index;
  if (!loading) {
    loading = fetch(BASE + 'index.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : false), () => false)
      .then((x) => { index = Array.isArray(x) ? x : false; loading = null; if (done) done(); });
  }
  return null;
}

// Документ; null — ещё грузится (done вызовется), false — нет.
export function instrDoc(id, done) {
  if (docs.has(id)) return docs.get(id);
  docs.set(id, null);
  fetch(instrUrl(id, 'doc.json'), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : false), () => false)
    .then((x) => { docs.set(id, x || false); if (done) done(); });
  return null;
}

const text = (runs) => (runs || []).map((r) => r[0]).join('');
export const fold = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
export function blockText(b) {
  if (b.k === 'img') return [...(b.items || []).map((i) => text(i.cap)), text(b.cap)].filter((x) => x.trim()).join(' · ');
  return text(b.runs);
}
// Разделы — заголовки второго уровня (полоса оглавления над текстом).
export const sectionsOf = (d) => (d.blocks || []).map((b, i) => (b.k === 'h' && b.lvl === 2 ? { title: text(b.runs), block: i } : null)).filter(Boolean);

// Поиск: каждое слово запроса — в одном блоке; сначала заголовки. Как Instructions.search приложения.
export function searchInstr(list, query) {
  const words = fold(query).split(/[\s,.]+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  list.forEach((d) => {
    if (!d) return;
    if ((d.pages || []).length && words.every((w) => fold(d.title).includes(w))) { hits.push({ head: true, doc: d, block: -1, section: '', snippet: d.title }); return; }
    let section = '';
    (d.blocks || []).forEach((b, i) => {
      if (b.k === 'h' && b.lvl === 2) section = text(b.runs);
      const t = blockText(b);
      const f = fold(t);
      if (words.every((w) => f.includes(w))) hits.push({ head: b.k === 'h', doc: d, block: i, section, snippet: snippet(t, f, words[0]) });
    });
  });
  return hits.sort((a, b) => b.head - a.head);
}
function snippet(t, f, w, around = 60) {
  const at = Math.max(0, f.indexOf(w));
  const from = Math.max(0, at - around);
  const to = Math.min(t.length, at + w.length + around);
  return (from > 0 ? '…' : '') + t.slice(from, to) + (to < t.length ? '…' : '');
}

// Все документы (для поиска); done — когда догрузятся.
export function allDocs(done) {
  const list = index || [];
  let wait = 0;
  const out = list.map((e) => { const d = instrDoc(e.id, () => { wait -= 1; if (!wait && done) done(); }); if (d === null) wait += 1; return d; });
  return wait ? null : out;
}

// Подсказка к месту — как Instructions.forPlace / forItem приложения: какая инструкция подходит.
const MATCH = [
  ['ibp', ['ибп', 'бесперебойн', 'ups']],
  ['spectehnika', ['экскаватор', 'бульдозер', 'погрузчик', 'автокран', 'трактор', 'грейдер', 'каток', 'спецтехник', 'кран']],
  ['avto', ['автомобил', 'автобус', 'микроавтобус', 'грузовик', 'легков', 'прицеп']],
  ['ofis', ['принтер', 'мфу', 'копир', 'сканер', 'проектор', 'телевизор', 'факс', 'шредер', 'оргтехник']],
  ['pk', ['компьютер', 'ноутбук', 'моноблок', 'системный блок', 'пэвм', 'эвм', 'пк', 'монитор']],
  ['yacheiki', ['ячейк', 'кру', 'крун', 'ксо', 'камера сборн']],
  ['transformator', ['трансформатор', 'ктп', 'тмг', 'тмз']],
  ['nasosy', ['насос', 'электродвигател', 'двигател']],
  ['inzhenernye', ['вентиляц', 'вентилятор', 'кондиционер', 'сплит', 'котел', 'котельн', 'чиллер', 'теплообменник', 'калорифер', 'отоплен', 'водоснабжен', 'канализац', 'пожаротушен', 'итп']],
  ['tehnologicheskoe', ['станок', 'линия', 'линии', 'пресс', 'конвейер', 'дробил', 'мельниц', 'фасов', 'розлив', 'упаков', 'технологическ']],
];
export function instrForItem(name) {
  const words = fold(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const f = ' ' + words.join(' ') + ' ';
  const m = MATCH.find(([, keys]) => keys.some((k) => (k.length <= 4 && !k.includes(' ') ? words.includes(k) : f.includes(' ' + k))));
  return m ? m[0] : null;
}
// form — вид формы ОИ (building, land, vehicle); objKind — вид объекта из полей осмотра (params.js OBJ_KIND).
export function instrForPlace(form, values = {}, houseOnObject = false) {
  if (form === 'vehicle') return ['avto', 'spectehnika'];
  if (form === 'land') return ['uchastok'];
  const k = values.objKind || '';
  if (/кварт/i.test(k)) return ['kvartira'];
  if (/жил/i.test(k) && /дом/i.test(k)) return ['dom'];
  if (/здан/i.test(k)) return values.buildType === 'Встроенное' ? ['vstroennoe', 'otdelnoe'] : ['otdelnoe', 'baza', 'nezavershenka', 'vstroennoe'];
  if (/вспомог/i.test(k)) return houseOnObject ? ['dom', 'baza'] : ['baza', 'dom'];
  if (/прочее|строение|сооруж/i.test(k)) return ['baza', 'nezavershenka'];
  return [];
}
