// Смена типа объекта оценки и вида объекта имущества
// (ТЗ docs/tz/30-uchastok-pravki.md §9).
//
// Что это на самом деле. Тип ОЦ — не поле записи, а МОДУЛЬ, в котором она
// живёт: пять модулей изолированы друг от друга, у каждого свой список записей
// (data/store.js), свой реестр карточек ОИ и свои перечни. Поэтому смена типа —
// переезд записи между модулями, а не правка значения в форме.
//
// Переезд опирается на то, что уже сделано для архива: takeRecord (изъять
// запись, отдав содержимое) и restoreRecord (принять запись с тем же
// идентификатором). Идентификатор сохраняется намеренно: на него ссылаются
// документы реестра, привязки и лог действий.
//
// Данные, которых нет в новой карточке, НЕ стираются: они остаются в записи и
// возвращаются, если тип сменят обратно. Об этом прямо говорится в диалоге —
// иначе человек не решится нажать.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь переезд — это перенос объекта между списками в
// памяти вкладки. На сервере запись типа ОЦ лежит в своей таблице (или в общей
// с признаком типа), и смена типа станет либо обновлением признака, либо
// транзакцией «перенести запись и все связанные сущности». Выбор за теми, кто
// будет делать серверную часть; важно одно — операция должна быть атомарной,
// иначе объект потеряется между типами.
import { sortedTypes, getType } from './registry.js';

// Поля, которые есть у любой записи независимо от типа: их сравнивать
// бессмысленно — они переносятся всегда.
const ALWAYS = new Set([
  'id', 'typeId', 'type', 'category', 'residential', 'eni', 'address', 'city',
  'gps', 'status', 'institution', 'podved', 'complex', 'updatedAt', 'owners',
  'users', 'resp', 'notes', 'docs', 'oi', 'archive', 'audit', 'log',
  'specials', 'flags', 'eniIndex', 'nodeId',
]);

export function ocTypes() {
  return sortedTypes().map((t) => ({ id: t.manifest.id, label: t.manifest.label }));
}

// Образец записи нового типа — по живой записи этого модуля. Создавать новую
// нельзя: createRecord кладёт её в список, и в реестре появился бы мусор.
function sampleOf(typeId) {
  const type = getType(typeId);
  const list = type && type.records.allRecords ? type.records.allRecords() : [];
  return list[0] || null;
}

// Подпись поля спрашиваем У МОДУЛЯ и обязательно с видом карточки: подписи
// полей участка и строения лежат в разделах по карточкам (audit/fieldLabels.js),
// и без вида карточки функция возвращает сам ключ — то есть код вместо названия.
function labelOf(typeId, key, card) {
  const type = getType(typeId);
  const fn = type && type.records.fieldLabel;
  return (fn && fn(key, card)) || key;
}

// Значение для показа: списки и объекты в диалоге не нужны — важно, что поле
// заполнено и его не будет видно.
function shownValue(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.length ? `${v.length} знач.` : '';
  if (typeof v === 'object') return '';
  return String(v);
}

// Что не покажется в новом типе.
//
// ВАЖНО, где именно искать потери: набор полей самой записи ОЦ одинаков у всех
// пяти типов (проверено на данных 04.09.2026) — различаются КАРТОЧКИ ОБЪЕКТОВ
// ИМУЩЕСТВА. Литера жилого дома хранит лоджии, балконы, тип мансарды, вид
// конструктива и права; в карточке гражданского здания этих полей нет. Поэтому
// считать потери только по записи — значит всегда показывать пустое
// предупреждение, то есть не предупреждать вовсе.
function diffKeys(obj, sample, typeId, card) {
  if (!sample) return [];
  return Object.keys(obj)
    .filter((key) => !ALWAYS.has(key) && !(key in sample))
    .map((key) => ({ key, label: labelOf(typeId, key, card), value: shownValue(obj[key]) }))
    // Ключ без человеческой подписи не показываем: код в интерфейсе хуже, чем
    // умолчание (docs/tz/20-arhiv.md §8.3).
    .filter((f) => f.value !== '' && f.label !== f.key);
}

export function lostFields(rec, toTypeId) {
  return diffKeys(rec, sampleOf(toTypeId), rec.typeId);
}

// Набор полей, которые карточка нового типа реально показывает у этого вида
// ОИ. Считается объединением по ВСЕМ живым объектам такого вида: одна запись
// заполнена наполовину, другая полностью, и по одной судить нельзя — именно на
// этом первый заход и врал, объявляя «потерянными» просто незаполненные поля.
function oiFieldsOf(toTypeId, card) {
  const type = getType(toTypeId);
  const records = (type && type.records.allRecords && type.records.allRecords()) || [];

  const keys = new Set();
  let found = false;
  records.forEach((r) => (r.oi || []).forEach((o) => {
    if (o.card !== card) return;
    found = true;
    Object.keys(o).forEach((k) => keys.add(k));
  }));

  return found ? keys : null;
}

// Есть ли в новом типе карточка такого вида. Берётся из реестра карточек
// модуля, а не из живых данных: карточка может существовать, даже если ни один
// объект этого вида пока не заведён.
function hasCard(toTypeId, card) {
  const type = getType(toTypeId);
  const cards = (type && type.records.oiCards) || null;
  return cards ? !!cards[card] : true;
}

