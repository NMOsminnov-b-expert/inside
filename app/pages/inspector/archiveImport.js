// Импорт архива приложения «Осмотр» во вкладку «Результаты осмотра» —
// опция начального этапа (пользователь 02.11.2026: «Импорт архива пока не
// нужен. Хотя... Добавь с пометкой как опция. на начальном этапе»; устройство
// архива — запись графа prilozhenie-osmotr-github-com-nmosminnov-osmotr-…).
//
// Приложение без сервера: объект осмотра — папка «Осмотры/<объект>/», результат
// уходит ZIP-архивом. Раскладка:
//   Недвижимое/<Литер А | А | найденное>/<категория>/*.jpg, <Литер_А>.json
//   Недвижимое/Земельный участок/…, Земельный_участок.json
//   Недвижимое/Документы/*.pdf, Документы/*.pdf, Движимое/<госномер>/…
//   Контакты.xlsx, Объект.txt, Механизмы и оборудование/<опись>/…
// Ключи полей JSON — те же, что в форме осмотра макета (form.js).
//
// Что куда: значения — в значения ОИ; снимки — с категорией по подпапке и
// временем из имени файла; голос (.m4a) — голосовые заметки; PDF — сканы,
// «ждут ЦОД»; контакты — контакты осмотра. Литер не нашёлся среди ОИ — он
// выявленный на осмотре; ТС — так же. Описи «Механизмов» на начальном этапе
// не разбираются — об этом сказано в итоге. Повторная загрузка того же архива
// ничего не удваивает (по имени файла).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: начальный этап — обмен архивом; дальше приложение
// синхронизируется с сервером напрямую (в его ТЗ — «Позже: синхронизация с
// сервером»), и этот импорт уходит. Архив разбирает сервер; сопоставление
// литер — по идентификатору ОИ, который приложение получит с назначением.
import { readZip } from '../../kernel/zipRead.js';
import { xlsxRows } from '../../kernel/xlsx.js';
import { setValue } from '../../kernel/fieldSchema.js';
import { resultsOf, valuesOf, addResultPhoto, addResultVoice, addResultScan, saveResults } from '../../kernel/inspectionResults.js';
import { allAssignments, coversOi, changed } from '../../kernel/inspections.js';
import { ownOis } from './tasks.js';

const REAL = 'Недвижимое';
// «Транспортные средства» — с 03.11.2026 (решение пользователя); «Движимое» — прежние архивы.
const MOVABLES = ['Транспортные средства', 'Движимое'];
const isMovable = (x) => MOVABLES.includes(x);
const DOCS = 'Документы';
const MACHINES = 'Механизмы и оборудование';
const LAND = 'Земельный участок';
const SOURCE = 'архив приложения «Осмотр»';

const ext = (p) => (p.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const isPhoto = (p) => ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext(p));
const isVoice = (p) => ['m4a', 'mp3', 'ogg', 'wav', 'aac', 'webm'].includes(ext(p));
const isVideo = (p) => ['mp4', 'mov', '3gp'].includes(ext(p));
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', m4a: 'audio/mp4', mp3: 'audio/mpeg',
  ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac', webm: 'audio/webm', pdf: 'application/pdf' };
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const plateKey = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
const letterOf = (name) => norm(name).replace(/^литер(а)?\s*/, '');

// Время снимка из имени «<папка>_<ГГГГММДД_ЧЧММСС>_<NNN>.jpg».
function timeOf(name) {
  const m = name.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_|\.)/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString() : new Date().toISOString();
}

// Корень объекта в архиве: всё до первой служебной папки («Недвижимое» и т. д.).
function objectRoot(entries) {
  const marks = [REAL, ...MOVABLES, DOCS, MACHINES, 'Объект.txt', 'Контакты.xlsx'];
  for (const e of entries) {
    const parts = e.path.split('/');
    const i = parts.findIndex((x) => marks.includes(x));
    if (i >= 0) return parts.slice(0, i).join('/');
  }
  return null;
}

async function asFile(e, name) {
  const blob = await e.read();
  return new File([blob], name, { type: MIME[ext(name)] || blob.type || '' });
}

