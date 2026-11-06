// Документы из карточек — в поиске по всем документам (решение пользователя
// 29.10.2026: «Ну и само собой ВСЕ документы из краточек доступны для поиска по
// всем документам!»). Реестр «Документы» (kernel/documentsRegistry.js) живёт
// сам по себе и данных модулей не собирает; этот файл подаёт ему строки
// документов карточек ОЦ и ОИ и документов позиций описей тем же видом, что у
// реестра, — с меткой, откуда документ, и ссылкой туда.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: поиск по всем документам — один индекс на сервере
// (документы реестра, карточек и описей; полнотекстовый поиск по названию,
// виду, номеру, учреждению). Здесь записи обходятся в памяти вкладки и
// сводка держится несколько секунд.
import { sortedTypes } from './registry.js';
import { build } from './router.js';
import { allItemDocs } from './inventories.js';

const TTL = 4000;
let cache = null;
let cacheAt = 0;

const fileOf = (d) => (d.file && d.file.name ? [{ name: d.file.name }] : []);
// Дата — как в реестре (ГГГГ-ММ-ДД): в карточках бывает «ДД.ММ.ГГГГ», а
// сортировка и отбор по периоду сравнивают строки.
const isoDate = (v) => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(v || '').trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : String(v || ''); };

export function cardDocuments() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const out = [];
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    res.rows.forEach((s) => {
      const rec = t.records.loadRecord(s.id);
      if (!rec) return;
      const where = s.title || rec.address || rec.name || 'объект оценки';
      const row = (d, oi) => ({
        id: `card:${t.manifest.id}|${s.id}|${oi ? oi.id : ''}|${d.id}`,
        title: d.name || '', type: d.type || 'Прочее', files: fileOf(d).length ? fileOf(d) : [{ name: d.name || '—' }],
        number: d.number || '', date: isoDate(d.date), institution: rec.institution || '', regAuthority: '', regDate: '',
        affiliation: oi ? `ОИ: ${oi.name || oi.letter || 'объект имущества'} · ${where}` : `ОЦ: ${where}`,
        status: d.status || 'Загружен', source: 'card',
        href: build({ typeId: t.manifest.id, ocId: s.id, rest: oi ? ['oi', oi.id] : [] }),
      });
      (rec.docs || []).forEach((d) => out.push(row(d, null)));
      (rec.oi || []).forEach((o) => (o.docs || []).forEach((d) => out.push(row(d, o))));
    });
  });
  allItemDocs().forEach(({ doc: d, inv, item }) => {
    if (!inv) return;
    out.push({
      id: `inv:${inv.id}|${item ? item.id : ''}|${d.id}`, title: d.name || '', type: d.type || 'Прочее', raw: d, files: fileOf(d).length ? fileOf(d) : [{ name: d.name || '—' }],
      number: '', date: isoDate(d.date), institution: inv.institution || '', regAuthority: '', regDate: '',
      affiliation: `Опись: ${inv.title}${item ? ` · позиция ${item.no} · ${item.inv}` : ''}`,
      status: d.status || 'Загружен', source: 'inventory', href: '',
    });
  });
  cache = out;
  cacheAt = Date.now();
  return out;
}

// Документ позиции описи по id строки поиска («inv:…») — открыть из поиска по документам
// (решение пользователя 06.11.2026: «документ позиции описи открывается из поиска»). Файлы —
// в виде, который понимает просмотрщик страницы: сам файл и страницы скана, если их несколько.
export function inventoryDocument(id) {
  const row = cardDocuments().find((d) => d.id === id && d.source === 'inventory');
  if (!row || !row.raw) return null;
  const d = row.raw;
  const pages = (d.scanPages || []).length > 1 ? d.scanPages : (d.file ? [d.file] : []);
  const files = pages.filter((p) => p && p.dataUrl).map((p, i) => ({
    id: `${d.id}-f${i + 1}`, name: p.name || `страница ${i + 1}`, type: p.mime || p.type || '', mime: p.mime || p.type || '',
    kind: p.kind || ((p.mime || p.type || '').startsWith('image/') ? 'image' : (p.mime || p.type) === 'application/pdf' ? 'pdf' : 'other'),
    dataUrl: p.dataUrl, size: p.size || 0,
  }));
  return { ...row, files };
}

// Сбросить сводку — после правки документов, чтобы поиск видел новое сразу.
export function resetCardDocuments() {
  cache = null;
}
