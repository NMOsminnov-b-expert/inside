// Очередь «Сканы с осмотров»: то, что осмотрщик снял на месте и что ответили на
// запросы кадастра, не становится документом записи, пока ЦОД не разберёт
// (решение пользователя 16.10.2026 «документы, отсканированные осмотрщиком
// помечаются, как с осмотра и их должен удостоверить и обработать ЦОД»;
// устройство — запись графа osmotr-opisey-i-skany-ustroystvo-etapov-b-v,
// пункты В2 и В3, решение 27.10.2026).
//
// Два источника в одном списке:
//   * «осмотр»  — сканы осмотров: resultsOf(...).scans (inspectionResults.js);
//   * «кадастр» — строки запросов в кадастр с ответом «Получен» (inspections.js).
// Состояния: wait «Ждёт разбора», accepted «Принято», returned «Возвращено»,
// rejected «Отклонено». Отметка разбора лежит в самом источнике, отдельного
// хранилища нет: у скана — scan.review, у строки запроса — row.review
// ({ state, reason, by, at, docId }); нет отметки — ждёт разбора. У строки
// запроса, документ которой попал к записи прежним путём (row.file.docId без
// review), состояние — «Принято».
//
// Ядро не знает типов ОЦ и видов ОИ: запись берётся через kernel/registry.js,
// документ кладётся в rec.docs или oi.docs записи.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: разбор — действие ЦОД с правом на запись и журналом
// (кто, когда, что решил); здесь любой пользователь макета может принять,
// вернуть и отклонить любой скан. Развилка — кому из ролей разрешён разбор
// (оператор ЦОД записи; регионал «обычно разбирает он», решение В2).
import { getType } from './registry.js';
import { session } from './session.js';
import { scheduleSave } from './persist.js';
import { allResults, resultsOf } from './inspectionResults.js';
import { allCadRequests, cadRequest, cadKindLabel, nextRecDocId, changed as cadChanged } from './inspections.js';
import { inventoryById, addItemDoc } from './inventories.js';
import { allNodes, staffOf } from './institutions.js';

export const SCAN_SOURCES = [
  { key: 'осмотр', label: 'Осмотр' },
  { key: 'опись', label: 'Опись' },
  { key: 'кадастр', label: 'Кадастр' },
];
export const SCAN_STATES = [
  { key: 'wait', label: 'Ждёт разбора' },
  { key: 'accepted', label: 'Принято' },
  { key: 'returned', label: 'Возвращено' },
  { key: 'rejected', label: 'Отклонено' },
];
export const scanStateLabel = (k) => (SCAN_STATES.find((x) => x.key === k) || { label: k }).label;

const now = () => new Date().toISOString();
const me = () => session.state.person;

const recOf = (typeId, ocId) => {
  const t = typeId ? getType(typeId) : null;
  return t && t.records.loadRecord ? t.records.loadRecord(ocId) : null;
};
const placeOf = (rec) => (rec ? [rec.institution, rec.address || rec.title || rec.name].filter(Boolean).join(' — ') : '');

// Ключи элементов: «осмотр» — scan|тип|ОЦ|id скана; «кадастр» — cad|id запроса|id строки.
const scanKey = (typeId, ocId, id) => `scan|${typeId}|${ocId}|${id}`;
const cadKey = (reqId, rowId) => `cad|${reqId}|${rowId}`;

// Страницы строки кадастра: один файл ответа (PDF или картинка).
function cadPages(row) {
  const f = row.file && row.file.attached;
  if (!f) return [];
  return [{ id: `${row.id}-p1`, name: f.name, size: f.size, type: f.mime || '', dataUrl: f.dataUrl, localKey: f.localKey }];
}

