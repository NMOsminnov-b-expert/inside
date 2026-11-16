// Входящие осмотрщика — лента уведомлений за 14 дней: назначения, возвраты,
// снятия, переносы, сканы, запросы документов. Вынесено из моста (bridge.js,
// запрос «notes») 16.11.2026 для веб-страницы осмотрщика; лента та же.
//
// Прочитанное — номерами в хранилище браузера, как в приложении («.уведомления-
// прочитаны» на устройстве).
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: лента и отметки прочитанного — у сервера, по учётной записи.
import { assignmentsOfPerson, eventsOf, allCadRequests, cadKindLabel } from '../../kernel/inspections.js';
import { scanQueue } from '../../kernel/scanQueue.js';
import { loadTask } from '../inspection/tasks.js';
import { titleOf } from './data.js';

const LABEL = { assigned: 'Новое назначение', returned: 'Возврат на доосмотр', removed: 'Снято регионалом', moveAllowed: 'Перенос разрешён',
  moveRefused: 'Перенос отклонён', updated: 'Назначение изменено', moved: 'Перенесена дата' };

export function feedOf(person) {
  const since = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString(); })();
  const mineIds = new Set(assignmentsOfPerson(person, { live: false }).map((a) => a.id));
  const out = eventsOf({}).filter((e) => mineIds.has(e.assignId) && LABEL[e.kind] && String(e.at) >= since && e.who !== person)
    .map((e) => {
      // Название объекта — всегда первым: у «Новое назначение» своего текста нет, без названия непонятно, о чём.
      const title = titleOf(loadTask(e.typeId, e.ocId) || {}, e.ocId);
      return { id: e.id || `${e.kind}|${e.assignId}|${e.at}`, kind: e.kind, label: LABEL[e.kind], text: [title, e.text].filter(Boolean).join(' — '), at: e.at, objectId: `${e.typeId}|${e.ocId}` };
    });
  scanQueue({}).filter((x) => x.by === person && (x.state === 'returned' || x.state === 'rejected') && String(x.decidedAt) >= since)
    .forEach((x) => out.push({ id: 'scan|' + x.key + '|' + x.decidedAt, kind: 'scan-' + x.state, label: x.state === 'returned' ? 'Скан вернули на пересъёмку' : 'Скан отклонён',
      text: `${x.title}: ${x.reason}`, at: x.decidedAt, objectId: `${x.typeId}|${x.ocId}` }));
  allCadRequests().filter((r) => r.person === person && !r.closedAt && String(r.at) >= since)
    .forEach((r) => out.push({ id: 'cad|' + r.id, kind: 'cadastre', label: 'Новый запрос документов', text: `${cadKindLabel(r.kind)} № ${r.no}: строк ${r.rows.length}`, at: r.at, objectId: '' }));
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 100);
}

const READ_KEY = 'inside.osmotr.read';
const readOf = (person) => { try { return new Set((JSON.parse(localStorage.getItem(READ_KEY) || '{}')[person]) || []); } catch { return new Set(); } };

// Лента со значком «новое».
export const notesOf = (person) => { const read = readOf(person); return feedOf(person).map((n) => ({ ...n, unread: !read.has(n.id) })); };

// Открыл «Входящие» — всё показанное прочитано.
export function markRead(person, items) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch { all = {}; }
  all[person] = [...new Set([...(all[person] || []), ...items.map((n) => n.id)])].slice(-500);
  try { localStorage.setItem(READ_KEY, JSON.stringify(all)); } catch { /* хранилище полно — отметка не сохранится */ }
}
