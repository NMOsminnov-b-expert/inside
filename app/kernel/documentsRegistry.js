// Реестр «Документы» — общесистемная вкладка сайдбара (решение пользователя
// 2026-09-02): документ здесь существует сам по себе (файл + карточка) и не
// обязан относиться к объекту оценки. Это НЕ то же самое, что документы внутри
// карточки ОЦ/ОИ (modules/*/parts/docs/*) и НЕ архив (kernel/archive.js —
// «открепили от карточки, но не удалили»): реестр не зависит от типов ОЦ и не
// собирает данные из модулей.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: документы здесь живут в памяти вкладки одним массивом.
// На сервере это отдельное хранилище со своей моделью прав (сейчас реестр
// виден всем без ограничений — решение пользователя «вкладка, где будут
// храниться все документы из всех организаций»).
import { fileKindOf } from './fileUpload.js';

export const DOC_TYPES = [
  'Генплан', 'Госакт на земельный участок', 'Договор аренды', 'Договор дарения',
  'Договор купли-продажи', 'Завещание', 'Инвентаризационный список',
  'ОСВ (оборотно-сальдовая ведомость)', 'Планировка', 'Решение суда',
  'Свидетельство о праве собственности', 'Техпаспорт', 'Фотоматериалы', 'Прочее',
];

// «Загружен» — по умолчанию при создании (автоматически). «Проверен»/«Не
// валиден» — решение сотрудника после проверки. «Нечитабелен» может выставить
// как сотрудник, так и авто-проверка файла при загрузке (см. detectAutoStatus).
export const DOC_STATUSES = ['Загружен', 'Проверен', 'Нечитабелен', 'Не валиден'];

// Пытаемся понять на лету, что файл битый — чтобы «Нечитабелен» можно было
// проставить автоматически, а не только руками. Полноценной проверки без
// реального разбора формата не бывает, поэтому это дешёвая эвристика:
// картинку пробуем отрисовать, PDF проверяем по магической подписи «%PDF-» в
// первых байтах. Для остальных типов файлов проверки нет — «Загружен».
export async function detectAutoStatus(file) {
  if (!file) return DOC_STATUSES[0];
  const kind = fileKindOf(file.type);

  if (kind === 'pdf') {
    try {
      const head = await file.slice(0, 5).text();
      return head === '%PDF-' ? 'Загружен' : 'Нечитабелен';
    } catch {
      return 'Загружен';
    }
  }

  if (kind === 'image') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve('Загружен'); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve('Нечитабелен'); };
      img.src = url;
    });
  }

  return 'Загружен';
}

// Цвет статус-точки в списке и на карточке документа — один источник, чтобы
// список и карточка не разъезжались в раскраске.
export function statusTone(status) {
  if (status === 'Проверен') return 'tone-good';
  if (status === 'Нечитабелен') return 'tone-bad';
  if (status === 'Не валиден') return 'tone-warn';
  return 'tone-ok'; // Загружен
}

let seq = 0;
const nextId = (prefix) => prefix + '-' + (++seq);

// Орган регистрации, дата регистрации и назначение документа — поля из ветки
// kirill. В синтетике заполняем правдоподобно, иначе три столбца реестра стоят
// пустыми и по ним нечего ни искать, ни сортировать.
//
// «Принадлежность» — условное обозначение НАЗНАЧЕНИЯ документа (пользователь
// 03.09.2026): передача в коммунальную собственность, изъятие актива и т. п.
// Поэтому значение зависит от типа документа, а не от учреждения.
const REG_AUTHORITY = {
  'Техпаспорт': 'Госрегистр КР, районное БТИ',
  'Свидетельство о праве собственности': 'Госрегистр КР',
  'Госакт на земельный участок': 'Госрегистр КР',
  'Завещание': 'Нотариальная контора',
  'Прочее': '',
};