// Скан по позиции описи (В13): оператор ЦОД — того подведа, чья опись
// (В11 «Ответственный за подвед - оператор ЦОД»); после приёма — документ
// позиции описи (kernel/inventories.js).
function invCod(inv) {
  if (!inv) return '';
  const node = allNodes().find((n) => n.name === (inv.podved || inv.institution));
  const st = node ? staffOf(node).cod : null;
  return st ? st.name : '';
}
function scanItem(res, s, cache) {
  const review = s.review || {};
  const rec = cache(res.typeId, res.ocId);
  const inv = s.inv ? inventoryById(s.inv.invId) : null;
  const item = inv ? inv.items.find((x) => x.id === s.inv.itemId) : null;
  return {
    inv: s.inv ? { invId: s.inv.invId, itemId: s.inv.itemId, invTitle: inv ? inv.title : '', item: item ? `${item.no}. ${item.name} · ${item.inv}` : '' } : null,
    key: scanKey(res.typeId, res.ocId, s.id), source: s.inv ? 'опись' : 'осмотр', typeId: res.typeId, ocId: res.ocId, oiId: s.oiId || '',
    title: s.title || 'Документ с осмотра', docType: s.docType || '', by: s.by || '', at: s.at || '', pages: s.pages || [],
    state: review.state || 'wait', reason: review.reason || '', decidedBy: review.by || '', decidedAt: review.at || '', docId: review.docId || '',
    cod: s.inv ? invCod(inv) || (rec && rec.resp ? rec.resp.cod || '' : '') : rec && rec.resp ? rec.resp.cod || '' : '', insp: rec && rec.resp ? rec.resp.insp || '' : '',
    place: s.inv && inv ? [inv.institution, inv.podved].filter(Boolean).join(' — ') : placeOf(rec), eni: rec ? rec.eni || '' : '',
  };
}

function cadItem(req, row, cache) {
  const rec = cache(row.typeId, row.ocId);
  const review = row.review || {};
  const state = review.state || (row.file && row.file.docId ? 'accepted' : 'wait');
  return {
    key: cadKey(req.id, row.id), source: 'кадастр', typeId: row.typeId, ocId: row.ocId, oiId: '',
    title: row.doc || 'Ответ кадастра', by: row.answeredBy || req.person || '', at: row.answeredAt || '',
    pages: review.pages || cadPages(row), state, reason: review.reason || '',
    decidedBy: review.by || '', decidedAt: review.at || '', docId: review.docId || (row.file && row.file.docId) || '',
    cod: rec && rec.resp ? rec.resp.cod || '' : '', insp: req.person || '',
    place: placeOf(rec) || row.inst || '', eni: row.eni || (rec && rec.eni) || '',
    // К вопросу: дата сканирования и комментарий ответа — для экрана разбора.
    scanDate: row.scanDate || '', answer: row.answer || '', request: `${cadKindLabel(req.kind)} № ${req.no}`,
  };
}

