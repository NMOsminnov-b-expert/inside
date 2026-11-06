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
import { getType, tsName, isTsHolder } from './registry.js';
import { session } from './session.js';
import { scheduleSave } from './persist.js';
import { allResults, resultsOf } from './inspectionResults.js';
import { allCadRequests, cadRequest, cadKindLabel, nextRecDocId, changed as cadChanged, profileOf } from './inspections.js';
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
// Где объект: учреждение и адрес; у ТС адреса нет — марка и госномер (находка аудита 30.10: два скана
// по разным ТС были неотличимы).
const placeOf = (rec) => (rec ? [rec.institution, isTsHolder(rec) ? tsName(rec) : rec.address || rec.title || rec.name].filter(Boolean).join(' — ') : '');

// Ключи элементов: «осмотр» — scan|тип|ОЦ|id скана; «кадастр» — cad|id запроса|id строки.
export const scanKey = (typeId, ocId, id) => `scan|${typeId}|${ocId}|${id}`;
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
  const ids = s.inv ? (s.inv.itemIds && s.inv.itemIds.length ? s.inv.itemIds : [s.inv.itemId]) : [];
  const items = inv ? ids.map((id) => inv.items.find((x) => x.id === id)).filter(Boolean) : [];
  const item = items[0] || null;
  return {
    inv: s.inv ? { invId: s.inv.invId, itemId: s.inv.itemId, itemIds: ids, invTitle: inv ? inv.title : '',
      item: items.length > 1 ? `позиции ${items.map((x) => x.no).join(', ')} (${items.length})` : item ? `${item.no}. ${item.name} · ${item.inv}` : '' } : null,
    key: scanKey(res.typeId, res.ocId, s.id), source: s.inv ? 'опись' : 'осмотр', typeId: res.typeId, ocId: res.ocId, oiId: s.oiId || '',
    title: s.title || 'Документ с осмотра', docType: s.docType || '', by: s.by || '', at: s.at || '', pages: s.pages || [],
    state: review.state || 'wait', reason: review.reason || '', decidedBy: review.by || '', decidedAt: review.at || '', docId: review.docId || '',
    returns: s.returns || [], scanId: s.id, doc: acceptedDoc(rec, review.docId),
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
    returns: row.returns || [], doc: acceptedDoc(rec, review.docId || (row.file && row.file.docId)),
  };
}

// Документ принятого — как он сейчас в карточке (вид, название, ОИ): от них правка принятого.
function acceptedDoc(rec, docId) {
  const at = findDoc(rec, docId);
  return at ? { type: at.doc.type, name: at.doc.name, oiId: at.holder === rec ? '' : at.holder.id } : null;
}

