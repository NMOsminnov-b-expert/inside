// Справочники — перечни допустимых значений для полей с выбором.
//
// До этого перечни жили только в коде (modules/*/data/dictionaries.js): чтобы
// добавить материал стены, нужен был разработчик. Теперь ими управляют из
// раздела «Справочники» (docs/tz/10-spravochniki.md).
//
// Ядро по-прежнему не знает ни одного типа ОЦ: состав собирается через реестр
// (registry.js), а каждый модуль описывает свои перечни в data/dictExport.js.
//
// Решения пользователя 02.09.2026, на которых стоит модель:
//   * ОДНО ПОЛЕ — ОДИН СПРАВОЧНИК, всегда: «у каждого ОЦ ОИ на каждое поле по
//     своему уникальному справочнику». Ссылок на общий перечень нет.
//   * Взамен есть СВЯЗАННЫЕ справочники: те, что привязаны к одноимённым полям
//     разных типов ОЦ («Фундамент» у гражданского, производственного, жилого).
//     Правку значения можно применить сразу ко всем выбранным связанным — это и
//     есть синхронизация перечней вместо общего справочника.
//   * Каталоги жёсткие: тип ОЦ → тип ОИ. Вручную не создаются — структура
//     повторяет саму систему, и справочник лежит там, где применяется.
//   * Внутри типа ОИ бывают ПАПКИ: конструктивный состав — это восемь
//     отдельных полей карточки (фундамент, стены, полы…), одним справочником
//     их не описать, а вываливать вперемешку с остальными — мешанина.
//   * Перенос в другой каталог перевешивает привязку на поле с ТЕМ ЖЕ КЛЮЧОМ.
//     По названию справочника ничего не угадывается: если ключа в каталоге нет,
//     экран показывает поля и ждёт выбора, ничего не меняя до ответа.
//   * Внутри каталога сначала обычные справочники, потом системные — вперемешку
//     они сбивают.
//   * Значение, которое нигде не используется, удаляется сразу; используемое —
//     только с заменой (замена на новое название равна переименованию).
//   * Правят администратор и роль «любая».
//   * История — строкой в общем логе действий, версий и отката нет.
import { sortedTypes } from './registry.js';
import { session, seesEverything } from './session.js';
import { createStore } from './store.js';

export const CARD_LABEL = {
  oc: 'Объект оценки',
  building: 'Литера (строение)',
  apartment: 'Квартира',
  land: 'Земельный участок',
  movable: 'Движимое имущество',
};

// Порядок карточек в каталоге: сначала сам объект оценки, потом его части.
const CARD_ORDER = ['oc', 'building', 'apartment', 'land', 'movable'];

// --- состояние -------------------------------------------------------------
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: справочники живут в памяти вкладки и собираются заново
// при перезагрузке. На сервере это отдельная таблица с правами на изменение;
// карточки читают её на каждом открытии, а меняется она редко — просится кэш
// на клиенте с инвалидацией по времени правки.
export const dicts = createStore({ list: null });