// Плоский список очереди, новые сверху.
//   state  — 'wait' | 'accepted' | 'returned' | 'rejected' | '' (все);
//   source — 'осмотр' | 'опись' | 'кадастр' | '' (все);
//   role   — 'cod': только записи, где person — оператор ЦОД (resp.cod);
//            'regional' и 'all': все. ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: у записи нет поля
//            регионального менеджера, поэтому «мне» у регионала пока равно «все»;
//            на сервере — записи его региона/подведов;
//   mine   — краткая форма: при role 'all' означает role 'cod';
//   person — по умолчанию человек из сессии.
export function scanQueue({ state = '', source = '', role = 'all', mine = false, person = '' } = {}) {
  const who = person || me();
  const onlyCod = role === 'cod' || (mine && role === 'all');
  const recs = new Map();
  const cache = (typeId, ocId) => {
    const k = `${typeId}|${ocId}`;
    if (!recs.has(k)) recs.set(k, recOf(typeId, ocId));
    return recs.get(k);
  };
  const items = [];
  if (!source || source === 'осмотр' || source === 'опись') {
    allResults().forEach((res) => (res.scans || []).forEach((s) => {
      const x = scanItem(res, s, cache);
      if (!source || x.source === source) items.push(x);
    }));
  }
  if (!source || source === 'кадастр') {
    allCadRequests().forEach((req) => req.rows.forEach((row) => {
      // В очереди — полученные ответы и возвращённые строки (след возврата).
      if (row.result === 'got' || row.review) items.push(cadItem(req, row, cache));
    }));
  }
  return items
    .filter((x) => (!state || x.state === state) && (!onlyCod || x.cod === who))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Числа для вкладок: { wait, accepted, returned, rejected, all }.
export function scanCounts({ role = 'all', person = '', source = '' } = {}) {
  const t = { wait: 0, accepted: 0, returned: 0, rejected: 0, all: 0 };
  scanQueue({ role, person, source }).forEach((x) => { t[x.state]++; t.all++; });
  return t;
}

// Ссылка на источник элемента: { kind:'scan', res, scan } | { kind:'cad', req, row }.
function locate(key) {
  const p = String(key).split('|');
  if (p[0] === 'scan') {
    const [, typeId, ocId, id] = p;
    const res = resultsOf(typeId, ocId);
    const scan = (res.scans || []).find((x) => x.id === id);
    return scan ? { kind: 'scan', typeId, ocId, scan } : null;
  }
  if (p[0] === 'cad') {
    const req = cadRequest(p[1]);
    const row = req && req.rows.find((x) => x.id === p[2]);
    return row ? { kind: 'cad', req, row } : null;
  }
  return null;
}

const stateOf = (loc) => (loc.kind === 'scan'
  ? (loc.scan.review ? loc.scan.review.state : 'wait')
  : (loc.row.review ? loc.row.review.state : (loc.row.file && loc.row.file.docId ? 'accepted' : 'wait')));

function setReview(loc, review) {
  if (loc.kind === 'scan') {
    loc.scan.review = review;
    // Прежнее поле статуса (его показывает экран осмотрщика) держим в согласии.
    loc.scan.status = { accepted: 'принят', returned: 'возвращён', rejected: 'отклонён' }[review.state] || loc.scan.status;
    scheduleSave();
  } else {
    loc.row.review = review;
    cadChanged();
  }
}

const failIf = (cond, text) => { if (cond) throw new Error(text); };

// Описание файла документа записи из страниц скана. Модель документа — один
// файл: у документа из нескольких страниц-картинок файлом служит первая, все
// страницы — в d.scanPages; просмотрщик показывает каждую своим листом (kernel/fileUpload.js, ensureDocPages).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: многостраничный скан — один PDF, собранный сервером из
// страниц; тогда d.scanPages не нужен.
const fileKind = (t) => ((t || '').startsWith('image/') ? 'image' : t === 'application/pdf' ? 'pdf' : 'other');
function docFileFrom(pages) {
  const p = pages[0];
  if (!p) return null;
  const f = { name: p.name, mime: p.type || '', kind: fileKind(p.type), dataUrl: p.dataUrl, size: p.size };
  if (p.localKey) f.localKey = p.localKey;
  return f;
}

// Принять: у записи (oiId пуст — у ОЦ, иначе у ОИ) появляется документ с
// источником «осмотр» / «кадастр» и статусом «Загружен». Возвращает документ.
// Повторно принять нельзя; принять можно только ждущий разбора.
export function acceptScan(key, { docType = '', oiId = '', title = '' } = {}) {
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(stateOf(loc) === 'accepted', 'Скан уже принят');
  failIf(stateOf(loc) !== 'wait', 'Принять можно только скан, ждущий разбора');
  const typeId = loc.kind === 'scan' ? loc.typeId : loc.row.typeId;
  const ocId = loc.kind === 'scan' ? loc.ocId : loc.row.ocId;
  const rec = recOf(typeId, ocId);
  failIf(!rec, 'Запись объекта оценки не найдена');
  let target = rec;
  if (oiId) {
    target = (rec.oi || []).find((o) => o.id === oiId);
    failIf(!target, 'ОИ записи не найден');
  }
  failIf(loc.kind === 'cad' && !loc.row.file, 'У ответа нет файла');
  const pages = loc.kind === 'scan' ? loc.scan.pages : cadPages(loc.row);
  const base = loc.kind === 'scan' ? loc.scan.title : loc.row.doc;
  const attached = loc.kind === 'cad' ? loc.row.file.attached : null;
  const doc = {
    id: nextRecDocId(rec), type: docType || (loc.kind === 'cad' ? loc.row.doc : '') || 'Прочее',
    name: (title || '').trim() || base || 'Документ с осмотра',
    date: loc.kind === 'cad' && loc.row.scanDate ? loc.row.scanDate : now().slice(0, 10),
    file: attached || docFileFrom(pages), pages: null, status: 'Загружен',
    source: loc.kind === 'scan' ? 'осмотр' : 'кадастр',
    from: loc.kind === 'scan' ? `скан осмотра, ${loc.scan.by || ''}`.replace(/, $/, '') : `${cadKindLabel(loc.req.kind)} № ${loc.req.no}`,
  };
  if (!attached && pages.length > 1) doc.scanPages = pages.map((p) => ({ ...p }));
  // Скан по позиции описи — документ позиции, а не записи ОЦ (В13).
  if (loc.kind === 'scan' && loc.scan.inv) {
    doc.source = 'опись';
    doc.from = `скан описи, ${loc.scan.by || ''}`.replace(/, $/, '');
    addItemDoc(loc.scan.inv.invId, loc.scan.inv.itemId, doc);
    setReview(loc, { state: 'accepted', reason: '', by: me(), at: now(), docId: doc.id, oiId: '' });
    scheduleSave();
    return doc;
  }
  target.docs = target.docs || [];
  target.docs.push(doc);
  setReview(loc, { state: 'accepted', reason: '', by: me(), at: now(), docId: doc.id, oiId: oiId || '' });
  if (loc.kind === 'cad') loc.row.file.docId = doc.id;
  scheduleSave();
  return doc;
}

// Вернуть на пересъёмку: причина обязательна. У скана осмотра — scan.retake =
// { reason, by, at }, по ней экран осмотрщика покажет «Переснять: <причина>».
// У строки кадастра — снова ждёт ответа: result '', причина в note, страницы
// прежнего ответа остаются в review для истории.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: осмотрщику уходит уведомление (задача «Переснять» в
// его плане дня); здесь он увидит пометку только при открытии экрана.
export function returnScan(key, reason) {
  const why = String(reason || '').trim();
  failIf(!why, 'Укажите причину возврата');
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(stateOf(loc) !== 'wait', 'Вернуть можно только скан, ждущий разбора');
  const review = { state: 'returned', reason: why, by: me(), at: now(), docId: '' };
  if (loc.kind === 'scan') {
    loc.scan.retake = { reason: why, by: me(), at: now() };
    setReview(loc, review);
  } else {
    const row = loc.row;
    review.pages = cadPages(row);
    const prev = String(row.note || '').replace(/^Возвращено ЦОД: [^·]*(?: · )?/, '');
    row.note = `Возвращено ЦОД: ${why}${prev ? ' · ' + prev : ''}`;
    Object.assign(row, { result: '', scanDate: '', answer: '' });
    delete row.file;
    setReview(loc, review);
  }
  return true;
}

// Отклонить: причина обязательна; повторного съёмки не требует.
export function rejectScan(key, reason) {
  const why = String(reason || '').trim();
  failIf(!why, 'Укажите причину отклонения');
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(stateOf(loc) !== 'wait', 'Отклонить можно только скан, ждущий разбора');
  setReview(loc, { state: 'rejected', reason: why, by: me(), at: now(), docId: '' });
  return true;
}

// Пометка «Переснять» для экрана осмотрщика: незакрытые возвраты осмотрщика
// (scan.retake есть, а нового скана по тому же названию и ОИ после возврата нет).
export function retakesOf(typeId, ocId) {
  const list = resultsOf(typeId, ocId).scans || [];
  return list.filter((s) => s.retake && !list.some((n) => n !== s && n.title === s.title && (n.oiId || '') === (s.oiId || '') && String(n.at) > String(s.retake.at)));
}