const AFFILIATION = {
  'Техпаспорт': 'Техническая инвентаризация объекта',
  'Свидетельство о праве собственности': 'Передача в коммунальную собственность',
  'Госакт на земельный участок': 'Закрепление участка за учреждением',
  'Завещание': 'Переход права по наследству',
  'Прочее': 'Изъятие актива',
};

// Регистрация идёт после самого документа: дата берётся со сдвигом вперёд.
// Сдвиг детерминированный (по позиции в списке), чтобы данные макета не
// менялись от запуска к запуску.
const numberPrefix = (type) => ({
  'Техпаспорт': 'ТП',
  'Свидетельство о праве собственности': 'СВ',
  'Госакт на земельный участок': 'ГА',
  'Завещание': 'ЗВ',
}[type] || 'ДК');

function regDateFrom(date, i) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + 14 + (i % 5) * 21);
  return d.toISOString().slice(0, 10);
}

function seedDocuments() {
  // По мотивам присланного пользователем скриншота: реальных файлов нет
  // (демо-записи), статус у всех «Загружен».
  const rows = [
    { type: 'Прочее', institution: 'Государство' },
    { type: 'Завещание', institution: 'Министерство для теста', date: '2026-08-05' },
    { type: 'Завещание', institution: 'Министерство для теста' },
    { type: 'Техпаспорт', institution: 'Министерство труда, социального обеспечения и миграции КР', date: '2011-08-15' },
    { type: 'Техпаспорт', institution: 'Министерство труда, социального обеспечения и миграции КР', date: '2010-08-08' },
    { type: 'Техпаспорт', institution: 'Министерство труда, социального обеспечения и миграции КР', date: '2006-12-11' },
    { type: 'Техпаспорт', institution: 'Министерство труда, социального обеспечения и миграции КР', date: '2006-03-28' },
    { type: 'Техпаспорт', institution: 'Министерство труда, социального обеспечения и миграции КР', date: '2010-03-15' },
    { type: 'Техпаспорт', institution: 'Токтогульское ССУ «Кара-Каш» общего типа для пожилых и ЛОВЗ', date: '2023-12-08' },
    { type: 'Техпаспорт', institution: 'Сулюктинское ССУ общего типа для пожилых и ЛОВЗ', date: '2023-04-04' },
    { type: 'Техпаспорт', institution: 'Сузакское ССУ общего типа для пожилых и ЛОВЗ', date: '2009-03-30' },
    { type: 'Техпаспорт', institution: 'Нижне-Серафимовское ССУ общего типа для пожилых и ЛОВЗ', date: '2009-09-15' },
    { type: 'Техпаспорт', institution: 'Сокулукский реабилитационный центр для ЛОВЗ, в т.ч. для детей ОВЗ', date: '2017-09-22' },
    { type: 'Техпаспорт', institution: 'Бакай-Атинское ССУ общего типа для пожилых и ЛОВЗ', date: '2009-03-04' },
    { type: 'Техпаспорт', institution: 'Покровский центр социальной помощи семье и детям, находящимся в трудной жизненной ситуации', date: '2010-04-05' },
    { type: 'Техпаспорт', institution: 'Покровский центр социальной помощи семье и детям, находящимся в трудной жизненной ситуации', date: '2010-04-05' },
    { type: 'Техпаспорт', institution: 'Покровский центр социальной помощи семье и детям, находящимся в трудной жизненной ситуации', date: '2010-04-05' },
    { type: 'Свидетельство о праве собственности', institution: 'Министерство труда, социального обеспечения и миграции КР', date: '2015-06-02' },
    { type: 'Госакт на земельный участок', institution: 'Государство', date: '2012-02-14' },
  ];

  return rows.map((r, i) => ({
    id: nextId('doc'),
    type: r.type,
    // Номер тоже был пустым у всех записей — по пустому столбцу не видно ни
    // поиска, ни сортировки. Формат условный: серия по типу и порядковый номер.
    number: r.type === 'Прочее' ? '' : `${numberPrefix(r.type)}-${1000 + i * 7}`,
    date: r.date || '',
    status: DOC_STATUSES[0],
    files: [],
    owner: '',
    institution: r.institution,
<<<<<<< HEAD
    regAuthority: '',
    regDate: '',
    affiliation: '',
=======
    regAuthority: REG_AUTHORITY[r.type] || '',
    regDate: regDateFrom(r.date, i),
    affiliation: AFFILIATION[r.type] || '',
>>>>>>> 0de8378df4a674c22c6d7026709d648ee3e9a48d
    linkedObjects: [],
  }));
}

