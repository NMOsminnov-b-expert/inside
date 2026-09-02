// Архив документов — общий механизм на всю систему.
//
// Решение пользователя 2026-09-02: прикреплённый документ надо уметь убирать из
// карточки, но НЕ удалять — он переезжает в архив, где его можно найти и
// вернуть. Раньше документ не удалялся вовсе: кнопка «Открепить» жила в
// неподключённом parts/docs/table.js, а обработчика к ней не было.
//
// Почему в ядре: архив один на систему, а класть в него документы умеют все
// пять модулей ОЦ. Держать пять копий правил — верный способ получить пять
// разных архивов (так уже разъезжались значки состояния и состав ui-состояния).
//
// Где лежат архивные документы: в самой записи ОЦ (rec.archive). Это даёт
// главное требование пользователя бесплатно — «архив доступен для учреждений,
// за которыми закреплён сотрудник»: учреждение известно из записи, отдельной
// таблицы прав не нужно.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь архив живёт в памяти вкладки вместе с записью, а
// файл — blob-ссылкой. На сервере это отдельное хранилище со своим сроком
// хранения и, возможно, окончательным удалением по регламенту: решать тем, кто
// будет делать серверную часть. Отсюда же берётся вопрос, кто имеет право
// восстанавливать документ — сейчас это может каждый, кто видит архив.
import { session } from './session.js';
import { sortedTypes } from './registry.js';

// Куда именно был прикреплён документ: к самому ОЦ или к литере/участку.
// Подпись нужна в архиве — без неё непонятно, откуда документ пришёл.
export function docScopeLabel(rec, oi) {
  if (!oi) return 'Объект оценки';
  const letter = oi.letter ? `Литера ${oi.letter}` : (oi.card === 'land' ? 'Земельный участок' : 'ОИ');
  return oi.name ? `${letter} · ${oi.name}` : letter;
}

// Убрать документ из карточки в архив. Возвращает архивную запись либо null,
// если документа в списке не оказалось.
export function archiveDoc({ rec, oi, docId, typeId, typeLabel, today }) {
  const holder = oi || rec;
  const list = holder && holder.docs;
  if (!list) return null;

  const i = list.findIndex((d) => d.id === docId);
  if (i < 0) return null;

  const [doc] = list.splice(i, 1);

  // Файл НЕ освобождается: архивный документ ещё открывают и скачивают.
  const entry = {
    ...doc,
    archivedAt: today,
    archivedBy: session.state.person,
    from: {
      typeId,
      typeLabel,
      ocId: rec.id,
      ocTitle: rec.address || rec.title || rec.id,
      eni: rec.eni || '',
      institution: rec.institution || '',
      oiId: oi ? oi.id : null,
      scopeLabel: docScopeLabel(rec, oi),
    },
  };

  rec.archive = rec.archive || [];
  rec.archive.push(entry);
  return entry;
}

// Вернуть документ туда, откуда он был убран. Если литеры больше нет (её могли
// удалить, пока документ лежал в архиве), возвращаем в документы самого ОЦ —
// иначе документ было бы некуда положить и он застрял бы в архиве навсегда.
export function restoreDoc(rec, docId) {
  const list = rec && rec.archive;
  if (!list) return null;

  const i = list.findIndex((d) => d.id === docId);
  if (i < 0) return null;

  const [entry] = list.splice(i, 1);
  const oi = entry.from.oiId ? (rec.oi || []).find((o) => o.id === entry.from.oiId) : null;
  const holder = oi || rec;
  holder.docs = holder.docs || [];

  const { archivedAt, archivedBy, from, ...doc } = entry;
  holder.docs.push(doc);
  return { doc, restoredTo: oi ? from.scopeLabel : 'Объект оценки', movedToOc: !!(entry.from.oiId && !oi) };
}

// --- Чтение архива по всем модулям ----------------------------------------
//
// Ядро не знает ни одного типа ОЦ и здесь его не узнаёт: список типов приходит
// из реестра (registry), а записи — из records.js каждого модуля, ровно как это
// делает сводный запрос страницы реестра.

function matchText(entry, q) {
  if (!q) return true;
  const hay = [
    entry.name, entry.type, entry.from.ocTitle, entry.from.eni,
    entry.from.institution, entry.from.scopeLabel, entry.archivedBy,
  ].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// filter: { q, typeId, docType, institution, from, to }
// canSee — функция доступа к учреждению (kernel/session.js), передаётся снаружи,
// чтобы правило прав жило в одном месте.
export function queryArchive(filter = {}, canSee = () => true) {
  const out = [];

  sortedTypes().forEach((t) => {
    if (filter.typeId && filter.typeId.length && !filter.typeId.includes(t.manifest.id)) return;
    const records = t.records.allRecords ? t.records.allRecords() : [];

    records.forEach((rec) => {
      if (!canSee(rec.institution)) return;
      (rec.archive || []).forEach((entry) => {
        if (filter.docType && filter.docType.length && !filter.docType.includes(entry.type)) return;
        if (filter.institution && filter.institution.length
            && !filter.institution.includes(entry.from.institution)) return;
        if (filter.from && String(entry.archivedAt) < filter.from) return;
        if (filter.to && String(entry.archivedAt) > filter.to) return;
        if (!matchText(entry, filter.q)) return;
        out.push(entry);
      });
    });
  });

  // Свежие сверху: в архив заходят чаще всего за тем, что убрали только что.
  out.sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
  return out;
}

// Значения для фильтров — считаются по тому же набору, что и сам список,
// чтобы в списке фильтра не было вариантов, которых не встретить.
export function archiveFacets(canSee = () => true) {
  const docType = {};
  const institution = {};
  const typeId = {};
  let total = 0;

  sortedTypes().forEach((t) => {
    const records = t.records.allRecords ? t.records.allRecords() : [];
    records.forEach((rec) => {
      if (!canSee(rec.institution)) return;
      (rec.archive || []).forEach((entry) => {
        total++;
        docType[entry.type] = (docType[entry.type] || 0) + 1;
        const inst = entry.from.institution || '—';
        institution[inst] = (institution[inst] || 0) + 1;
        typeId[t.manifest.id] = (typeId[t.manifest.id] || 0) + 1;
      });
    });
  });

  return { docType, institution, typeId, total };
}

// Найти запись ОЦ по архивному документу — для восстановления и перехода.
export function findRecordOf(entry) {
  const type = sortedTypes().find((t) => t.manifest.id === entry.from.typeId);
  if (!type || !type.records.allRecords) return null;
  return type.records.allRecords().find((r) => r.id === entry.from.ocId) || null;
}