// Плоский список очереди, новые сверху.
//   state  — 'wait' | 'accepted' | 'returned' | 'rejected' | '' (все);
//   source — 'осмотр' | 'опись' | 'кадастр' | '' (все);
//   role   — 'cod': только записи, где person — оператор ЦОД (resp.cod);
//            'rm': сканы осмотрщиков, закреплённых за регионалом person (профиль
//            осмотрщика, manager; решение пользователя 06.11.2026 «Сканы его
//            осмотрщиков»); 'all': все;
//   mine   — краткая форма: при role 'all' означает role 'cod';
//   person — по умолчанию человек из сессии.
export function scanQueue({ state = '', source = '', role = 'all', mine = false, person = '' } = {}) {
  const who = person || me();
  const onlyCod = role === 'cod' || (mine && role === 'all');
  const mineRm = (x) => [x.by, x.insp].some((n) => n && profileOf(n).manager === who);
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
    .filter((x) => (!state || x.state === state) && (!onlyCod || x.cod === who) && (role !== 'rm' || mineRm(x)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Записи, по которым у ЦОД person ждут разбора сканы, — ключи «тип|запись» (срез реестра «Ждут сканы»).
export function scanWaitObjects(person = '') {
  return new Set(scanQueue({ state: 'wait', role: 'cod', person }).filter((x) => !x.inv).map((x) => `${x.typeId}|${x.ocId}`));
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
    // Число на пункте меню и лента регионала пересчитываются по этому событию.
    cadChanged();
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
    addItemDoc(loc.scan.inv.invId, (loc.scan.inv.itemIds || []).length ? loc.scan.inv.itemIds : loc.scan.inv.itemId, doc);
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
//
// pages — номера страниц (с 1), которые надо переснять (решение пользователя 06.11.2026
// «Названные страницы + история»): пересъёмка заменит только их; пусто — все. Каждый возврат
// пишется в историю скана (returns) — её видит ЦОД при следующем разборе.
export function returnScan(key, reason, { pages = [] } = {}) {
  const why = String(reason || '').trim();
  failIf(!why, 'Укажите причину возврата');
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(stateOf(loc) !== 'wait', 'Вернуть можно только скан, ждущий разбора');
  const review = { state: 'returned', reason: why, by: me(), at: now(), docId: '' };
  const nums = [...new Set(pages.map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
  const entry = { kind: 'returned', reason: why, by: me(), at: now(), pages: nums };
  if (loc.kind === 'scan') {
    loc.scan.retake = { reason: why, by: me(), at: now(), pages: nums };
    loc.scan.returns = [...(loc.scan.returns || []), entry];
    setReview(loc, review);
  } else {
    backToWait(loc, review, `Возвращено ЦОД: ${why}`, entry);
  }
  return true;
}

// Строка кадастра снова ждёт ответа осмотрщика: прежний ответ — в review (история),
// причина — в примечании строки (его видят осмотрщик и регионал в строке запроса).
function backToWait(loc, review, note, entry) {
  const row = loc.row;
  review.pages = cadPages(row);
  const prev = String(row.note || '').replace(/^(Возвращено|Отклонено) ЦОД: [^·]*(?: · )?/, '');
  row.note = `${note}${prev ? ' · ' + prev : ''}`;
  row.returns = [...(row.returns || []), entry];
  Object.assign(row, { result: '', scanDate: '', answer: '' });
  delete row.file;
  setReview(loc, review);
}

// Отклонить: причина обязательна; повторного съёмки не требует.
export function rejectScan(key, reason) {
  const why = String(reason || '').trim();
  failIf(!why, 'Укажите причину отклонения');
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(stateOf(loc) !== 'wait', 'Отклонить можно только скан, ждущий разбора');
  const review = { state: 'rejected', reason: why, by: me(), at: now(), docId: '' };
  // Ответ кадастра (решение пользователя 06.11.2026 «Снова «Ждёт» + причина»): строка
  // возвращается осмотрщику ждущей, причина отклонения видна ему и регионалу.
  if (loc.kind === 'cad') backToWait(loc, review, `Отклонено ЦОД: ${why}`, { kind: 'rejected', reason: why, by: me(), at: now(), pages: [] });
  else setReview(loc, review);
  return true;
}

// Документ принятого скана в записи: у ОЦ или у одного из ОИ.
function findDoc(rec, docId) {
  if (!rec || !docId) return null;
  for (const h of [rec, ...(rec.oi || [])]) {
    const i = (h.docs || []).findIndex((d) => d.id === docId);
    if (i >= 0) return { holder: h, i, doc: h.docs[i] };
  }
  return null;
}

// Правка принятого (решение пользователя 06.11.2026 на «Отмена решения по скану»: отмена не
// нужна, нужна «Правка вида и ОИ принятого»): вид, название и к чему относится — документ
// переносится между ОЦ и его ОИ; правка пишется в историю скана.
export function editAccepted(key, { docType = '', oiId = '', title = '' } = {}) {
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(stateOf(loc) !== 'accepted', 'Править можно только принятый скан');
  failIf(loc.kind === 'scan' && loc.scan.inv, 'Документ позиции описи правится в описи');
  const review = loc.kind === 'scan' ? loc.scan.review : loc.row.review;
  const docId = (review && review.docId) || (loc.kind === 'cad' && loc.row.file && loc.row.file.docId) || '';
  const typeId = loc.kind === 'scan' ? loc.typeId : loc.row.typeId;
  const ocId = loc.kind === 'scan' ? loc.ocId : loc.row.ocId;
  const rec = recOf(typeId, ocId);
  const at = findDoc(rec, docId);
  failIf(!at, 'Документ у объекта не найден — его могли удалить из карточки');
  const target = oiId ? (rec.oi || []).find((o) => o.id === oiId) : rec;
  failIf(!target, 'ОИ записи не найден');
  const was = { type: at.doc.type, name: at.doc.name, oi: at.holder === rec ? '' : at.holder.id };
  if (docType) at.doc.type = docType;
  if (title.trim()) at.doc.name = title.trim();
  if (target !== at.holder) {
    at.holder.docs.splice(at.i, 1);
    target.docs = target.docs || [];
    target.docs.push(at.doc);
  }
  const text = [was.type !== at.doc.type ? `вид: ${was.type} → ${at.doc.type}` : '', was.name !== at.doc.name ? `название: ${was.name} → ${at.doc.name}` : '',
    was.oi !== (oiId || '') ? 'перенесён к другому ОИ' : ''].filter(Boolean).join('; ');
  const entry = { kind: 'edited', reason: text || 'без изменений', by: me(), at: now(), pages: [] };
  if (loc.kind === 'scan') loc.scan.returns = [...(loc.scan.returns || []), entry];
  else loc.row.returns = [...(loc.row.returns || []), entry];
  if (review) review.oiId = oiId || '';
  rec.updatedAt = now();
  scheduleSave();
  cadChanged();
  return at.doc;
}

// Перенос скана к другому объекту (решение пользователя 06.11.2026 «Перенос к другому
// объекту»: поиском по ЕНИ или адресу, к записи или её ОИ). Только ждущий разбора скан
// осмотра: ответ кадастра привязан к строке запроса, скан описи — к позиции. Возвращает
// новый ключ очереди.
export function moveScan(key, { typeId, ocId, oiId = '' }) {
  const loc = locate(key);
  failIf(!loc, 'Элемент очереди не найден');
  failIf(loc.kind !== 'scan', 'Ответ кадастра переносится правкой запроса');
  failIf(loc.scan.inv, 'Скан описи относится к позиции описи');
  failIf(stateOf(loc) !== 'wait', 'Перенести можно только скан, ждущий разбора');
  failIf(loc.typeId === typeId && loc.ocId === ocId && (loc.scan.oiId || '') === oiId, 'Скан уже у этого объекта');
  const rec = recOf(typeId, ocId);
  failIf(!rec, 'Запись объекта оценки не найдена');
  failIf(oiId && !(rec.oi || []).some((o) => o.id === oiId), 'ОИ записи не найден');
  const from = resultsOf(loc.typeId, loc.ocId);
  const scan = loc.scan;
  from.scans = from.scans.filter((x) => x !== scan);
  const was = recOf(loc.typeId, loc.ocId);
  scan.returns = [...(scan.returns || []), { kind: 'moved', reason: `перенесён от объекта ${(was && was.eni) || placeOf(was) || loc.ocId}`, by: me(), at: now(), pages: [] }];
  scan.oiId = oiId;
  const to = resultsOf(typeId, ocId);
  if (!Array.isArray(to.scans)) to.scans = [];
  to.scans.push(scan);
  scheduleSave();
  cadChanged();
  return scanKey(typeId, ocId, scan.id);
}

// Пометка «Переснять» для экрана осмотрщика: незакрытые возвраты осмотрщика
// (scan.retake есть, а нового скана по тому же названию и ОИ после возврата нет).
export function retakesOf(typeId, ocId) {
  const list = resultsOf(typeId, ocId).scans || [];
  return list.filter((s) => s.retake && !list.some((n) => n !== s && n.title === s.title && (n.oiId || '') === (s.oiId || '') && String(n.at) > String(s.retake.at)));
}