const documents = seedDocuments();

// Только «настоящие» поля документа — черновик формы попутно тащит служебные
// (_statusTouched/_err), их в запись класть нельзя.
function sanitize(data) {
  return {
    type: data.type || '',
    number: data.number || '',
    date: data.date || '',
    status: data.status || DOC_STATUSES[0],
    files: (data.files || []).map((f) => (f.id ? f : { ...f, id: nextId('file') })),
    owner: data.owner || '',
    institution: data.institution || '',
    regAuthority: data.regAuthority || '',
    regDate: data.regDate || '',
    affiliation: data.affiliation || '',
    linkedObjects: (data.linkedObjects || []).map((l) => (l.id ? l : { ...l, id: nextId('link') })),
  };
}

export function createDocument(data) {
  const doc = { id: nextId('doc'), ...sanitize(data) };
  documents.unshift(doc);
  return doc;
}

export function updateDocument(id, patch) {
  const doc = documents.find((d) => d.id === id);
  if (!doc) return null;
  Object.assign(doc, sanitize({ ...doc, ...patch }));
  return doc;
}

export function removeDocument(id) {
  const i = documents.findIndex((d) => d.id === id);
  if (i < 0) return false;
  documents.splice(i, 1);
  return true;
}

export function getDocument(id) {
  return documents.find((d) => d.id === id) || null;
}

// --- Файлы и привязка к объектам оценки — правки одного документа ----------

export function addFile(docId, file) {
  const doc = getDocument(docId);
  if (!doc) return null;
  const f = { ...file, id: nextId('file') };
  doc.files = doc.files || [];
  doc.files.push(f);
  return f;
}

export function removeFile(docId, fileId) {
  const doc = getDocument(docId);
  if (!doc) return false;
  const i = (doc.files || []).findIndex((f) => f.id === fileId);
  if (i < 0) return false;
  doc.files.splice(i, 1);
  return true;
}

// link: { type: 'ОЦ'|'ОИ', eni, letter } — свободный ввод, а не живая ссылка на
// запись модуля: реестр документов не зависит от типов ОЦ (решение пользователя
// 2026-09-02), поэтому это просто заметка «к чему относится», а не выбор из
// реестра ОЦ.
export function addLink(docId, link) {
  const doc = getDocument(docId);
  if (!doc) return null;
  const l = { id: nextId('link'), type: link.type || 'ОЦ', eni: link.eni || '', letter: link.letter || '' };
  doc.linkedObjects = doc.linkedObjects || [];
  doc.linkedObjects.push(l);
  return l;
}

export function removeLink(docId, linkId) {
  const doc = getDocument(docId);
  if (!doc) return false;
  const i = (doc.linkedObjects || []).findIndex((l) => l.id === linkId);
  if (i < 0) return false;
  doc.linkedObjects.splice(i, 1);
  return true;
}

