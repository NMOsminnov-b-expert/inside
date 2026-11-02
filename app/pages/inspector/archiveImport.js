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
import { resultsOf, valuesOf, addResultPhoto, addResultVoice, addResultScan, saveResults } from '../../kernel/inspectionResults.js';
import { allAssignments, coversOi, changed } from '../../kernel/inspections.js';
import { ownOis } from './tasks.js';

const REAL = 'Недвижимое';
const MOVABLE = 'Движимое';
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
  const marks = [REAL, MOVABLE, DOCS, MACHINES, 'Объект.txt', 'Контакты.xlsx'];
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

  const ocId = rec.id;
  const r = resultsOf(typeId, ocId);
  if (!Array.isArray(r.found)) r.found = [];
  const ois = ownOis(rec);
  const list = allAssignments().filter((a) => a.typeId === typeId && a.ocId === ocId && a.state !== 'removed');
  const byOf = (oiId) => ((list.find((a) => coversOi(a, oiId)) || list[0] || {}).person || '');
  const sum = { photos: 0, values: 0, voices: 0, scans: 0, contacts: 0, found: [], matched: [], skipped: [], repeated: 0 };

  // Папка ОИ в архиве → id ОИ (своего или выявленного).
  const folderMap = new Map();
  const foundFor = (label, card, extra = {}) => {
    let f = r.found.find((x) => x.source && x.source.label === SOURCE && norm(x.name) === norm(label));
    if (!f) {
      f = { id: `found-arc-${Date.now().toString(36)}-${r.found.length + 1}`, card, name: label, where: card === 'vehicle' ? MOVABLE : REAL,
        foundBy: byOf(''), foundAt: new Date().toISOString().slice(0, 10), note: 'выявлено на осмотре (из архива приложения)', source: { kind: 'archive', label: SOURCE }, ...extra };
      r.found.push(f);
    }
    if (!sum.found.includes(label)) sum.found.push(label);
    return f.id;
  };
  const oiFor = (top, name) => {
    const key = `${top}/${name}`;
    if (folderMap.has(key)) return folderMap.get(key);
    let id = '';
    if (top === REAL && name === LAND) {
      const land = ois.find((o) => o.card === 'land');
      id = land ? land.id : foundFor(LAND, 'land');
    } else if (top === REAL) {
      const l = letterOf(name);
      const hit = ois.find((o) => (o.card === 'building' || o.card === 'apartment') && o.letter && norm(o.letter) === l)
        || ois.find((o) => (o.card === 'building' || o.card === 'apartment') && norm(o.name) === norm(name))
        || (ois.filter((o) => o.card === 'apartment').length === 1 && ois.filter((o) => o.card === 'building').length === 0 ? ois.find((o) => o.card === 'apartment') : null);
      id = hit ? hit.id : foundFor(name, 'building');
    } else if (top === MOVABLE) {
      const p = plateKey(name);
      const hit = ois.find((o) => o.card === 'vehicle' && plateKey(((o.vehicle || {}).f || {}).plate) === p);
      id = hit ? hit.id : foundFor(name, 'vehicle', { plate: name });
    }
    if (id && !sum.matched.includes(name) && !sum.found.includes(name)) sum.matched.push(name);
    folderMap.set(key, id);
    return id;
  };

  const has = (arr, name, oiId) => (arr || []).some((x) => x.name === name && (x.oiId || '') === oiId);

  for (const e of entries) {
    const parts = e.rel.split('/');
    const name = parts[parts.length - 1];
    const top = parts[0];
    try {
      if (top === MACHINES) { sum.skipped.push('описи «Механизмов и оборудования» — на начальном этапе не разбираются'); continue; }
      if (parts.length === 1) {
        if (name === 'Контакты.xlsx') {
          const rows = await xlsxRows(await (await e.read()).arrayBuffer());
          const head = (rows[0] || []).map(norm);
          const col = (re) => head.findIndex((h) => re.test(h));
          const ci = { name: col(/фио|имя|контакт/), role: col(/должн|роль|кто/), phone: col(/тел/) };
          rows.slice(1).forEach((row) => {
            const c = { name: row[ci.name] || row[0] || '', role: ci.role >= 0 ? row[ci.role] : '', phone: ci.phone >= 0 ? row[ci.phone] : '' };
            if (!c.name && !c.phone) return;
            if ((r.contacts || []).some((x) => norm(x.name) === norm(c.name) && norm(x.phone) === norm(c.phone))) { sum.repeated++; return; }
            (r.contacts = r.contacts || []).push({ id: `ct-arc-${Date.now().toString(36)}-${r.contacts.length + 1}`, ...c, source: SOURCE });
            sum.contacts++;
          });
        }
        continue;
      }
      // Документы объекта и недвижимости — сканы на разбор ЦОД.
      if ((top === DOCS || (top === REAL && parts[1] === DOCS)) && ext(name) === 'pdf') {
        if ((r.scans || []).some((s) => s.title === name)) { sum.repeated++; continue; }
        addResultScan(typeId, ocId, [await asFile(e, name)], { title: name, by: byOf('') });
        sum.scans++;
        continue;
      }
      if (top !== REAL && top !== MOVABLE) { if (isPhoto(name)) sum.skipped.push(`«${top}» — своя категория объекта, на начальном этапе не разбирается`); continue; }
      if (parts.length < 3) continue;
      const oiId = oiFor(top, parts[1]);
      if (!oiId) continue;
      const inner = parts.slice(2);
      if (inner.length === 1 && ext(name) === 'json') {
        const vals = JSON.parse(await (await e.read()).text());
        const into = valuesOf(typeId, ocId, oiId);
        Object.entries(vals).forEach(([k, v]) => {
          if (k.startsWith('carried.') || v === '' || (Array.isArray(v) && !v.length)) return;
          into[k] = v;
          sum.values++;
        });
        continue;
      }
      if (isPhoto(name)) {
        if (has(r.photos, name, oiId)) { sum.repeated++; continue; }
        const cat = inner.length > 1 ? inner[0] : 'Прочее';
        addResultPhoto(typeId, ocId, await asFile(e, name), { oiId, cat, by: byOf(oiId), at: timeOf(name), source: SOURCE });
        sum.photos++;
      } else if (isVoice(name)) {
        if (has(r.voices, name, oiId)) { sum.repeated++; continue; }
        const v = addResultVoice(typeId, ocId, await e.read(), { oiId, by: byOf(oiId) });
        Object.assign(v, { name, at: timeOf(name), source: SOURCE });
        sum.voices++;
      } else if (isVideo(name)) {
        sum.skipped.push('видео — на начальном этапе не переносится');
      }
    } catch (err) {
      sum.skipped.push(`«${e.rel}»: ${err.message}`);
    }
  }
  saveResults();
  changed();
  sum.skipped = [...new Set(sum.skipped)];
  if (others.size && root) sum.skipped.push(`в архиве есть и другие объекты — взят «${root.split('/').pop()}»`);
  sum.object = root ? root.split('/').pop() : '';
  return sum;
}
