import { localIso } from './fmt.js';

// Когда запись перешла в статус: rec.statusAt — { статус: время перехода }. Нужно очереди регионала — сортировка
// «по дате направления на осмотр» (ответ пользователя 24.11.2026: «можно отсортировать по например дате перевода на
// осмотр, по иным метрикам»). Все смены статуса записи идут через setRecStatus; у записей засева времени нет —
// для них дата неизвестна.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: история статусов — журналом на сервере (кто, когда, откуда куда), а не полем записи.
export function setRecStatus(rec, to) {
  if (!rec) return rec;
  if ((rec.status || '') !== to && to) rec.statusAt = { ...(rec.statusAt || {}), [to]: localIso() };
  rec.status = to;
  return rec;
}

export const statusSince = (rec, status) => (rec && rec.statusAt && rec.statusAt[status]) || '';
