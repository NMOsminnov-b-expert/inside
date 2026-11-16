// Мост E•state ↔ приложение «Осмотр» (PWA в рамке страницы осмотрщиков).
//
// Решения пользователя 03.11.2026 (граф: integraciya-prilozheniya-osmotr-s-e-state-…):
// учётная запись — E•state; в приложении только назначенные объекты; есть
// связь — отправка по мере съёмки, нет — копится и уходит позже.
//
// Обмен — сообщениями между окнами (postMessage), только со своей рамкой:
//   приложение → E•state  { osmotr: 1, id, t, body } (+ blob — файл)
//   E•state → приложение  { osmotr: 1, re: id, ok, body, blob, error }
//                         { osmotr: 1, t: 'changed' } — назначения поменялись
// Запросы: hello — кто вошёл; assignments — назначенные объекты со всем, что
// нужно на выезде; doc — файл документа; send — файл из папки объекта (снимок,
// значения формы, голос, PDF) в «Результаты осмотра»; finish — «Осмотр
// закончен»; exit — назад в систему.
//
// Объект приложения — объект оценки целиком: назначения одного осмотрщика на
// один ОЦ (бывает несколько — по разным ОИ) сводятся в один объект.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: те же запросы — HTTP API сервера с входом по учётной
// записи (токен), а не сообщения окну макета; файлы — в хранилище сервера.
// Приложение вне рамки (на телефоне) ходит на сервер напрямую.
import { session, roleLabel } from '../../kernel/session.js';
import { assignmentsOfPerson, startWork, finishWork, myAssignsOn, logEvent, changed, isLive, eventsOf, planOf, absenceOn, absenceLabel, takeForDay, requestMove, skipReasons, reportOf, saveReport, lateWorkdays, LATE_REPORT_WORKDAYS, workdayOf, allCadRequests, cadKindLabel, answerCadRow, cadResultLabel } from '../../kernel/inspections.js';
import { fmtEni } from '../../kernel/fmt.js';
import { osrmKm, dayPoints } from '../inspections/route.js';
import { resultsOf, saveResults, valuesOf, addResultPhoto, addResultScan } from '../../kernel/inspectionResults.js';
import { markItem, markOf, addItemPhoto } from '../../kernel/inventories.js';
import { xlsxBytes } from '../../kernel/xlsx.js';
import { getValue, setValue } from '../../kernel/fieldSchema.js';
import { loadTask, ownOis } from '../inspection/tasks.js';
import { applyEntries, markDeleted } from '../inspection/archiveImport.js';
import { clean, MACHINES, isoDay, titleOf, inventoriesOf, fillGeo, myObjects, docsOf, findObject, onGeoDone } from './data.js';
import { feedOf } from './feed.js';

const SOURCE = 'приложение «Осмотр»';
const INSPECTING = new Set(['insp', 'any', 'admin']);

// --- Опись: обмен с приложением (решение пользователя 03.11.2026: «Обмен с системой») ---
//
// Описи объекта — приложенные регионалом к назначениям (kernel/inventories.js) и единицы механизмов-ОИ (в том
// числе механизмы-ОЦ). В приложение — книгой Excel (запрос «inventory»), приложение заводит её своей описью в
// «Механизмах и оборудовании/<опись>». Обратно — файлами этой папки:
//   «Нерабочие.txt», «Требуется ремонт.txt», «Осмотрено ранее.txt» — инвентарники построчно → состояние позиции;
//   снимок в папке предмета (body.items — инвентарники из «Инвентарники.txt» папки) → снимок позиции, «осмотрено».
// У описи учреждения — отметки описи (markItem, addItemPhoto); у механизмов-ОИ — поля формы осмотра единиц
// (u.<id>.found / state).
const MARK_FILES = { 'Нерабочие.txt': 'Нерабочее', 'Требуется ремонт.txt': 'В ремонте', 'Осмотрено ранее.txt': '' };
const invKey = (s) => String(s || '').toUpperCase().replace(/[\s\-–—.]/g, '');

// Позиция по инвентарнику из приложения: инвентарный номер или «№N» (у позиции без номера).
function itemOf(inv, key) {
  const k = String(key || '').trim();
  if (/^№\s*\d+$/.test(k)) return inv.items.find((it) => String(it.no) === k.replace(/\D/g, ''));
  return inv.items.find((it) => it.inv && invKey(it.inv) === invKey(k));
}

