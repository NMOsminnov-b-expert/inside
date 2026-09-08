// Мои осмотры: откуда берутся задачи и что осмотрщик к ним добавляет.
//
// Задача — это НЕ новая сущность. Осмотрщик уже назначается на объект оценки
// (`resp.insp` записи, право `assignInsp` у ЦОД), а срез реестра «Мне
// осмотреть» показывает ровно это: мои объекты в статусе «Удостоверен по
// документам». Экран осмотрщика читает то же самое, только своим списком и под
// телефон — выдумывать вторую сущность «задание» до появления интерфейса
// регионального менеджера значило бы плодить данные, которые потом придётся
// сводить.
//
// Записи берём через kernel/registry.js: страница не имеет права импортировать
// модуль типа ОЦ напрямую (см. архитектурные правила в app/README.md).
import { sortedTypes, getType } from '../../kernel/registry.js';
import { session } from '../../kernel/session.js';

// Статус, в котором объект ждёт осмотра. Тот же, что в срезе «Мне осмотреть»:
// до удостоверения по документам осматривать нечего — данные ЦОД ещё не готовы.
export const READY_STATUS = 'Удостоверен по документам';

// Лимит снимков из ТЗ: 250 на основное строение и участок, 50 на
// вспомогательное. Здесь общий лимит на задачу — по строениям он разойдётся,
// когда фото будут привязываться к литере, а не к осмотру целиком.
export const PHOTO_LIMIT = 250;

export const PHOTO_CATS = [
  'Фасад', 'Внутр. помещения', 'Кровля', 'Конструкции',
  'Земельный участок', 'Документы на месте', 'Прочее',
];

const key = (typeId, ocId) => `${typeId}|${ocId}`;

// Состояние осмотра живёт в памяти вкладки.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь копятся заметка осмотрщика, его снимки и отметка
// «осмотр завершён». На сервере это записи, привязанные к заданию на осмотр: у
// них свой автор, время и порядок, а снимки уходят в файловое хранилище. Пока
// всё пропадает при перезагрузке вкладки — как и остальные файлы макета.
const local = new Map();

export function taskState(typeId, ocId) {
  const k = key(typeId, ocId);
  if (!local.has(k)) local.set(k, { note: '', photos: [], done: false, assets: new Map() });
  return local.get(k);
}

// Значения осмотра ОДНОГО объекта имущества. Осмотр ведётся по ОИ, а не по
// записи целиком — так устроена и рабочая система (адрес её экрана:
// /inspections/<id>/assets/<assetId>), и это единственный способ описать
// литеру и котельную по-разному.
export function assetValues(typeId, ocId, oiId) {
  const assets = taskState(typeId, ocId).assets;
  const k = oiId || '';
  if (!assets.has(k)) assets.set(k, {});
  return assets.get(k);
}

// --- кто осматривает ------------------------------------------------------
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: осмотрщик — это вошедший пользователь, и выбора здесь
// нет. В макете человека выбирают, иначе экран пуст: демо-данные назначены
// реальным фамилиям, а сессия по умолчанию — «Осминов Н.», у которого осмотров
// нет. Выбор держим на странице, а не в сессии: смена сессии перекрасила бы
// весь остальной интерфейс.
let viewAs = null;

export function inspectorsInData() {
  const names = new Map();
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: 100000 });
    res.rows.forEach((s) => {
      const who = (s.resp && s.resp.insp) || '';
      if (who) names.set(who, (names.get(who) || 0) + 1);
    });
  });
  return [...names.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

export function currentInspector() {
  if (viewAs) return viewAs;

  // Сначала человек из сессии: если осмотры на него есть, показываем его.
  const me = session.state.person;
  const list = inspectorsInData();
  if (list.some((x) => x.name === me)) return me;

  return list.length ? list[0].name : me;
}

export function setInspector(name) {
  viewAs = name || null;
}

// --- список задач ---------------------------------------------------------

// Ждущие осмотра — вперёд: экран открывают, чтобы поехать, а не чтобы читать
// историю. Внутри группы порядок по дате обновления, свежие сверху.
function order(a, b) {
  if (a.pending !== b.pending) return a.pending ? -1 : 1;
  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}

export function myTasks({ onlyPending = false } = {}) {
  const person = currentInspector();
  const out = [];

  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({
      filter: { mine: { role: 'insp', person } },
      offset: 0,
      limit: 100000,
    });

    res.rows.forEach((s) => {
      const st = taskState(s.typeId, s.id);
      out.push({
        key: key(s.typeId, s.id),
        typeId: s.typeId,
        ocId: s.id,
        typeLabel: s.typeLabel,
        title: s.title,
        eni: s.eniAll || s.eni,
        status: s.status,
        institution: s.institution,
        updatedAt: s.updatedAt,
        oiCount: (s.metrics && s.metrics.oiCount) || 0,
        pendingNotes: (s.metrics && s.metrics.pendingNotes) || 0,
        pending: s.status === READY_STATUS && !st.done,
        photos: st.photos.length,
        done: st.done,
      });
    });
  });

  out.sort(order);
  return onlyPending ? out.filter((x) => x.pending) : out;
}

// Полная запись нужна на экране задачи: координаты, примечания, документы и
// перечень ОИ в сводке лежат в записи, а не в её сводке для реестра.
export function loadTask(typeId, ocId) {
  const t = getType(typeId);
  if (!t || !t.records.loadRecord) return null;
  return t.records.loadRecord(ocId) || null;
}