let seq = 0;
const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, '0')}`;

const today = () => new Date().toISOString().slice(0, 10).split('-').reverse().join('.');

// --- разбор значений перечня ----------------------------------------------

// Перечни в модулях устроены по-разному: плоский список строк, объект
// «раздел → значения» (конструктивный состав), список групп с вложенными
// значениями (благоустройство, категории ОИ) и одиночный объект. Разбираем по
// форме данных — иначе в таблице появляется «[object Object]».
function makeItems(values, kind, groupLabels) {
  if (kind === 'group' && values && !Array.isArray(values)) {
    const out = [];
    Object.entries(values).forEach(([key, list]) => {
      // Разделы в данных названы по-английски (foundation, wallsExt); оценщику
      // показываем ту же подпись, что стоит в карточке литеры.
      const group = (groupLabels && groupLabels[key]) || key;
      (list || []).forEach((value) => {
        out.push({ id: nextId('it'), value, group, groupKey: key, note: '', order: out.length });
      });
    });
    return out;
  }

  if (Array.isArray(values) && values.every((v) => typeof v === 'string')) {
    return values.map((value, i) => ({
      id: nextId('it'), value, group: '', note: '', order: i,
    }));
  }

  if (Array.isArray(values)) {
    const out = [];
    values.forEach((entry) => {
      if (typeof entry === 'string') {
        out.push({ id: nextId('it'), value: entry, group: '', note: '', order: out.length });
        return;
      }
      const group = entry.label || entry.key || '';
      const nested = entry.options || entry.classes;
      if (Array.isArray(nested) && nested.length) {
        nested.forEach((value) => {
          out.push({ id: nextId('it'), value, group, groupKey: entry.key, note: '', order: out.length });
        });
      } else {
        // Группа без вложенных значений — сама и есть значение.
        out.push({ id: nextId('it'), value: group, group: '', groupKey: entry.key, note: '', order: out.length });
      }
    });
    return out;
  }

  if (values && typeof values === 'object') {
    return [{ id: nextId('it'), value: values.label || values.key || '', group: '',
      groupKey: values.key, note: '', order: 0 }];
  }

  return [];
}

// --- сборка ----------------------------------------------------------------

// Один справочник на каждую точку подключения. «Отопление» у квартиры и у
// литеры — два разных справочника: правки независимы, и сразу видно, где что
// применяется. Общий перечень на несколько полей больше не собирается.
function build() {
  const list = [];

  sortedTypes().forEach((type) => {
    const sources = type.dictExport && type.dictExport.DICT_SOURCES;
    if (!sources) return;

    sources.forEach((src) => {
      (src.slots || []).forEach((slot) => {
        list.push({
          id: nextId('dict'),
          sourceKey: src.key,
          // Имя по умолчанию — подпись поля: справочник и есть перечень для
          // этого поля, придумывать ему отдельное название незачем.
          name: slot.label,
          note: '',
          kind: src.kind,
          system: !!src.system,
          // Папка внутри каталога. Модуль называет её у тех перечней, которые
          // без группировки читались бы мешаниной (конструктивный состав).
          folder: src.folder || '',
          items: makeItems(src.values, src.kind, src.groupLabels),
          // Привязка одна: каталог из неё и вытекает (тип ОЦ → тип ОИ).
          slot: {
            typeId: type.manifest.id,
            typeLabel: type.manifest.label,
            card: slot.card,
            field: slot.field,
            label: slot.label,
          },
          createdAt: '—',
          createdBy: 'встроенный перечень',
          updatedAt: '',
          updatedBy: '',
        });
      });
    });
  });

  // Вид перечня — по фактическому составу: описан он мог быть плоским, а
  // прийти группами.
  list.forEach((d) => {
    if (d.items.some((it) => it.group)) d.kind = 'group';
  });

  return sortDicts(list);
}

// Порядок внутри каталога и папки: сначала обычные справочники, потом
// системные — вперемешку они сбивают (замечание пользователя 02.09.2026).
// Внутри каждой группы — по названию.
export function sortDicts(list) {
  return list.sort((a, b) => (a.system - b.system)
    || a.name.localeCompare(b.name, 'ru'));
}

export function allDicts() {
  if (!dicts.state.list) dicts.set({ list: build() });
  return dicts.state.list;
}

export function getDict(id) {
  return allDicts().find((d) => d.id === id) || null;
}

// --- каталоги --------------------------------------------------------------
//
// Структура жёсткая: тип ОЦ → тип ОИ (решение пользователя 02.09.2026).
// Вручную каталоги не создаются — они повторяют саму систему, поэтому
// справочник всегда лежит там, где применяется.

export const catalogKey = (typeId, card) => `${typeId}|${card}`;

// Привязка справочника. Оставлено функцией, а не обращением к полю: так экран
// не знает, как она хранится, и её форма может измениться без правок экрана.
export function mainSlot(dict) {
  return dict.slot || null;
}

export function dictCatalog(dict) {
  const s = mainSlot(dict);
  return s ? catalogKey(s.typeId, s.card) : 'unbound';
}

// Дерево каталогов со справочниками. Пустые каталоги тоже показываются: в них
// можно перенести справочник, и лучше видеть, что место существует.
export function catalogTree() {
  const all = allDicts();
  const tree = [];

  sortedTypes().forEach((type) => {
    const cards = new Set();
    const sources = type.dictExport && type.dictExport.DICT_SOURCES;
    (sources || []).forEach((src) => (src.slots || []).forEach((s) => cards.add(s.card)));

    const nodes = [...cards]
      .sort((a, b) => CARD_ORDER.indexOf(a) - CARD_ORDER.indexOf(b))
      .map((card) => {
        const key = catalogKey(type.manifest.id, card);
        const mine = all.filter((d) => dictCatalog(d) === key);

        // Папки — третий уровень: справочники с одинаковым folder собираются
        // вместе, остальные лежат прямо в каталоге.
        const folders = [];
        const seen = new Map();
        mine.filter((d) => d.folder).forEach((d) => {
          if (!seen.has(d.folder)) {
            const node = { key: `${key}|${d.folder}`, name: d.folder, dicts: [] };
            seen.set(d.folder, node);
            folders.push(node);
          }
          seen.get(d.folder).dicts.push(d);
        });
        folders.forEach((f) => sortDicts(f.dicts));
        folders.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

        return {
          key,
          typeId: type.manifest.id,
          typeLabel: type.manifest.label,
          card,
          label: CARD_LABEL[card] || card,
          folders,
          dicts: sortDicts(mine.filter((d) => !d.folder)),
          total: mine.length,
        };
      });

    tree.push({
      typeId: type.manifest.id,
      label: type.manifest.label,
      cards: nodes,
      count: nodes.reduce((n, c) => n + c.total, 0),
    });
  });

  // Справочники без привязки (созданные вручную и копии) — отдельным узлом:
  // иначе они пропадали бы из дерева.
  const unbound = all.filter((d) => !mainSlot(d));
  if (unbound.length) {
    tree.push({
      typeId: '', label: 'Не привязаны', count: unbound.length,
      cards: [{ key: 'unbound', typeId: '', card: '', label: 'Ждут привязки к полю',
        folders: [], dicts: sortDicts(unbound), total: unbound.length }],
    });
  }

  return tree;
}

// --- точки подключения -----------------------------------------------------

export function allSlots() {
  const out = [];
  sortedTypes().forEach((type) => {
    const sources = type.dictExport && type.dictExport.DICT_SOURCES;
    (sources || []).forEach((src) => {
      (src.slots || []).forEach((slot) => {
        out.push({
          typeId: type.manifest.id,
          typeLabel: type.manifest.label,
          card: slot.card,
          field: slot.field,
          label: slot.label,
        });
      });
    });
  });
  return out;
}

const slotKey = (s) => `${s.typeId}|${s.card}|${s.field}`;

export function dictAt(typeId, card, field) {
  const key = `${typeId}|${card}|${field}`;
  return allDicts().find((d) => d.slot && slotKey(d.slot) === key) || null;
}

// Значения для поля карточки. Пока поле не переведено на справочники, модуль
// продолжает читать свой перечень — переход постепенный, по одному полю.
export function optionsFor(typeId, card, field) {
  const dict = dictAt(typeId, card, field);
  return dict ? dict.items.map((it) => it.value) : null;
}

// То же для перечней с разделами («Категория ОИ», «Благоустройство»): позиции
// хранят пометку раздела, поэтому исходную структуру можно собрать обратно.
// Ключ поля в разделах (`values`) один и тот же — карточки называют его
// по-разному, поэтому отдаём и `classes`, и `options`: так вызывающему коду не
// нужно знать, из какого поля пришли значения.
export function groupedOptionsFor(typeId, card, field) {
  const dict = dictAt(typeId, card, field);
  if (!dict) return null;

  const out = [];
  const byKey = new Map();

  dict.items.forEach((it) => {
    const key = it.groupKey || it.group || '';
    if (!byKey.has(key)) {
      const g = { key, label: it.group || '', values: [] };
      byKey.set(key, g);
      out.push(g);
    }
    byKey.get(key).values.push(it.value);
  });

  return out.map((g) => ({ ...g, classes: g.values, options: g.values }));
}

// Все точки со сведениями о том, какой справочник их читает. Нужно выбору
// поля для ссылки: свободных полей после разноса нет, и без пометки «занято
// справочником N» выбирать пришлось бы наугад.
export function slotsWithOwners(catalog) {
  const seen = new Set();
  const out = [];

  allSlots().forEach((slot) => {
    const key = slotKey(slot);
    if (seen.has(key)) return;
    if (catalog && catalogKey(slot.typeId, slot.card) !== catalog) return;
    seen.add(key);

    const owner = allDicts().find((d) => d.slot && slotKey(d.slot) === key);
    out.push({ ...slot, owner: owner || null });
  });

  return out;
}

// Свободные точки: те, что ещё никем не заняты (одно поле — один справочник).
export function freeSlots(catalog) {
  const taken = new Set();
  allDicts().forEach((d) => { if (d.slot) taken.add(slotKey(d.slot)); });

  const seen = new Set();
  return allSlots().filter((s) => {
    const key = slotKey(s);
    if (taken.has(key) || seen.has(key)) return false;
    if (catalog && catalogKey(s.typeId, s.card) !== catalog) return false;
    seen.add(key);
    return true;
  });
}

// --- использование значений -----------------------------------------------

// Поле может быть вложенным: конструктивный состав хранится как
// oi.struct.foundation, и в привязке это записано через точку.
function readField(holder, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), holder);
}

function writeField(holder, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), holder);
  target[last] = value;
}

// Где встречается значение. Считается по записям, живущим в памяти модулей:
// синтетические записи массовой генерации сюда не входят — у них нет
// собственных данных, пока их не открыли.
export function usageOf(dict, value) {
  let n = 0;
  const places = [];

  const b = dict.slot;
  if (b) {
    const type = sortedTypes().find((t) => t.manifest.id === b.typeId);
    if (!type || !type.records.allRecords) return { count: 0, places: [] };

    type.records.allRecords().forEach((rec) => {
    const holders = b.card === 'oc' ? [rec] : (rec.oi || []).filter((o) => {
      if (b.card === 'building') return o.card !== 'land' && o.card !== 'movable';
      return o.card === b.card;
    });

      holders.forEach((holder) => {
        const raw = readField(holder, b.field);
        const hit = Array.isArray(raw) ? raw.includes(value)
          : (raw && typeof raw === 'object' ? Object.values(raw).flat().includes(value)
            : raw === value);
        if (!hit) return;
        n++;
        if (places.length < 50) {
          places.push({
            typeId: b.typeId, ocId: rec.id, eni: rec.eni,
            title: rec.address || rec.id,
            card: CARD_LABEL[b.card] || b.card,
            oiName: holder.name || '',
            status: rec.status || '',
            label: b.label,
          });
        }
      });
    });
  }

  return { count: n, places };
}

export function dictUsage(dict) {
  return dict.items.reduce((sum, it) => sum + usageOf(dict, it.value).count, 0);
}

// --- связанные справочники -------------------------------------------------
//
// Связь по КЛЮЧУ ПОЛЯ: «Фундамент» у гражданского, производственного и жилого
// зданий — это одно и то же поле struct.foundation разных типов ОЦ. Перечни у
// них обычно совпадают, и правку логично применять сразу ко всем.
//
// Общего справочника при этом нет (пользователь просил разнести): каждый живёт
// сам, но правку можно размножить осознанно и видеть, куда именно она уйдёт.

export function linkedDicts(dict) {
  const b = dict.slot;
  if (!b) return [];

  return allDicts().filter((d) => d !== dict && !d.system && d.slot
    && d.slot.field === b.field);
}

// Значения, которых нет в связанном справочнике, и наоборот — чтобы показать
// расхождение до применения правки.
export function diffWith(dict, other) {
  const mine = dict.items.map((x) => x.value);
  const theirs = other.items.map((x) => x.value);
  return {
    onlyMine: mine.filter((v) => !theirs.includes(v)),
    onlyTheirs: theirs.filter((v) => !mine.includes(v)),
  };
}

// Добавить значение в выбранные связанные справочники. Возвращает, сколько
// перечней изменилось: там, где значение уже есть, ничего не делается.
export function addItemTo(targets, value, group) {
  if (!canEditDicts()) return 0;
  let n = 0;
  targets.forEach((d) => {
    if (d.system || hasValue(d, value)) return;
    if (addItem(d, value, group)) n++;
  });
  return n;
}

// Удалить значение из выбранных связанных справочников. Где оно используется —
// подставляется замена (та же, что выбрал человек в диалоге); где не
// используется — просто убирается. Возвращает {dicts, objects}.
export function removeItemFrom(targets, value, replaceWith) {
  if (!canEditDicts()) return { dicts: 0, objects: 0 };

  let dictsChanged = 0;
  let objects = 0;

  targets.forEach((d) => {
    if (d.system) return;
    const item = d.items.find((x) => x.value === value);
    if (!item) return;

    const { count } = usageOf(d, item.value);
    const res = removeItem(d, item, count ? replaceWith : null);
    if (res) {
      dictsChanged++;
      objects += res.touched || 0;
    }
  });

  return { dicts: dictsChanged, objects };
}

// Переименовать значение в выбранных связанных справочниках: правка названия —
// тоже синхронизация, и без неё перечни разойдутся при первой же опечатке.
export function renameItemIn(targets, from, to) {
  if (!canEditDicts()) return { dicts: 0, objects: 0 };

  let dictsChanged = 0;
  let objects = 0;

  targets.forEach((d) => {
    if (d.system || hasValue(d, to)) return;
    const item = d.items.find((x) => x.value === from);
    if (!item) return;

    objects += replaceValue(d, from, to);
    if (renameItem(d, item, to)) dictsChanged++;
  });

  return { dicts: dictsChanged, objects };
}

// --- изменения -------------------------------------------------------------

export const canEditDicts = () => seesEverything();

function touch(dict) {
  dict.updatedAt = today();
  dict.updatedBy = session.state.person;
  dicts.touch();
}

export function createDict(name, slot) {
  if (!canEditDicts()) return null;
  const dict = {
    id: nextId('dict'), sourceKey: '', name: name || 'Новый справочник', note: '',
    kind: 'list', system: false, items: [], folder: '',
    slot: slot ? { ...slot } : null,
    createdAt: today(), createdBy: session.state.person, updatedAt: '', updatedBy: '',
  };
  allDicts().push(dict);
  dicts.touch();
  return dict;
}

// Копия справочника. Привязка НЕ копируется: одно поле — один справочник, и
// копию делают, чтобы отдать её другому полю.
export function copyDict(dict) {
  if (!canEditDicts()) return null;
  const copy = {
    ...dict,
    id: nextId('dict'),
    name: `${dict.name} · копия`,
    system: false,
    items: dict.items.map((it) => ({ ...it, id: nextId('it') })),
    slot: null,
    createdAt: today(), createdBy: session.state.person, updatedAt: '', updatedBy: '',
  };
  allDicts().push(copy);
  dicts.touch();
  return copy;
}

export function removeDict(dict) {
  if (!canEditDicts() || dict.system || dict.slot) return false;
  const list = allDicts();
  const i = list.indexOf(dict);
  if (i < 0) return false;
  list.splice(i, 1);
  dicts.touch();
  return true;
}

export function renameDict(dict, name) {
  if (!canEditDicts() || !name.trim()) return false;
  dict.name = name.trim();
  touch(dict);
  return true;
}

export function setDictNote(dict, note) {
  if (!canEditDicts()) return false;
  dict.note = note;
  touch(dict);
  return true;
}

// --- привязка и перенос между каталогами ----------------------------------

// Привязать справочник к полю. Одно поле — один справочник: прежний владелец
// точку теряет и уходит в «Не привязаны».
export function bindSlot(dict, slot) {
  if (!canEditDicts() || dict.system) return false;
  const key = slotKey(slot);

  allDicts().forEach((d) => {
    if (d !== dict && d.slot && slotKey(d.slot) === key) d.slot = null;
  });

  dict.slot = { ...slot };
  touch(dict);
  return true;
}

// Папка внутри каталога: пустая строка — справочник лежит прямо в каталоге.
export function setFolder(dict, folder) {
  if (!canEditDicts() || dict.system) return false;
  dict.folder = String(folder || '').trim();
  touch(dict);
  return true;
}

// Папки каталога — для выбора при переносе и создании.
export function foldersOf(typeId, card) {
  const key = catalogKey(typeId, card);
  const out = [];
  allDicts().forEach((d) => {
    if (dictCatalog(d) === key && d.folder && !out.includes(d.folder)) out.push(d.folder);
  });
  return out.sort((a, b) => a.localeCompare(b, 'ru'));
}

// Снять привязку — справочник уходит в «Не привязаны», поле возвращается к
// встроенному перечню.
export function unbindSlot(dict) {
  if (!canEditDicts() || dict.system) return false;
  dict.slot = null;
  touch(dict);
  return true;
}

// Перенос в другой каталог. Автопривязка (решение пользователя 02.09.2026):
// ищем в целевом каталоге поле с тем же ключом, иначе с той же подписью.
// Нашли и оно свободно — перевешиваем сразу; иначе возвращаем список
// подходящих полей, чтобы экран спросил, и НИЧЕГО не меняем.
export function moveToCatalog(dict, typeId, card) {
  if (!canEditDicts() || dict.system) return { ok: false, reason: 'нельзя' };

  const target = allSlots().filter((s) => s.typeId === typeId && s.card === card);
  const busy = (s) => allDicts().some((d) => d !== dict && d.slot
    && slotKey(d.slot) === slotKey(s));
  const free = target.filter((s) => !busy(s));
  const from = mainSlot(dict);

  // Только по ключу поля. По названию справочника или подписи поля ничего не
  // угадывается: пользователь просил указывать конкретное поле, а не
  // сопоставлять названия (02.09.2026).
  const same = from && target.find((s) => s.field === from.field);

  if (same && !busy(same)) {
    bindSlot(dict, same);
    return { ok: true, slot: same, auto: true };
  }

  // Занятые поля тоже возвращаем — с именем справочника, который их держит.
  // Иначе при 1:1 выбирать оказывается не из чего: свободных полей в каталоге
  // обычно нет ни одного, и созданный вручную справочник некуда прикрепить.
  const busySlots = target.filter(busy).map((s) => ({
    ...s,
    byName: (allDicts().find((d) => d !== dict && d.slot
      && slotKey(d.slot) === slotKey(s)) || {}).name || '',
  }));

  if (same && busy(same)) {
    const by = allDicts().find((d) => d !== dict && d.slot
      && slotKey(d.slot) === slotKey(same));
    return { ok: false, reason: 'занято', slot: same, by, options: free, busySlots };
  }

  return { ok: false, reason: 'выбор', options: free, busySlots };
}

// --- значения --------------------------------------------------------------

export function hasValue(dict, value, exceptId) {
  const v = String(value || '').trim().toLowerCase();
  return dict.items.some((it) => it.id !== exceptId && it.value.trim().toLowerCase() === v);
}

export function addItem(dict, value, group) {
  if (!canEditDicts() || dict.system) return null;
  const v = String(value || '').trim();
  if (!v || hasValue(dict, v)) return null;
  const item = { id: nextId('it'), value: v, group: group || '', note: '', order: dict.items.length };
  dict.items.push(item);
  touch(dict);
  return item;
}

export function renameItem(dict, item, value) {
  if (!canEditDicts() || dict.system) return false;
  const v = String(value || '').trim();
  if (!v || hasValue(dict, v, item.id)) return false;
  item.value = v;
  touch(dict);
  return true;
}

export function setItemNote(dict, item, note) {
  if (!canEditDicts() || dict.system) return false;
  item.note = note;
  touch(dict);
  return true;
}

// Перенос значения на место другого — порядок правится мышью. Внутри своего
// раздела: у конструктивного состава значение принадлежит разделу («стены»,
// «кровля»), и перенос в чужой раздел менял бы смысл, а не порядок.
export function moveItem(dict, dragId, overId) {
  if (!canEditDicts() || dict.system) return false;

  const from = dict.items.findIndex((x) => x.id === dragId);
  const to = dict.items.findIndex((x) => x.id === overId);
  if (from < 0 || to < 0 || from === to) return false;
  if ((dict.items[from].group || '') !== (dict.items[to].group || '')) return false;

  const [moved] = dict.items.splice(from, 1);
  dict.items.splice(to, 0, moved);
  dict.items.forEach((it, i) => { it.order = i; });
  touch(dict);
  return true;
}

// Удаление значения по гибридному правилу:
//   replaceWith === null  — значение нигде не используется, просто убираем;
//   replaceWith === текст — во всех объектах оно переписывается на это.
// Возвращает, сколько объектов затронуто.
export function removeItem(dict, item, replaceWith) {
  if (!canEditDicts() || dict.system) return null;

  const { count } = usageOf(dict, item.value);
  if (count && !replaceWith) return null;

  let touched = 0;
  if (count && replaceWith) touched = replaceValue(dict, item.value, replaceWith);

  const i = dict.items.indexOf(item);
  if (i >= 0) dict.items.splice(i, 1);

  // Замена на значение, которого в справочнике нет, — это переименование:
  // новая позиция должна появиться, иначе объекты сошлются в пустоту.
  if (replaceWith && !hasValue(dict, replaceWith)) {
    dict.items.push({ id: nextId('it'), value: replaceWith, group: item.group,
      groupKey: item.groupKey, note: '', order: dict.items.length });
  }

  touch(dict);
  return { touched };
}

// Переписать значение во всех объектах, где оно встречается.
export function replaceValue(dict, from, to) {
  let touched = 0;

  const b = dict.slot;
  if (b) {
    const type = sortedTypes().find((t) => t.manifest.id === b.typeId);
    if (!type || !type.records.allRecords) return 0;

    type.records.allRecords().forEach((rec) => {
    const holders = b.card === 'oc' ? [rec] : (rec.oi || []).filter((o) => {
      if (b.card === 'building') return o.card !== 'land' && o.card !== 'movable';
      return o.card === b.card;
    });

      holders.forEach((holder) => {
        const raw = readField(holder, b.field);
        if (Array.isArray(raw)) {
          const i = raw.indexOf(from);
          if (i >= 0) { raw[i] = to; touched++; }
        } else if (raw === from) {
          writeField(holder, b.field, to);
          touched++;
        }
      });
    });
  }

  return touched;
}