async function inventoryBook(inv) {
  // «Отдел» и «Осматривает» — в конце: приложение узнаёт столбцы по заголовкам, прежние остаются на местах.
  const head = ['№', 'Инв. номер', 'Наименование', 'Место', 'Кол-во', 'Первонач. стоимость, сом', 'Балансовая стоимость, сом', 'Приоритет', 'Список', 'Отдел', 'Осматривает'];
  const rows = inv.items.map((it) => [it.no, it.inv, it.name, it.place, it.qty, it.cost, it.balance, it.priority, it.list, it.dept || '', it.own ? 'вы' : it.who]);
  return new Blob([await xlsxBytes([{ name: 'Опись', head, rows }])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Файл из «Механизмов и оборудования» → отметки описи. Итог — как у applyEntries: принят ли и почему.
async function applyInventory({ typeId, ocId, rec, list, person, assignId }, rel, blob, items) {
  const parts = rel.split('/');
  const inv = inventoriesOf(rec, list, ownOis(rec)).find((x) => rel.startsWith(x.folder + '/'));
  if (!inv) return { taken: false, why: 'опись не из назначения' };
  const inner = parts.slice(inv.folder.split('/').length);
  const name = inner[inner.length - 1];
  const vals = inv.kind === 'mech' ? valuesOf(typeId, ocId, inv.oiId) : null;
  const mark = (it, patch) => {
    // Чужая позиция (другая часть описи) — только для чтения: отметку не принимаем.
    if (it.own === false) return;
    if (vals) {
      if (patch.state === 'seen') setValue(vals, `u.${it.id}.found`, 'Найдено');
      if (patch.cond !== undefined) setValue(vals, `u.${it.id}.state`, patch.cond);
    } else {
      const cur = markOf(inv.id, it.id) || {};
      markItem(inv.id, it.id, { ...patch, state: patch.state || cur.state || 'seen' }, { by: person, assignId });
    }
  };
  if (inner.length === 1 && name in MARK_FILES) {
    const listed = (await blob.text()).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((k) => itemOf(inv, k)).filter(Boolean);
    const cond = MARK_FILES[name];
    listed.forEach((it) => mark(it, cond ? { cond, app: name } : { state: 'seen', comment: 'осмотрено ранее' }));
    // Снятые в приложении отметки — снимаются и здесь (только те, что ставило приложение этим файлом).
    if (cond) inv.items.filter((it) => !listed.includes(it) && it.own !== false).forEach((it) => {
      if (vals) { if ((getValue(vals, `u.${it.id}.state`) || '') === cond) setValue(vals, `u.${it.id}.state`, ''); }
      else { const m = markOf(inv.id, it.id); if (m && m.app === name && m.cond === cond) markItem(inv.id, it.id, { cond: '', app: '' }, { by: person, assignId }); }
    });
    saveResults(); changed();
    return { taken: true, why: '' };
  }
  // Комментарий папки предмета — причина ремонта и примечание к позициям папки (решение 06.11.2026 «Причина
  // обязательна везде + чип»: причина «В ремонте» доходит до ЦОД и в отчёт по описи).
  if (name === 'Комментарий.txt' && inner.length >= 2) {
    const text = (await blob.text()).trim();
    const its = (items || []).map((k) => itemOf(inv, k)).filter((it) => it && it.own !== false);
    if (!its.length) return { taken: false, why: 'комментарий не в папке предмета описи' };
    its.forEach((it) => mark(it, { comment: text }));
    saveResults(); changed();
    return { taken: true, why: '' };
  }
  // Акт (документ) на группу позиций (указание пользователя 06.11.2026: «Акт может быть составлен на группу
  // позиций»): PDF или снимок документа в папке «Акты» описи с перечнем инвентарников → скан описи на разбор ЦОД,
  // после приёма — документ каждой позиции группы.
  if (inner[0] === 'Акты' && /\.(pdf|jpe?g|png|webp|heic)$/i.test(name) && inv.kind === 'inv') {
    const its = (items || []).map((k) => itemOf(inv, k)).filter((it) => it && it.own !== false);
    if (!its.length) return { taken: false, why: 'у акта нет позиций описи' };
    const r = resultsOf(typeId, ocId);
    if ((r.scans || []).some((s) => s.title === name && s.inv && s.inv.invId === inv.id)) return { taken: true, why: '' };
    addResultScan(typeId, ocId, [new File([blob], name, { type: blob.type || (/\.pdf$/i.test(name) ? 'application/pdf' : 'image/jpeg') })],
      { title: name.replace(/\.[^.]+$/, ''), by: person, inv: { invId: inv.id, itemIds: its.map((it) => it.id) } });
    saveResults(); changed();
    return { taken: true, why: '' };
  }
  if (/\.(jpe?g|png|webp|heic)$/i.test(name)) {
    const found = (items || []).map((k) => itemOf(inv, k)).filter(Boolean);
    if (!found.length) return { taken: false, why: 'снимок не в папке предмета описи' };
    const hit = found.filter((it) => it.own !== false);
    if (!hit.length) return { taken: false, why: 'позиция в чужой части описи — только для чтения' };
    for (const it of hit) {
      mark(it, { state: 'seen' });
      if (!vals) {
        const m = markOf(inv.id, it.id) || {};
        if (!(m.photos || []).some((p) => p.name === name)) addItemPhoto(inv.id, it.id, new File([blob], name, { type: blob.type || 'image/jpeg' }), { by: person, assignId });
      }
    }
    if (vals) {
      // Снимки механизмов-ОИ — снимками результатов к этому ОИ, категория — наименование единицы.
      if (!(resultsOf(typeId, ocId).photos || []).some((p) => p.name === name && p.oiId === inv.oiId)) {
        addResultPhoto(typeId, ocId, new File([blob], name, { type: blob.type || 'image/jpeg' }), { oiId: inv.oiId, cat: hit[0].name, by: person, source: SOURCE });
      }
    }
    saveResults(); changed();
    return { taken: true, why: '' };
  }
  return { taken: true, why: '' }; // книга описи, отчёт, журнал — служебное приложения
}

const handlers = {
  hello() {
    const { person, role } = session.state;
    return { person, role, roleLabel: roleLabel(role), system: 'E•state', canInspect: INSPECTING.has(role) };
  },
  assignments() {
    const items = myObjects(session.state.person);
    // Место по ЕНИ — фоном (fillGeo); ответ — сразу.
    fillGeo(items.map((x) => ({ rec: loadTask(x.typeId, x.ocId) })).filter((x) => x.rec)).catch(() => {});
    return { items };
  },
  async doc(body) {
    const { rec } = findObject(session.state.person, body.assignId);
    const hit = docsOf(rec).find((d) => d.id === body.id);
    const f = hit && hit.doc.file;
    if (!f || !f.dataUrl) throw new Error('у документа нет файла');
    const blob = await (await fetch(f.dataUrl)).blob();
    return { body: { name: clean(f.name || hit.doc.name), mime: f.mime || blob.type }, blob };
  },
  async inventory(body) {
    const { typeId, ocId, rec } = findObject(session.state.person, body.assignId);
    const list = assignmentsOfPerson(session.state.person, { live: false }).filter((a) => a.typeId === typeId && a.ocId === ocId);
    const inv = inventoriesOf(rec, list, ownOis(rec)).find((x) => x.id === body.id);
    if (!inv) throw new Error('описи нет в назначении');
    return { body: { title: inv.title, count: inv.items.length }, blob: await inventoryBook(inv) };
  },
  async send(body, blob) {
    const person = session.state.person;
    const { typeId, ocId, rec } = findObject(person, body.assignId);
    if (!blob) throw new Error('нет файла');
    startWork(person, typeId, ocId);
    if (String(body.rel || '').startsWith(MACHINES + '/')) {
      const list = assignmentsOfPerson(person, { live: false }).filter((a) => a.typeId === typeId && a.ocId === ocId);
      return applyInventory({ typeId, ocId, rec, list, person, assignId: (list[0] || {}).id || '' }, String(body.rel), blob, body.items || []);
    }
    const depth = Number.isFinite(+body.depth) && body.depth !== '' ? +body.depth : undefined;
    const sum = await applyEntries(typeId, rec, [{ rel: String(body.rel || ''), oiId: body.oiId || '', depth, read: async () => blob }], { source: SOURCE });
    const res = sum.results[0] || { taken: false, why: 'не разобран' };
    // Принят ли файл: приложение отмечает отправленным только принятое, отказ — с причиной на объекте.
    return { taken: res.taken, why: res.why, photos: sum.photos, values: sum.values, voices: sum.voices, scans: sum.scans, repeated: sum.repeated };
  },
  // Удалено на телефоне после отправки — в системе пометка «удалено осмотрщиком» (решение 03.11.2026: «Система копит всё»).
  deleted(body) {
    const person = session.state.person;
    const { typeId, rec } = findObject(person, body.assignId);
    return { n: markDeleted(typeId, rec, String(body.rel || ''), { oiId: body.oiId || '', by: person }) };
  },
  finish(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.assignId);
    return { n: finishWork(person, typeId, ocId, body.done !== false, { incomplete: !!body.incomplete }) };
  },
  // Осмотр не состоялся (решение 03.11.2026: исходы «Нужны»): событие осмотра с причиной — регионалу в историю и
  // статистику; в «Результатах осмотра» — последним исходом. Состояние назначения не меняется: решает регионал.
  outcome(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.assignId);
    const text = [body.reason, body.note].filter(Boolean).join(' — ');
    // Повтор того же исхода в тот же день (например, отчёт дня сдан ещё раз) — не дублируется.
    const today = isoDay();
    const same = (a) => eventsOf({ typeId, ocId }).some((e) => e.kind === 'outcome' && e.assignId === a.id && e.text === text && String(e.at).slice(0, 10) === today);
    myAssignsOn(person, typeId, ocId).filter((a) => !same(a)).forEach((a) => logEvent('outcome', a, { text }));
    resultsOf(typeId, ocId).outcome = { reason: String(body.reason || ''), note: String(body.note || ''), by: person, at: new Date().toISOString() };
    saveResults();
    changed();
    return {};
  },
  exit() {
    setTimeout(() => { if (history.length > 1) history.back(); else location.hash = '#/'; }, 0);
    return {};
  },

  // --- запросы документов (кадастр) у осмотрщика (пачка Б, решения 06.11.2026) -------------------------
  // Открытые и закрытые — отдельно; у строки — что просят, по какому объекту, ответ, разбор ЦОД и причина возврата
  // или отклонения («Снова «Ждёт» + причина»). Ответ можно поправить до разбора и после приёма (новой редакцией).
  cadastre() {
    const person = session.state.person;
    const state = (x) => (x.review ? x.review.state : x.file && x.file.docId ? 'accepted' : x.result ? 'wait' : '');
    return { requests: allCadRequests().filter((r) => r.person === person).map((r) => ({
      id: r.id, no: r.no, kind: cadKindLabel(r.kind), due: r.due || '', note: r.note || '', at: r.at, closed: !!r.closedAt,
      rows: r.rows.map((x) => {
        const rec = x.typeId && x.ocId ? loadTask(x.typeId, x.ocId) : null;
        return { id: x.id, doc: x.doc || '', title: rec ? titleOf(rec, x.ocId) : '', eni: fmtEni(x.eni) || x.eni || '', inst: x.inst || '',
          result: x.result || '', resultLabel: x.result ? cadResultLabel(x.result) : 'Ждёт', answer: x.answer || '', scanDate: x.scanDate || '',
          file: x.file ? x.file.name || '' : '', review: state(x), note: x.note || '', answeredAt: x.answeredAt || '' };
      }) })) };
  },
  // Ответ по строке: result 'got' (с файлом — снимок или PDF камеры), 'none', 'refused'.
  async cadAnswer(body, blob) {
    const person = session.state.person;
    const r = allCadRequests().find((x) => x.id === body.reqId && x.person === person);
    if (!r) throw new Error('запрос не ваш или не найден');
    const result = ['got', 'none', 'refused'].includes(body.result) ? body.result : '';
    if (!result) throw new Error('нужен результат');
    if (result === 'got' && !blob) throw new Error('нужен файл документа');
    const name = String(body.fileName || 'документ.pdf');
    const file = blob ? new File([blob], name, { type: blob.type || (/\.pdf$/i.test(name) ? 'application/pdf' : 'image/jpeg') }) : null;
    const row = await answerCadRow(r.id, String(body.rowId || ''), { result, scanDate: String(body.scanDate || ''), answer: String(body.answer || ''), file, fileName: name });
    if (!row) throw new Error('строка не найдена');
    return { at: row.answeredAt };
  },

  // --- день осмотрщика (план пользователя 06.11.2026, пачка А) -----------------------------------------
  // Причины переноса и снятия с дня — из справочника системы («Объект закрыт» — решение 06.11.2026).
  reasons() { return { move: skipReasons() }; },
  // Лента уведомлений осмотрщика за 14 дней: назначения, возвраты, снятия, переносы, сканы, запросы документов.
  notes() { return { items: feedOf(session.state.person) }; },
  // Планы: дни вперёд — область по плану месяца, отсутствие, выезды; отдельно — задачи без даты.
  plans(body) {
    const person = session.state.person;
    const n = Math.min(42, Math.max(1, Number(body && body.days) || 28));
    const list = assignmentsOfPerson(person, { live: true });
    const obj = (a) => ({ objectId: `${a.typeId}|${a.ocId}`, title: titleOf(loadTask(a.typeId, a.ocId) || {}, a.ocId), state: a.state, moveReq: a.moveReq || null });
    const days = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const iso = isoDay(d);
      const plan = planOf(person, iso);
      const ab = absenceOn(person, iso);
      days.push({ date: iso, workday: workdayOf(person, iso).ok, region: plan ? [plan.region, plan.district].filter(Boolean).join(', ') : '',
        absence: ab ? absenceLabel(ab.kind) : '', items: list.filter((a) => a.plannedAt === iso).map(obj) });
    }
    return { days, noDate: list.filter((a) => !a.plannedAt).map(obj),
      overdue: list.filter((a) => a.plannedAt && a.plannedAt < isoDay()).map((a) => ({ ...obj(a), date: a.plannedAt })) };
  },
  // Взять задачу без даты на любой день (решение 06.11.2026: «Может не только на сегодня, но и взять на другую дату»).
  take(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.objectId);
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('нужна дата');
    myAssignsOn(person, typeId, ocId).filter(isLive).forEach((a) => takeForDay(a.id, date));
    return {};
  },
  // Запрос переноса — регионал подтверждает (решение 06.11.2026).
  move(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.objectId);
    const list = myAssignsOn(person, typeId, ocId).filter(isLive);
    if (!list.length) throw new Error('назначение не действует');
    list.forEach((a) => requestMove(a.id, { date: String(body.date || ''), reason: String(body.reason || ''), note: String(body.note || '') }));
    return {};
  },
  // Отчёт дня: утро и вечер, выезды дня с исходами, пробег по дорогам (OSRM/OSM), можно ли ещё сдать.
  async report(body) {
    const person = session.state.person;
    const date = String((body && body.date) || isoDay());
    const morning = reportOf(person, date, 'morning');
    const evening = reportOf(person, date, 'evening');
    const trips = assignmentsOfPerson(person, { live: false }).filter((a) => a.plannedAt === date && a.state !== 'removed')
      .map((a) => ({ assignId: a.id, objectId: `${a.typeId}|${a.ocId}`, title: titleOf(loadTask(a.typeId, a.ocId) || {}, a.ocId), state: a.state }));
    const pts = dayPoints(person, date);
    const routeKm = pts ? await osrmKm(pts) : null;
    const late = date < isoDay() ? lateWorkdays(person, date) : 0;
    return { date, morning: morning || null, evening: evening || null, trips, routeKm, workday: workdayOf(person, date).ok,
      canFile: !!(morning && evening) || late <= LATE_REPORT_WORKDAYS, lateDays: late };
  },
  // Сохранить отчёт: kind 'morning' — { odometer, noOdometer }; 'evening' — { km, kmByRoute, odometer, fuel, done: [assignId],
  // partial: [{ assignId, reason }], note }. Позже 3 рабочих дней — отказ.
  saveReport(body) {
    const person = session.state.person;
    const kind = body.kind === 'morning' ? 'morning' : 'evening';
    const r = saveReport({ person, date: String(body.date || isoDay()), kind, ...(body.data || {}) });
    if (!r) throw new Error('срок сдачи отчёта за этот день прошёл');
    return { at: r.at };
  },
};