// Документы на осмотр — все, что есть у записи: и её собственные, и документы
// её объектов имущества. На месте осмотрщику нужны и гос. акт участка, и
// техпаспорт литеры; раскладывать их по разным экранам значит заставить его
// искать. У каждого документа помечаем, чей он, — иначе непонятно, к какой
// литере относится техпаспорт.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь будет ВЫБОРКА, назначенная региональным
// менеджером (решение пользователя 08.09.2026 — осмотрщик видит документы,
// которые ему назначили), а не всё, что есть у записи.
export function taskDocs(rec) {
  const out = [];

  (rec.docs || []).forEach((d) => out.push({ doc: d, owner: 'Объект оценки' }));

  (rec.oi || []).forEach((o) => {
    (o.docs || []).forEach((d) => out.push({ doc: d, owner: oiLabel(o) }));
  });

  return out;
}

// Подпись объекта имущества — то, чем осмотрщик его называет вслух. Нужна и
// фотографиям, и документам: снимок без литеры бесполезен, а «паспорт котла»
// без указания котла не найти (требование пользователя 08.09.2026).
//
// Транспортных средств в макете пока нет отдельным видом ОИ, но когда они
// появятся, они попадут в тот же перечень — подпись считается по виду
// карточки, а не по заранее перечисленным типам.
export function oiLabel(oi) {
  if (!oi) return 'Объект имущества';

  // Наименование не повторяем, если оно совпадает с видом: у участка name
  // обычно и есть «Земельный участок», и подпись задваивалась.
  const raw = String(oi.name || '').trim();
  const same = (kind) => raw.toLowerCase() === kind.toLowerCase();
  const name = raw;

  if (oi.card === 'building') {
    const head = oi.letter ? 'Литера ' + oi.letter : 'Строение';
    return same(head) ? head : [head, name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'apartment') {
    return ['Квартира' + (oi.flat ? ' №' + oi.flat : ''), name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'land') {
    return same('Земельный участок') ? 'Земельный участок'
      : ['Земельный участок', name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'movable') {
    const kind = oi.kind === 'ОФИС' ? 'Офисная техника'
      : oi.kind === 'ТС' ? 'Транспортное средство' : 'Механизм';
    return [kind, name, oi.serial].filter(Boolean).join(' · ');
  }

  return name || 'Объект имущества';
}

// Список ОИ записи для выбора: к чему привязать снимок.
export function oiOptions(rec) {
  return (rec.oi || []).map((o) => ({ id: o.id, label: oiLabel(o) }));
}

// --- фото -----------------------------------------------------------------

let photoSeq = 0;

export function addPhoto(typeId, ocId, file, { oiId = '', cat = '' } = {}) {
  const st = taskState(typeId, ocId);
  if (st.photos.length >= PHOTO_LIMIT) return { error: `Больше ${PHOTO_LIMIT} снимков на осмотр не нужно` };

  const url = URL.createObjectURL(file);
  const photo = {
    id: 'ph-' + (++photoSeq),
    name: file.name || 'снимок',
    // К какому объекту имущества относится снимок. Без этого фото кровли не
    // отличить от фото кровли соседней литеры.
    oiId,
    cat: cat || PHOTO_CATS[0],
    url,
    size: file.size,
    // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: координаты снимка ТЗ требует для каждого фото. В
    // браузере их можно взять либо из EXIF файла, либо у геолокации устройства
    // в момент съёмки; и то и другое — работа сервера и приложения, а не
    // макета. Пока пишем координаты объекта: они показывают, как поле
    // выглядит и куда встанет.
    gps: '',
    at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };

  st.photos.push(photo);
  return { photo };
}

export function removePhoto(typeId, ocId, id) {
  const st = taskState(typeId, ocId);
  const i = st.photos.findIndex((p) => p.id === id);
  if (i < 0) return;
  // Ссылку освобождаем сразу: снимков за смену набирается много, и держать
  // выброшенные blob'ы в памяти телефона незачем.
  try { URL.revokeObjectURL(st.photos[i].url); } catch (e) { /* уже отозвана */ }
  st.photos.splice(i, 1);
}

// Перенос снимка — прямое требование ТЗ («должна быть предусмотрена
// возможность переноса фото в другую позицию»). Переносить можно и в другую
// категорию, и к другому объекту имущества: на осмотре легко снять кровлю и
// приписать её соседней литере.
export function movePhoto(typeId, ocId, id, patch = {}) {
  const p = taskState(typeId, ocId).photos.find((x) => x.id === id);
  if (!p) return;
  if (patch.cat !== undefined) p.cat = patch.cat;
  if (patch.oiId !== undefined) p.oiId = patch.oiId;
}

export function photoById(typeId, ocId, id) {
  return taskState(typeId, ocId).photos.find((x) => x.id === id) || null;
}

// Снимки сгруппированы по объекту имущества, а внутри — по категории: именно
// так их потом разбирают в отчёте, и так же их ищет сам осмотрщик («где у меня
// кровля литеры Б»).
export function photoGroups(rec, typeId, ocId) {
  const st = taskState(typeId, ocId);
  const byOi = new Map();

  st.photos.forEach((p) => {
    const oi = (rec.oi || []).find((o) => o.id === p.oiId);
    const key = p.oiId || '';
    if (!byOi.has(key)) {
      byOi.set(key, { label: oi ? oiLabel(oi) : 'Без привязки к объекту', cats: new Map() });
    }
    const cats = byOi.get(key).cats;
    if (!cats.has(p.cat)) cats.set(p.cat, []);
    cats.get(p.cat).push(p);
  });

  return byOi;
}