// Импорт: typeId, rec — запись ОЦ; возвращает итог для сообщения.
export async function importArchive(typeId, rec, file) {
  const all = (await readZip(file)).filter((e) => !e.dir && !e.path.split('/').some((x) => x.startsWith('.')));
  const root = objectRoot(all);
  if (root === null) throw new Error('В архиве нет папок объекта осмотра («Недвижимое», «Движимое», «Документы»)');
  const others = new Set(all.map((e) => e.path).filter((p) => !p.startsWith(root ? root + '/' : '')).map((p) => p.split('/').slice(0, 2).join('/')));
  const entries = all.filter((e) => !root || e.path.startsWith(root + '/')).map((e) => ({ ...e, rel: root ? e.path.slice(root.length + 1) : e.path }));
  const sum = await applyEntries(typeId, rec, entries);
  if (others.size && root) sum.skipped.push(`в архиве есть и другие объекты — взят «${root.split('/').pop()}»`);
  sum.object = root ? root.split('/').pop() : '';
  return sum;
}

// Файлы папки объекта приложения → результаты осмотра. entries — [{ rel, read,
// oiId?, depth? }]: rel — путь от папки объекта («Недвижимое/Литера А/Фасад/…jpg»),
// read — Blob файла; oiId — ОИ, к которому относится папка, depth — сколько
// частей пути занимает папка этого ОИ (0 — объект и есть ОИ: объект-ТС).
// Приложение в режиме E•state знает их из назначения (pages/osmotr/bridge.js); у
// архива их нет — ОИ ищется по букве литеры, ЕНИ участка и госномеру. Общий
// разбор архива и отправки из приложения.
//
// Решения пользователя 03.11.2026 (аудит приложения): документы — «Любые
// форматы куда угодно» (файл из любой папки «Документы» — скан на разбор ЦОД, к
// своему ОИ); удаления на телефоне — «Система копит всё» (markDeleted —
// пометка, а не удаление). Итог по каждому файлу — results: принят или нет и
// почему (приложение отмечает отправленным только принятое).
export async function applyEntries(typeId, rec, entries, { source = SOURCE } = {}) {
  const ocId = rec.id;
  const r = resultsOf(typeId, ocId);
  if (!Array.isArray(r.found)) r.found = [];
  const ois = ownOis(rec);
  const list = allAssignments().filter((a) => a.typeId === typeId && a.ocId === ocId && a.state !== 'removed');
  const byOf = (oiId) => ((list.find((a) => coversOi(a, oiId)) || list[0] || {}).person || '');
  const sum = { photos: 0, values: 0, voices: 0, scans: 0, contacts: 0, found: [], matched: [], skipped: [], repeated: 0, taken: 0, results: [] };

  // Папка ОИ в архиве → id ОИ (своего или выявленного).
  const folderMap = new Map();
  const foundFor = (label, card, extra = {}) => {
    // Выявленное — одно, откуда бы ни пришло: часть файлов уходит сразу из приложения, часть — архивом, и по
    // разной метке источника ОИ заводился дважды (аудит приложения 03.11.2026, п. 29).
    let f = r.found.find((x) => x.source && (x.source.kind === 'archive' || x.source.kind === 'app' || x.source.label === source) && norm(x.name) === norm(label));
    if (!f) {
      f = { id: `found-arc-${Date.now().toString(36)}-${r.found.length + 1}`, card, name: label, where: card === 'vehicle' ? MOVABLES[0] : REAL,
        foundBy: byOf(''), foundAt: new Date().toISOString().slice(0, 10), note: source === SOURCE ? 'выявлено на осмотре (из архива приложения)' : 'выявлено на осмотре',
        source: { kind: source === SOURCE ? 'archive' : 'app', label: source }, ...extra };
      r.found.push(f);
    }
    if (!sum.found.includes(label)) sum.found.push(label);
    return f.id;
  };
  // ОИ по пути (архив): литера по букве или названию; участок — по ЕНИ подпапки, иначе первый; ТС — по госномеру.
  const oiFor = (parts) => {
    const top = parts[0];
    const name = parts[1];
    if (top === REAL && name === LAND) {
      const lands = ois.filter((o) => o.card === 'land');
      const sub = parts.length > 3 ? String(parts[2]).replace(/\D/g, '') : '';
      const byEni = sub && lands.find((o) => String(o.eni || '').replace(/\D/g, '') === sub);
      if (byEni) return { id: byEni.id, depth: 3 };
      const key = `${top}/${name}`;
      if (!folderMap.has(key)) folderMap.set(key, lands[0] ? lands[0].id : foundFor(LAND, 'land'));
      return { id: folderMap.get(key), depth: 2 };
    }
    const key = `${top}/${name}`;
    if (folderMap.has(key)) return { id: folderMap.get(key), depth: 2 };
    let id = '';
    if (top === REAL) {
      const l = letterOf(name);
      const hit = ois.find((o) => (o.card === 'building' || o.card === 'apartment') && o.letter && norm(o.letter) === l)
        || ois.find((o) => (o.card === 'building' || o.card === 'apartment') && norm(o.name) === norm(name))
        || (ois.filter((o) => o.card === 'apartment').length === 1 && ois.filter((o) => o.card === 'building').length === 0 ? ois.find((o) => o.card === 'apartment') : null);
      id = hit ? hit.id : foundFor(name, 'building');
    } else if (isMovable(top)) {
      const p = plateKey(name);
      const hit = ois.find((o) => o.card === 'vehicle' && plateKey(((o.vehicle || {}).f || {}).plate) === p);
      id = hit ? hit.id : foundFor(name, 'vehicle', { plate: name });
    }
    if (id && !sum.matched.includes(name) && !sum.found.includes(name)) sum.matched.push(name);
    folderMap.set(key, id);
    return { id, depth: 2 };
  };

  const has = (arr, name, oiId) => (arr || []).some((x) => x.name === name && (x.oiId || '') === oiId);

  for (const e of entries) {
    const parts = e.rel.split('/').filter(Boolean);
    const name = parts[parts.length - 1] || '';
    const top = parts[0];
    let taken = false;
    let why = '';
    const skip = (text) => { why = text; sum.skipped.push(text); };
    try {
      // ОИ файла: из назначения (приложение) или по пути (архив).
      const given = e.oiId && ois.some((o) => o.id === e.oiId);
      const at = given ? { id: e.oiId, depth: Number.isFinite(e.depth) ? e.depth : 2 }
        : (parts.length >= 3 && (top === REAL || isMovable(top))) ? oiFor(parts) : { id: '', depth: 0 };
      const oiId = at.id;
      const inner = parts.slice(at.depth);
      const docAt = parts.slice(0, -1).indexOf(DOCS);
      if (top === MACHINES) {
        skip('описи «Механизмов и оборудования» — отдельным обменом описи');
      } else if (docAt >= 0) {
        // Документ — из любой папки «Документы», любого формата, к ОИ этой папки (или к объекту).
        if ((r.scans || []).some((s) => s.title === name && (s.oiId || '') === oiId)) { sum.repeated++; taken = true; }
        else { addResultScan(typeId, ocId, [await asFile(e, name)], { title: name, oiId, by: byOf(oiId) }); sum.scans++; taken = true; }
      } else if (name === 'Контакты.xlsx') {
        // Контакты — из любой папки: приложение даёт завести их и у ОИ, а система читала только корень
        // объекта (аудит приложения 03.11.2026, п. 9). Ложатся в контакты объекта.
        const rows = await xlsxRows(await (await e.read()).arrayBuffer());
        const head = (rows[0] || []).map(norm);
        const col = (re) => head.findIndex((h) => re.test(h));
        const ci = { name: col(/фио|имя|контакт/), role: col(/должн|роль|кто/), phone: col(/тел/), email: col(/почт|mail/), note: col(/прим|коммент/) };
        const cell = (row, i) => (i >= 0 && row[i] != null ? String(row[i]) : '');
        // Контакт — по телефону: исправленный осмотрщиком (имя, должность) обновляет прежний, а не заводится
        // вторым; почта и примечание не теряются (аудит приложения 03.11.2026, п. 30).
        const tel = (x) => String(x || '').replace(/\D/g, '').slice(-9);
        rows.slice(1).forEach((row) => {
          const c = { name: cell(row, ci.name) || String(row[0] || ''), role: cell(row, ci.role), phone: cell(row, ci.phone), email: cell(row, ci.email), note: cell(row, ci.note) };
          if (!c.name && !c.phone) return;
          const list = (r.contacts = r.contacts || []);
          const same = list.find((x) => (tel(c.phone) && tel(x.phone) === tel(c.phone)) || (!tel(c.phone) && !tel(x.phone) && norm(x.name) === norm(c.name)));
          if (same) {
            const upd = Object.entries(c).filter(([k, v]) => v && v !== same[k]);
            if (!upd.length) { sum.repeated++; return; }
            upd.forEach(([k, v]) => { same[k] = v; });
            sum.contacts++;
            return;
          }
          list.push({ id: `ct-arc-${Date.now().toString(36)}-${list.length + 1}`, ...c, source });
          sum.contacts++;
        });
        taken = true;
      } else if (name === 'Комментарий.txt') {
        // Комментарий к объекту или к папке (категории, ОИ) — в примечание осмотра объекта; у папки — с её путём.
        // Прежде файл отбрасывался как «не снимок» (аудит приложения 03.11.2026, п. 9). Система копит всё:
        // исправленный комментарий добавляется строкой, прежний остаётся.
        const text = (await (await e.read()).text()).trim();
        const where = parts.slice(0, -1).join(' / ');
        const line = where ? `${where}: ${text}` : text;
        if (text && !String(r.note || '').split('\n').includes(line)) { r.note = [r.note, line].filter(Boolean).join('\n'); sum.values++; }
        else if (text) sum.repeated++;
        taken = true;
      } else if (parts.length === 1 && name === 'Объект.txt') {
        taken = true; // сведения объекта приходят из системы — сам файл не нужен
      } else if (!oiId) {
        skip(top === REAL || isMovable(top) ? `«${e.rel}» — не определился объект имущества` : `«${top}» — не раздел объекта`);
      } else if (inner.length === 1 && ext(name) === 'json') {
        const vals = JSON.parse(await (await e.read()).text());
        const into = valuesOf(typeId, ocId, oiId);
        Object.entries(vals).forEach(([k, v]) => {
          // objKind — тип ОИ формы приложения: его присылает сама система (bridge.js oiTypeOf), в значения осмотра
          // он не идёт — иначе ложился в них неизвестным полем (аудит приложения 03.11.2026, п. 13).
          if (k === 'objKind' || k.startsWith('carried.') || v === '' || (Array.isArray(v) && !v.length)) return;
          // Ключ с точкой («f.mileage», «ts.addr», «u.<id>.state») — вложенно, как пишет форма осмотра (fieldSchema.setValue):
          // иначе значение ложилось буквальным ключом «f.mileage», и форма его не видела.
          setValue(into, k, v);
          sum.values++;
        });
        taken = true;
      } else if (/^\..+\.поворот$/.test(name)) {
        // Поворот снимка в приложении — скрытым файлом «.<снимок>.поворот» (четверти по часовой): снимок в системе
        // показывается так же (аудит приложения 03.11.2026, п. 24). Снимок мог ещё не прийти — поворот ждёт его.
        const photo = name.slice(1, -'.поворот'.length);
        const q = ((parseInt((await (await e.read()).text()).trim(), 10) || 0) % 4 + 4) % 4;
        const hit = (r.photos || []).find((x) => x.name === photo && (x.oiId || '') === oiId);
        if (hit) hit.turn = q; else (r.turns = r.turns || {})[`${oiId}|${photo}`] = q;
        taken = true;
      } else if (isPhoto(name)) {
        if (has(r.photos, name, oiId)) { sum.repeated++; taken = true; }
        else {
          const cat = inner.length > 1 ? inner[0] : 'Прочее';
          const ph = addResultPhoto(typeId, ocId, await asFile(e, name), { oiId, cat, by: byOf(oiId), at: timeOf(name), source });
          const wait = r.turns && r.turns[`${oiId}|${name}`];
          if (ph && wait != null) { ph.turn = wait; delete r.turns[`${oiId}|${name}`]; }
          sum.photos++; taken = true;
        }
      } else if (isVoice(name)) {
        if (has(r.voices, name, oiId)) { sum.repeated++; taken = true; }
        else {
          const v = addResultVoice(typeId, ocId, await e.read(), { oiId, by: byOf(oiId) });
          Object.assign(v, { name, at: timeOf(name), source });
          sum.voices++; taken = true;
        }
      } else if (isVideo(name)) {
        skip('видео — система пока не принимает');
      } else {
        skip(`«${name}» — не снимок, не голос и не документ: документы кладутся в папку «${DOCS}»`);
      }
    } catch (err) {
      skip(`«${e.rel}»: ${err.message}`);
    }
    if (taken) sum.taken++;
    sum.results.push({ rel: e.rel, taken, why });
  }
  saveResults();
  changed();
  sum.skipped = [...new Set(sum.skipped)];
  return sum;
}

// Удалённое на телефоне — пометка в результатах, а не удаление (решение 03.11.2026:
// «Система копит всё»): снимок, голос или документ с этим именем у этого ОИ
// получает deletedByInspector — когда и кем. Сколько отмечено.
export function markDeleted(typeId, rec, rel, { oiId = '', by = '' } = {}) {
  const name = String(rel || '').split('/').pop();
  const r = resultsOf(typeId, rec.id);
  const at = new Date().toISOString();
  let n = 0;
  [r.photos, r.voices, r.scans].forEach((arr) => (arr || []).forEach((x) => {
    if ((x.name === name || x.title === name) && (!oiId || (x.oiId || '') === oiId) && !x.deletedByInspector) {
      x.deletedByInspector = { at, by };
      n++;
    }
  }));
  if (n) { saveResults(); changed(); }
  return n;
}