function matchText(doc, q) {
  if (!q) return true;
<<<<<<< HEAD
  const hay = [
    doc.type, doc.number, doc.date, doc.owner, doc.institution,
    doc.regAuthority, doc.regDate, doc.affiliation,
    ...(doc.files || []).map((f) => f.name),
  ].filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// Значение документа для сортировки по клику на шапку колонки (docs.js) —
// один источник для всех сортируемых столбцов таблицы.
export function docColumnValue(doc, key) {
  if (key === 'name') return `${doc.type || ''} ${(doc.files || []).map((f) => f.name).join(' ')}`;
  return doc[key] || '';
}

// sort: { key, dir } — dir: 'asc'|'desc'. Даты хранятся строкой YYYY-MM-DD,
// поэтому обычное сравнение строк уже сортирует их хронологически — отдельная
// ветка для дат не нужна, тот же localeCompare годится и для дат, и для текста.
function sortDocuments(list, sort) {
  if (!sort || !sort.key) return list;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return list.slice().sort((a, b) => docColumnValue(a, sort.key).localeCompare(docColumnValue(b, sort.key), 'ru') * dir);
}

// filter: { q, type, status, sort, offset, limit }
export function queryDocuments({ q = '', type = '', status = '', sort = null, offset = 0, limit = 25 } = {}) {
  const filtered = documents.filter((d) => (!type || d.type === type) && (!status || d.status === status) && matchText(d, q));
  const sorted = sortDocuments(filtered, sort);
  return { rows: sorted.slice(offset, offset + limit), total: sorted.length };
=======
  // Наименование в списке складывается из типа и имени файла, поэтому в поиск
  // входят оба — искать по тому, что человек видит в столбце.
  const hay = [doc.type, doc.number, doc.date, doc.owner, doc.institution,
    doc.regAuthority, doc.regDate, doc.affiliation,
    ...(doc.files || []).map((f) => f.name)]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// Список учреждений, встречающихся в документах, — для фильтра «от кого».
// Собираем из самих записей, а не из отдельного справочника: реестр документов
// ни от чего не зависит, и учреждение здесь — свободный текст.
export function documentInstitutions() {
  const set = new Set();
  documents.forEach((d) => { if (d.institution) set.add(d.institution); });
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

// Даты хранятся строкой ГГГГ-ММ-ДД, поэтому сравниваются как строки. Документ
// без даты не попадает в выборку по периоду: «дата не указана» — это не «дата
// внутри периода».
function matchDate(doc, from, to) {
  if (!from && !to) return true;
  if (!doc.date) return false;
  if (from && doc.date < from) return false;
  if (to && doc.date > to) return false;
  return true;
}

const SORTABLE = {
  type: (d) => d.type || '',
  name: (d) => ((d.files || [])[0] || {}).name || '',
  number: (d) => d.number || '',
  date: (d) => d.date || '',
  institution: (d) => d.institution || '',
  regAuthority: (d) => d.regAuthority || '',
  regDate: (d) => d.regDate || '',
  affiliation: (d) => d.affiliation || '',
  status: (d) => d.status || '',
};

// filter: { q, type, status, institution, dateFrom, dateTo, sort, dir, offset, limit }
export function queryDocuments({
  q = '', type = '', status = '', institution = '', dateFrom = '', dateTo = '',
  sort = '', dir = 'asc', offset = 0, limit = 25,
} = {}) {
  const filtered = documents.filter((d) => (!type || d.type === type)
    && (!status || d.status === status)
    && (!institution || d.institution === institution)
    && matchDate(d, dateFrom, dateTo)
    && matchText(d, q));

  const key = SORTABLE[sort];
  if (key) {
    const sign = dir === 'desc' ? -1 : 1;
    // Пустые значения всегда внизу: иначе при сортировке по дате сверху
    // оказывается десяток документов без даты, и список бесполезен.
    filtered.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (!x !== !y) return x ? -1 : 1;
      return sign * String(x).localeCompare(String(y), 'ru', { numeric: true });
    });
  }

  return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
>>>>>>> 0de8378df4a674c22c6d7026709d648ee3e9a48d
}

export function documentStats() {
  const stats = { total: documents.length };
  DOC_STATUSES.forEach((s) => { stats[s] = 0; });
  documents.forEach((d) => { stats[d.status] = (stats[d.status] || 0) + 1; });
  return stats;
}