// Одна ли и та же карточка вида ОИ у двух типов. Реестр карточек грузится
// лениво (`load: () => import(...)`), поэтому проверка асинхронная: сравниваем
// саму функцию отрисовки. Если карточка одна (как у земельного участка,
// который все модули импортируют из land-plot), то при смене типа она покажет
// ровно те же поля — и говорить о потерях неправда.
async function sameCard(fromTypeId, toTypeId, card) {
  const a = (getType(fromTypeId) || {}).records;
  const b = (getType(toTypeId) || {}).records;
  const ca = a && a.oiCards && a.oiCards[card];
  const cb = b && b.oiCards && b.oiCards[card];
  if (!ca || !cb || !ca.load || !cb.load) return false;

  try {
    const [ma, mb] = await Promise.all([ca.load(), cb.load()]);
    return !!(ma && mb && ma.card && mb.card && ma.card.render === mb.card.render);
  } catch (e) {
    return false;
  }
}

// Потери по объектам имущества записи. Одинаковые поля разных литер не
// перечисляются по многу раз: человеку важно, ЧТО не покажется, а не у скольких
// литер сразу.
export async function lostOiFieldsOfRecord(rec, toTypeId) {
  const byLabel = new Map();
  const missingCards = new Map();

  for (const oi of (rec.oi || [])) {
    if (!hasCard(toTypeId, oi.card)) {
      missingCards.set(oi.card, {
        key: 'card:' + oi.card,
        label: `Объект имущества «${oi.name || oi.letter || oi.card}»`,
        value: 'в новом типе для него нет карточки',
      });
      continue;
    }

    // Карточка та же самая — терять нечего.
    // eslint-disable-next-line no-await-in-loop
    if (await sameCard(rec.typeId, toTypeId, oi.card)) continue;

    const fields = oiFieldsOf(toTypeId, oi.card);
    if (!fields) continue;   // объектов такого вида ещё нет — сравнивать не с чем

    Object.keys(oi).forEach((key) => {
      if (ALWAYS.has(key) || fields.has(key)) return;
      const value = shownValue(oi[key]);
      if (!value) return;

      const label = labelOf(rec.typeId, key, oi.card);
      // Ключ без человеческой подписи в интерфейс не выводим: показать код
      // хуже, чем не показать ничего (docs/tz/20-arhiv.md §8.3).
      if (label === key) {
        byLabel.set('__unnamed__', {
          key: '__unnamed__',
          label: '',
          value: '',
          unnamed: (byLabel.get('__unnamed__') || { unnamed: 0 }).unnamed + 1,
        });
        return;
      }
      if (!byLabel.has(label)) byLabel.set(label, { key, label, value });
    });
  }

  return [...missingCards.values(), ...byLabel.values()];
}

// Сводка для диалога подтверждения.
export async function previewOcTypeChange(rec, toTypeId) {
  const to = getType(toTypeId);
  const docs = (rec.docs || []).length
    + (rec.oi || []).reduce((n, o) => n + ((o.docs || []).length), 0);

  return {
    toLabel: to ? to.manifest.label : toTypeId,
    oiCount: (rec.oi || []).length,
    docs,
    lost: [...lostFields(rec, toTypeId), ...(await lostOiFieldsOfRecord(rec, toTypeId))],
  };
}

// Сменить тип объекта оценки: переезд записи между модулями.
// Возвращает { rec, moved } либо null, если что-то из модулей недоступно.
export function changeOcType(rec, toTypeId) {
  const from = getType(rec.typeId);
  const to = getType(toTypeId);
  if (!from || !to || rec.typeId === toTypeId) return null;
  if (!from.records.takeRecord || !to.records.restoreRecord) return null;

  const taken = from.records.takeRecord(rec.id);
  if (!taken) return null;

  taken.typeId = toTypeId;
  taken.type = to.manifest.label;
  // Категория (недвижимое/движимое) идёт от нового типа: у движимого своя
  // карточка, и оставлять чужую пометку нельзя.
  if (to.manifest.category) taken.category = to.manifest.category;
  taken.updatedAt = new Date().toISOString().slice(0, 10);

  to.records.restoreRecord(taken);
  return { rec: taken, moved: (taken.oi || []).length };
}

// --- вид объекта имущества ------------------------------------------------

// Виды ОИ берутся у модуля: список общий по составу, но лежит в data/rules.js
// каждого модуля (ядро не знает ни одного вида ОИ).
export function oiKinds(typeId) {
  const type = getType(typeId);
  const list = (type && type.records.oiTypes) || [];
  return list.map((t) => ({ label: t.label, card: t.card }));
}

// Что не покажется у ОИ после смены вида: сравниваем с живым ОИ того же вида
// в этом же типе ОЦ.
export function lostOiFields(rec, oi, toCard, typeId) {
  const type = getType(typeId);
  const records = (type && type.records.allRecords && type.records.allRecords()) || [];

  let sample = null;
  records.some((r) => (r.oi || []).some((o) => {
    if (o.card === toCard && o.id !== oi.id) { sample = o; return true; }
    return false;
  }));
  if (!sample) return [];

  return Object.keys(oi)
    .filter((key) => !ALWAYS.has(key) && !(key in sample))
    .map((key) => ({ key, label: labelOf(typeId, key), value: shownValue(oi[key]) }))
    .filter((f) => f.value !== '');
}

// Сменить вид ОИ внутри объекта. Данные не стираются: карточка нового вида
// просто не показывает лишние поля, а при возврате прежнего вида они снова
// видны.
export function changeOiKind(oi, toCard, toLabel) {
  if (!oi || oi.card === toCard) return null;
  oi.card = toCard;
  oi.name = toLabel || oi.name;
  return oi;
}
