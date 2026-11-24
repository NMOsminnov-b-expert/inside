// Уведомления регионала о пропусках (ТЗ рабочего дня осмотрщика, раздел 8):
// «о любых пропусках: выезда, просрочки, отчёта и т. д.» (ответ
// пользователя 12.10.2026).
//
// Уведомления не хранятся — выводятся из данных: отчётов за день,
// назначений, сроков объектов, профилей. Поэтому они не расходятся с тем,
// что показывают остальные разделы, и исчезают сами, когда причина
// устранена (отчёт сдан, назначение начато). У каждого — постоянный id
// (вид + осмотрщик + день + предмет): по нему помнится «прочитано».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: те же правила считает сервер по расписанию (к
// началу и к концу рабочего дня каждого осмотрщика) и доставляет — в панель
// и в WhatsApp или на почту (развилка канала, ТЗ 8.3); «прочитано» — у
// учётной записи менеджера.
import {
  allAssignments, isLive, dayReport, profileOf, workdayOf, poaDaysLeft, stallOf, reportTime, eventsOf, allCadRequests, cadKindLabel,
} from '../../kernel/inspections.js';
import { allResults } from '../../kernel/inspectionResults.js';
import { queueBase } from './model.js';
import { earlyOf } from '../../kernel/earlyInspection.js';
import { loadTask } from '../inspection/tasks.js';
import { plural } from '../../kernel/fmt.js';

export const NOTE_KINDS = [
  { key: 'noMorning', label: 'Нет утреннего отчёта', tone: 'off' },
  { key: 'late', label: 'Поздний выезд', tone: 'warn' },
  { key: 'noEvening', label: 'Нет вечернего отчёта', tone: 'off' },
  { key: 'missed', label: 'Пропущен выезд', tone: 'off' },
  { key: 'skipped', label: 'Снято с дня осмотрщиком', tone: 'off' },
  { key: 'offPlan', label: 'Взято не по плану', tone: 'warn' },
  { key: 'overdue', label: 'Срок объекта прошёл', tone: 'off' },
  { key: 'stalled', label: 'Назначение зависло', tone: 'warn' },
  { key: 'poa', label: 'Доверенность', tone: 'warn' },
  { key: 'absence', label: 'План на отсутствие', tone: 'warn' },
  // Кадастр и сканы (решение пользователя 06.11.2026 «В ленту и число на меню»).
  { key: 'cadGot', label: 'Ответ кадастра получен', tone: 'ok' },
  { key: 'retake', label: 'Скан не переснят', tone: 'warn' },
  { key: 'handed', label: 'Осмотр сдан', tone: 'ok' },
  { key: 'moveReq', label: 'Запрошен перенос выезда', tone: 'warn' },
  // Осмотрено частично — выезд сам ушёл на следующий рабочий день (17.11.2026).
  { key: 'carried', label: 'Остаток перенесён', tone: 'warn' },
  // Осмотр не состоялся — с причиной; без даты выезд сам ушёл на следующий рабочий день (аудит 17.11.2026).
  { key: 'failed', label: 'Осмотр не состоялся', tone: 'off' },
  // Досрочное направление от ЦОД (kernel/earlyInspection.js; аудит 24.11.2026 — регионал о нём не узнавал).
  { key: 'earlySent', label: 'Досрочно направлен на осмотр', tone: 'ok' },
  { key: 'earlyEdited', label: 'Досрочное направление изменено', tone: 'warn' },
  { key: 'earlyCancelled', label: 'Досрочное направление отозвано', tone: 'warn' },
  // Осмотрщика передали другому регионалу — новому нужна сводка по нему (пользователь 24.11.2026).
  { key: 'transferred', label: 'Осмотрщик передан', tone: 'ok' },
];
export const noteKind = (k) => NOTE_KINDS.find((x) => x.key === k) || { key: k, label: k, tone: '' };

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ddmm = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7);

