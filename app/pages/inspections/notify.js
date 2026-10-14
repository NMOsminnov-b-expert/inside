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
  allAssignments, isLive, dayReport, workdayOf, poaDaysLeft, stallOf, reportTime, eventsOf,
} from '../../kernel/inspections.js';
import { queueBase } from './model.js';
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
  const push = (n) => out.push({ ...n, id: [n.kind, n.person, n.date, n.ref || ''].join('|') });

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
      push({ kind: 'missed', person: a.person, date: a.plannedAt, ref: a.id, text: titleOf(a), go: { assign: a.id } });
    }
    // Зависло — кроме не начатых с прошедшей датой: те уже «пропущен выезд».
    const st = a.state === 'assigned' && a.plannedAt && a.plannedAt < today ? '' : stallOf(a);
    if (st) push({ kind: 'stalled', person: a.person, date: today, ref: a.id, text: `${titleOf(a)} — ${st}`, go: { assign: a.id } });
    // Плановая дата — на отпуске, больничном или выходном.
    if (a.plannedAt && a.plannedAt >= today) {
      const w = workdayOf(a.person, a.plannedAt);
      if (!w.ok) push({ kind: 'absence', person: a.person, date: a.plannedAt, ref: a.id, text: `${titleOf(a)} — ${w.reason}`, go: { assign: a.id } });
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
    if (e.kind === 'skipped' && !undone(e)) push({ kind: 'skipped', person: e.person, date: e.date, ref: e.id, text: `${titleOf(e)} — ${e.text}`, go: { assign: e.assignId } });
    if (e.kind === 'taken') push({ kind: 'offPlan', person: e.person, date: e.date, ref: e.id, text: `${titleOf(e)} — план был ${e.was ? ddmm(e.was) : 'без даты'}`, go: { assign: e.assignId } });
  });

  // Срок осмотра объекта (ставит менеджер) прошёл, объект не осмотрен.
  queueBase(all).forEach((s) => {
    if (s.deadline && s.deadline < today) push({ kind: 'overdue', person: '', date: s.deadline, ref: s.typeId + '|' + s.id, text: `${s.title} — срок ${ddmm(s.deadline)}`, go: { queue: s.typeId + '|' + s.id } });
  });

  // Доверенность: за 14 дней и после окончания.
  active.forEach((p) => {
    const d = poaDaysLeft(p.name);
    if (d !== null && d <= 14) push({ kind: 'poa', person: p.name, date: today, ref: String(d < 0 ? 'out' : d === 0 ? 'today' : 'soon'), text: d < 0 ? `истекла ${-d} дн. назад` : d === 0 ? 'истекает сегодня' : `истекает через ${d} дн.`, go: { profile: true } });
  });

  return out.sort((x, y) => y.date.localeCompare(x.date) || noteKind(x.kind).label.localeCompare(noteKind(y.kind).label));
}
