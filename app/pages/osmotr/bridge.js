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
import { getType } from '../../kernel/registry.js';
import { assignmentsOfPerson, coversOi, deadlineOf, startWork, finishWork } from '../../kernel/inspections.js';
import { reviewOf } from '../../kernel/inspectionResults.js';
import { institutionChain } from '../../kernel/contacts.js';
import { loadTask, ownOis, oiLabel, taskDocs } from '../inspector/tasks.js';
import { gpsOfObject } from '../inspections/route.js';
import { applyEntries } from '../inspector/archiveImport.js';

const SOURCE = 'приложение «Осмотр»';
const INSPECTING = new Set(['insp', 'any', 'admin']);

// Папка ОИ в приложении: литера — «Литер А», как заводит само приложение
// (Objects.addBuilding), и по ней же ищет разбор архива (letterOf).
function folderOf(oi) {
  if (oi.card === 'land') return { top: 'Недвижимое', name: 'Земельный участок' };
  if (oi.card === 'vehicle') {
    const plate = String(((oi.vehicle || {}).f || {}).plate || '').trim();
    return { top: 'Движимое', name: plate || oi.name || 'ТС' };
  }
  if (oi.card === 'apartment') return { top: 'Недвижимое', name: 'Квартира' + (oi.flat ? ' №' + oi.flat : '') };
  if (oi.card === 'building') return { top: 'Недвижимое', name: oi.letter ? 'Литер ' + oi.letter : (oi.name || 'Строение') };
  return null; // механизмы — описью, папкой «Механизмы и оборудование»
}

// Название объекта в приложении (имя папки): адрес; у ТС — марка и госномер; у механизмов — опись.
function titleOf(rec, ocId) {
  const v = (rec.vehicle || {}).f || {};
  const ts = [v.make, v.plate].filter(Boolean).join(' · ');
  return clean(rec.address || ts || (rec.mech && rec.mech.name) || rec.name || rec.eni || ocId);
}

// Тип ОИ формы приложения (Params.OI_TYPES): квартира; литера жилого дома — «Жилой дом»; иначе — «Здание».
function oiTypeOf(oi, typeId) {
  if (oi.card === 'apartment') return 'Квартира';
  if (oi.card === 'building') return typeId === 'residential-house' ? 'Жилой дом' : 'Здание';
  return '';
}

const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();

// Назначенные объекты осмотрщика: по одному на ОЦ.
function myObjects(person) {
  const by = new Map();
  assignmentsOfPerson(person, { live: false }).filter((a) => a.state !== 'removed').forEach((a) => {
    const k = a.typeId + '|' + a.ocId;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(a);
  });
  const out = [];
  by.forEach((list, key) => {
    const { typeId, ocId } = list[0];
    const rec = loadTask(typeId, ocId);
    if (!rec) return;
    const t = getType(typeId);
    const whole = list.some((a) => !a.oiIds || !a.oiIds.length);
    const ois = ownOis(rec).filter((o) => whole || list.some((a) => coversOi(a, o.id)))
      .map((o) => ({ o, f: folderOf(o) })).filter((x) => x.f)
      .map(({ o, f }) => ({ id: o.id, kind: o.card, label: oiLabel(o), top: f.top, folder: clean(f.name), oiType: oiTypeOf(o, typeId),
        review: (reviewOf(typeId, ocId, o.id) || {}).state || '', reason: (reviewOf(typeId, ocId, o.id) || {}).reason || '' }));
    const docIds = new Set(list.flatMap((a) => a.docs || []));
    const docs = taskDocs(rec).filter(({ doc }) => !docIds.size || docIds.has(doc.id))
      .map(({ doc, owner }, i) => ({ id: doc.id || `doc-${i}`, name: clean((doc.file && doc.file.name) || doc.name || doc.type || 'Документ'),
        type: doc.type || '', owner, file: !!(doc.file && doc.file.dataUrl) }));
    const state = list.every((a) => a.state === 'done') ? 'done' : list.some((a) => a.state === 'progress') ? 'progress' : 'assigned';
    const gps = gpsOfObject(typeId, ocId);
    const returned = list.flatMap((a) => (a.returned || []).map((r) => ({ oiIds: r.oiIds || [], reason: r.reason || '', at: r.at || '', by: r.by || '' })));
    const contacts = institutionChain(rec.institution, rec.podved).flatMap((x) => x.contacts)
      .map((c) => ({ name: c.name || '', role: c.position || '', phone: c.phone || '' })).filter((c) => c.name || c.phone).slice(0, 12);
    out.push({
      id: key, typeId, ocId, typeLabel: t ? t.manifest.label : '', title: titleOf(rec, ocId),
      state, plannedAt: list.map((a) => a.plannedAt).filter(Boolean).sort()[0] || '', deadline: deadlineOf(typeId, ocId) || '',
      note: list.map((a) => a.note).filter(Boolean).join('\n'), by: list[0].by || '',
      eni: rec.eni || '', address: rec.address || '', institution: [rec.institution, rec.podved].filter(Boolean).join(' · '),
      lat: gps ? gps[0] : null, lon: gps ? gps[1] : null,
      ois, docs, contacts, returned,
    });
  });
  // Незаконченное — первым, в нём ближайшее: плановая дата, затем срок.
  const rank = (x) => (x.state === 'done' ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || (a.plannedAt || '9').localeCompare(b.plannedAt || '9') || (a.deadline || '9').localeCompare(b.deadline || '9'));
}

function findObject(person, id) {
  const [typeId, ocId] = String(id || '').split('|');
  const rec = typeId && ocId ? loadTask(typeId, ocId) : null;
  const mine = rec && assignmentsOfPerson(person, { live: false }).some((a) => a.typeId === typeId && a.ocId === ocId && a.state !== 'removed');
  if (!mine) throw new Error('объект не назначен этому осмотрщику');
  return { typeId, ocId, rec };
}

const handlers = {
  hello() {
    const { person, role } = session.state;
    return { person, role, roleLabel: roleLabel(role), system: 'E•state', canInspect: INSPECTING.has(role) };
  },
  assignments() {
    return { items: myObjects(session.state.person) };
  },
  async doc(body) {
    const { rec } = findObject(session.state.person, body.assignId);
    const hit = taskDocs(rec).find(({ doc }, i) => (doc.id || `doc-${i}`) === body.id);
    const f = hit && hit.doc.file;
    if (!f || !f.dataUrl) throw new Error('у документа нет файла');
    const blob = await (await fetch(f.dataUrl)).blob();
    return { body: { name: clean(f.name || hit.doc.name), mime: f.mime || blob.type }, blob };
  },
  async send(body, blob) {
    const person = session.state.person;
    const { typeId, ocId, rec } = findObject(person, body.assignId);
    if (!blob) throw new Error('нет файла');
    startWork(person, typeId, ocId);
    const sum = await applyEntries(typeId, rec, [{ rel: String(body.rel || ''), oiId: body.oiId || '', read: async () => blob }], { source: SOURCE });
    return { photos: sum.photos, values: sum.values, voices: sum.voices, scans: sum.scans, repeated: sum.repeated, skipped: sum.skipped };
  },
  finish(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.assignId);
    return { n: finishWork(person, typeId, ocId, body.done !== false, { incomplete: !!body.incomplete }) };
  },
  exit() {
    setTimeout(() => { if (history.length > 1) history.back(); else location.hash = '#/'; }, 0);
    return {};
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
  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('inside:inspections', onChanged);
    if (typeof unsub === 'function') unsub();
    clearTimeout(t);
  };
}