// people — строки осмотрщиков (inspectorRows); days — за сколько дней назад.
export function notifications(all, people, days = 7) {
  const out = [];
  const today = isoDay(new Date());
  const active = people.filter((p) => !p.fired);
  const titleOf = (a) => { const s = all.get(a.typeId + '|' + a.ocId); return s ? s.title : '—'; };
  // obj — «тип|id» объекта: лента и колокольчик регионала отбираются и по срезу объекта (область, учреждение), а не
  // только по осмотрщику (аудит 24.11.2026).
  const push = (n, src) => out.push({ ...n, obj: n.obj || (src && src.typeId && src.ocId ? src.typeId + '|' + src.ocId : ''), id: [n.kind, n.person, n.date, n.ref || ''].join('|') });

  // Отчёты за день — за последние дни, включая сегодня.
  active.forEach((p) => {
    for (let k = 0; k < days; k++) {
      const d = new Date(); d.setDate(d.getDate() - k);
      const iso = isoDay(d);
      const r = dayReport(p.name, iso);
      if (r.missingMorning) push({ kind: 'noMorning', person: p.name, date: iso, text: `к ${r.lateFrom} — ${r.trips} ${plural(r.trips, 'выезд', 'выезда', 'выездов')} в плане`, go: { report: iso } });
      if (r.late) push({ kind: 'late', person: p.name, date: iso, text: `утренний в ${reportTime(r.morning.at)} при начале дня ${r.lateFrom}`, go: { report: iso } });
      if (r.missingEvening) push({ kind: 'noEvening', person: p.name, date: iso, text: 'пробег и осмотренное за день не сданы', go: { report: iso } });
    }
  });

  const since = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoDay(d); })();
  allAssignments().forEach((a) => {
    if (!isLive(a)) return;
    // Пропущен выезд: день прошёл, осмотр не начат.
    if (a.state === 'assigned' && a.plannedAt && a.plannedAt < today && a.plannedAt >= since) {
      push({ kind: 'missed', person: a.person, date: a.plannedAt, ref: a.id, text: titleOf(a), go: { assign: a.id } }, a);
    }
    // Зависло — кроме не начатых с прошедшей датой: те уже «пропущен выезд».
    const st = a.state === 'assigned' && a.plannedAt && a.plannedAt < today ? '' : stallOf(a);
    if (st) push({ kind: 'stalled', person: a.person, date: today, ref: a.id, text: `${titleOf(a)} — ${st}`, go: { assign: a.id } }, a);
    // Плановая дата — на отпуске, больничном или выходном.
    if (a.plannedAt && a.plannedAt >= today) {
      const w = workdayOf(a.person, a.plannedAt);
      if (!w.ok) push({ kind: 'absence', person: a.person, date: a.plannedAt, ref: a.id, text: `${titleOf(a)} — ${w.reason}`, go: { assign: a.id } }, a);
    }
  });

  // Не по плану (решение пользователя 14.10.2026 «если не совпало с планом —
  // отчет регионалу»): осмотрщик снял выезд с дня — с причиной, или взял на
  // день объект с другой датой.
  const from = (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return isoDay(d); })();
  const evs = eventsOf();
  // Снятие, которое осмотрщик сам отменил, — не пропуск.
  const undone = (e) => evs.some((u) => u.kind === 'unskipped' && u.assignId === e.assignId && u.date === e.date && u.at >= e.at);
  evs.forEach((e) => {
    if (!e.date || e.date < from) return;
    if (e.kind === 'skipped' && !undone(e)) push({ kind: 'skipped', person: e.person, date: e.date, ref: e.id, text: `${titleOf(e)} — ${e.text}`, go: { assign: e.assignId } }, e);
    if (e.kind === 'carried' && e.failed) push({ kind: 'failed', person: e.person, date: e.at ? String(e.at).slice(0, 10) : e.date, ref: e.id, text: `${titleOf(e)} — ${e.text}`, go: { assign: e.assignId } }, e);
    // С датой переноса — запрос регионалу (moveReq) и сам исход: уведомление без повтора, если выезд уже перенесён сам.
    if (e.kind === 'outcome' && !evs.some((c) => c.kind === 'carried' && c.failed && c.assignId === e.assignId && String(c.at).slice(0, 10) === String(e.at).slice(0, 10))) {
      push({ kind: 'failed', person: e.person, date: String(e.at).slice(0, 10), ref: e.id, text: `${titleOf(e)} — ${e.text}`, go: { assign: e.assignId } }, e);
    }
    if (e.kind === 'carried' && !e.failed) push({ kind: 'carried', person: e.person, date: e.at ? String(e.at).slice(0, 10) : e.date, ref: e.id, text: `${titleOf(e)} — ${e.text}`, go: { assign: e.assignId } }, e);
    if (e.kind === 'taken') push({ kind: 'offPlan', person: e.person, date: e.date, ref: e.id, text: `${titleOf(e)} — план был ${e.was ? ddmm(e.was) : 'без даты'}`, go: { assign: e.assignId } }, e);
  });

  // Срок осмотра объекта (ставит менеджер) прошёл, объект не осмотрен.
  queueBase(all).forEach((s) => {
    if (s.deadline && s.deadline < today) push({ kind: 'overdue', person: '', date: s.deadline, ref: s.typeId + '|' + s.id, text: `${s.title} — срок ${ddmm(s.deadline)}`, go: { queue: s.typeId + '|' + s.id }, obj: s.typeId + '|' + s.id });
  });

  // Передача осмотрщика другому регионалу (журнал профиля managerLog, kernel/inspections.js saveProfile): уведомление
  // видит регионал, за которым осмотрщик теперь закреплён; в тексте — с чем передан, щелчок — карточка осмотрщика.
  active.forEach((p) => {
    const log = (profileOf(p.name).managerLog || []).filter((x) => x.at && x.at.slice(0, 10) >= since);
    if (!log.length) return;
    const e = log[log.length - 1];
    const mine = allAssignments().filter((a) => a.person === p.name && isLive(a));
    const late = mine.filter((a) => a.plannedAt && a.plannedAt < today && a.state === 'assigned').length;
    push({ kind: 'transferred', person: p.name, date: e.at.slice(0, 10), ref: e.at,
      text: [`от ${e.from}`, `в работе ${mine.length}`, late ? `пропущено выездов ${late}` : ''].filter(Boolean).join(' · '), go: { person: true } });
  });

  // Доверенность: за 14 дней и после окончания.
  active.forEach((p) => {
    const d = poaDaysLeft(p.name);
    if (d !== null && d <= 14) push({ kind: 'poa', person: p.name, date: today, ref: String(d < 0 ? 'out' : d === 0 ? 'today' : 'soon'), text: d < 0 ? `истекла ${-d} дн. назад` : d === 0 ? 'истекает сегодня' : `истекает через ${d} дн.`, go: { profile: true } });
  });

  // Ответ кадастра получен и ещё не разобран; скан возвращён и не переснят; осмотр сдан и не принят.
  const day = (iso) => String(iso || '').slice(0, 10);
  allCadRequests().forEach((req) => {
    if (req.closedAt) return;
    req.rows.forEach((row) => {
      if (row.result !== 'got' || row.review || day(row.answeredAt) < from) return;
      push({ kind: 'cadGot', person: row.answeredBy || req.person, date: day(row.answeredAt), ref: row.id,
        text: `${cadKindLabel(req.kind)} № ${req.no} — ${row.doc || 'документ'}`, go: { href: `#/scans?src=${encodeURIComponent('кадастр')}&key=${encodeURIComponent(`cad|${req.id}|${row.id}`)}` } });
    });
  });
  allResults().forEach((res) => {
    const list = res.scans || [];
    list.forEach((s) => {
      if (!s.retake) return;
      if (list.some((n) => n !== s && n.title === s.title && (n.oiId || '') === (s.oiId || '') && String(n.at) > String(s.retake.at))) return;
      push({ kind: 'retake', person: s.by || '', date: day(s.retake.at), ref: s.id,
        text: `${titleOf(res)} — ${s.title || 'скан'}: ${s.retake.reason}`, go: { href: `#/scans?state=returned&key=${encodeURIComponent(`scan|${res.typeId}|${res.ocId}|${s.id}`)}` } }, res);
    });
  });
  // Досрочное направление: направлено и изменено — из записи (rec.early), отозвано — из следа в журнале записи. Кто
  // направил — ЦОД, не осмотрщик: в «кто» пусто, имя — в тексте.
  all.forEach((s) => {
    const f = s.flags || {};
    const key = s.typeId + '|' + s.id;
    if (f.earlySent) {
      const e = earlyOf(loadTask(s.typeId, s.id));
      if (!e) return;
      const what = e.oiIds.length ? `ОИ: ${e.oiIds.length}` : 'весь объект';
      if (day(e.at) >= from) push({ kind: 'earlySent', person: '', date: day(e.at), ref: key, obj: key, text: `${s.title} — ${what}${e.by ? ` · направил ${e.by}` : ''}${e.note ? ` · ${e.note}` : ''}`, go: { queue: key } });
      (e.log || []).filter((x) => x.kind === 'edited' && day(x.at) >= from).forEach((x) => push({ kind: 'earlyEdited', person: '', date: day(x.at), ref: key + '|' + x.at, obj: key,
        text: `${s.title} — ${x.text}${x.by ? ` · изменил ${x.by}` : ''}`, go: { queue: key } }));
    } else if (f.earlyCancelledAt && day(f.earlyCancelledAt) >= from) {
      push({ kind: 'earlyCancelled', person: '', date: day(f.earlyCancelledAt), ref: key + '|' + f.earlyCancelledAt, obj: key, text: s.title, go: { href: `#/oc/${s.typeId}/${s.id}` } });
    }
  });
  // Запрос переноса ждёт ответа регионала — до ответа, без срока давности.
  allAssignments().forEach((a) => {
    if (!isLive(a) || !a.moveReq) return;
    push({ kind: 'moveReq', person: a.person, date: day(a.moveReq.at), ref: a.id + '|' + a.moveReq.at,
      text: `${titleOf(a)} — ${a.moveReq.from ? ddmm(a.moveReq.from) : 'без даты'} → ${ddmm(a.moveReq.date)}: ${a.moveReq.reason}`, go: { assign: a.id } }, a);
  });
  allAssignments().forEach((a) => {
    if (a.state !== 'done' || a.demo || day(a.doneAt) < from) return;
    push({ kind: 'handed', person: a.person, date: day(a.doneAt), ref: a.id, text: titleOf(a) + (a.incomplete ? ` — неполный${a.incompleteReason ? ': ' + a.incompleteReason : ''}` : ''),
      go: { href: `#/oc/${a.typeId}/${a.ocId}?tab=inspection` } }, a);
  });

  return out.sort((x, y) => y.date.localeCompare(x.date) || noteKind(x.kind).label.localeCompare(noteKind(y.kind).label));
}