// Подключить мост к рамке; возвращает отключение.
export function connectBridge(frame) {
  const target = () => frame.contentWindow;
  const reply = (msg, transfer) => { const w = target(); if (w) w.postMessage({ osmotr: 1, ...msg }, location.origin); };
  const onMessage = async (e) => {
    if (e.source !== target() || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.osmotr !== 1 || !m.id || !handlers[m.t]) return;
    try {
      const r = await handlers[m.t](m.body || {}, m.blob || null);
      const withBlob = r && r.blob instanceof Blob;
      reply({ re: m.id, ok: true, body: withBlob ? r.body : r, blob: withBlob ? r.blob : null });
    } catch (err) {
      reply({ re: m.id, ok: false, error: String((err && err.message) || err) });
    }
  };
  // Регионал назначил, снял, вернул на доосмотр — приложение перечитает.
  let t = 0;
  const onChanged = () => { clearTimeout(t); t = setTimeout(() => reply({ t: 'changed' }), 400); };
  window.addEventListener('message', onMessage);
  window.addEventListener('inside:inspections', onChanged);
  const unsub = session.subscribe(onChanged);
  const offGeo = onGeoDone(onChanged);
  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('inside:inspections', onChanged);
    if (typeof unsub === 'function') unsub();
    offGeo();
    clearTimeout(t);
  };
}