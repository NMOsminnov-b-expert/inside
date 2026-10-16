// Просмотр документов в форме осмотра — рядом с камерой (решение пользователя
// 16.10.2026, запись графа prosmotr-dokumentov-u-osmotrschika-…: «Нужно быстро
// смотреть генплан, техпаспорт, поэтажку и в то же время и фотографировать»;
// «Для телефона отдельный и легкий просмотр»).
//
// Строка документов объекта под разделами формы; касание — документ на месте:
// на телефоне в верхней части экрана, на широком — справа. Форма и кнопка
// камеры работают. Пальцами — масштаб и сдвиг, двойное касание — крупнее или
// обратно, колесо — масштаб; страницы листаются; у каждого документа
// помнится масштаб, сдвиг и страница. «Свернуть» — полоска с названием.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: страницы документа — изображения, подготовленные
// сервером (PDF — постранично), и заранее лежат на телефоне: на месте связь
// плохая. Развилка — сколько хранить на телефоне и когда чистить.
import { esc } from '../../kernel/dom.js';

const KIND_LABEL = { genplan: 'Генплан', tp: 'Техпаспорт', floor: 'Поэтажный план', doc: 'Документ' };

export function kindOfDoc(d) {
  const t = `${d.type || ''} ${d.title || d.name || ''}`.toLowerCase();
  if (/генплан|ситуацион|кадастров.*план|план участка/.test(t)) return 'genplan';
  if (/поэтаж|экспликац|планировк/.test(t)) return 'floor';
  if (/техпаспорт|технический паспорт|\bтп\b/.test(t)) return 'tp';
  return 'doc';
}

// --- условные демо-документы ----------------------------------------------
// Схемы без настоящих данных, с пометкой «ДЕМО»: в демо у литер нет ни
// техпаспорта, ни поэтажного плана. Генплан рисует литеры этого ОЦ.
const svgUrl = (body, w, h) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Arial, sans-serif">${body}`
  + `<text x="${w - 20}" y="${h - 20}" text-anchor="end" font-size="28" fill="#c0392b" opacity=".55" font-weight="700">ДЕМО</text></svg>`);
const x = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function demoGenplan(rec, title) {
  const lits = ((rec && rec.oi) || []).filter((o) => o.card === 'building');
  const boxes = lits.map((o, i) => {
    const bx = 160 + (i % 3) * 230;
    const by = 170 + Math.floor(i / 3) * 190;
    return `<rect x="${bx}" y="${by}" width="180" height="120" fill="#e8eef6" stroke="#1f3b5c" stroke-width="3"/>
      <text x="${bx + 90}" y="${by + 55}" text-anchor="middle" font-size="34" font-weight="700" fill="#1f3b5c">${x(o.letter || String.fromCharCode(1040 + i))}</text>
      <text x="${bx + 90}" y="${by + 90}" text-anchor="middle" font-size="15" fill="#1f3b5c">${x((o.name || '').slice(0, 22))}</text>`;
  }).join('');
  return svgUrl(`<rect width="900" height="700" fill="#fbfaf6"/>
    <text x="40" y="56" font-size="26" font-weight="700" fill="#222">${x(title)}</text>
    <text x="40" y="84" font-size="15" fill="#555">Масштаб 1:500 · условная схема</text>
    <polygon points="90,120 830,110 860,640 70,660" fill="#eef5e9" stroke="#2e7d32" stroke-width="4" stroke-dasharray="14 8"/>
    ${boxes}
    <path d="M800 170 l20 -50 l20 50 l-20 -12z" fill="#222"/><text x="820" y="196" text-anchor="middle" font-size="18">С</text>`, 900, 700);
}
function demoTp(oi, title) {
  const rows = ['Литера', 'Назначение', 'Год постройки', 'Этажность', 'Материал стен', 'Площадь застройки, м²', 'Общая площадь, м²']
    .map((r, i) => `<text x="70" y="${250 + i * 46}" font-size="18" fill="#333">${r}</text><line x1="70" y1="${262 + i * 46}" x2="630" y2="${262 + i * 46}" stroke="#bbb"/>`).join('');
  return svgUrl(`<rect width="700" height="990" fill="#fff"/><rect x="30" y="30" width="640" height="930" fill="none" stroke="#333" stroke-width="2"/>
    <text x="350" y="110" text-anchor="middle" font-size="28" font-weight="700">ТЕХНИЧЕСКИЙ ПАСПОРТ</text>
    <text x="350" y="150" text-anchor="middle" font-size="18" fill="#444">${x(title)}</text>
    <text x="350" y="185" text-anchor="middle" font-size="16" fill="#666">${x((oi && oi.name) || '')}</text>${rows}
    <rect x="70" y="620" width="560" height="280" fill="#f4f4f4" stroke="#999"/><text x="350" y="770" text-anchor="middle" font-size="18" fill="#888">План строения</text>`, 700, 990);
}
function demoFloor(oi, title) {
  const rooms = [[60, 120, 260, 200, '1', '24,6'], [320, 120, 200, 200, '2', '18,1'], [520, 120, 220, 200, '3', '20,4'],
    [60, 320, 160, 160, '4', '9,2'], [220, 320, 300, 160, '5', 'коридор'], [520, 320, 220, 160, '6', '12,8']];
  return svgUrl(`<rect width="800" height="560" fill="#fff"/>
    <text x="40" y="60" font-size="24" font-weight="700">${x(title)}</text>
    <text x="40" y="88" font-size="15" fill="#555">${x((oi && oi.name) || '')} · 1 этаж · условная схема</text>
    ${rooms.map(([rx, ry, rw, rh, n, a]) => `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="#222" stroke-width="5"/>
      <text x="${rx + rw / 2}" y="${ry + rh / 2}" text-anchor="middle" font-size="26" font-weight="700">${n}</text>
      <text x="${rx + rw / 2}" y="${ry + rh / 2 + 28}" text-anchor="middle" font-size="16" fill="#555">${a}</text>`).join('')}`, 800, 560);
}

// Документы объекта имущества: свои документы ОИ, участка, на котором он
// стоит, и объекта оценки; виды, которых нет, — условными демо-документами.
export function docsForOi(rec, oi) {
  if (!rec || !oi) return [];
  const all = (rec.oi || []);
  const land = all.find((o) => o.card === 'land' && o.id === oi.landId) || all.find((o) => o.card === 'land');
  const real = [
    ...(oi.docs || []).map((d) => ({ d, owner: 'объект' })),
    ...(land && land !== oi ? (land.docs || []).map((d) => ({ d, owner: 'участок' })) : []),
    ...(rec.docs || []).map((d) => ({ d, owner: 'объект оценки' })),
  ].map(({ d, owner }) => ({
    id: d.id, kind: kindOfDoc(d), title: d.title || d.name || d.type || 'Документ', owner,
    pages: d.pages ? d.pages.map((p) => p.dataUrl || p.url).filter(Boolean) : [(d.file && (d.file.dataUrl || d.file.url))].filter(Boolean),
    pdf: !!(d.file && /pdf/.test(d.file.type || d.file.name || '')),
  }));
  const has = (k) => real.some((r) => r.kind === k && r.pages.length);
  const demo = [];
  if (!has('genplan')) demo.push({ id: `demo-gp-${rec.id}`, kind: 'genplan', title: 'Генплан участка', owner: 'демо', demo: true, pages: [demoGenplan(rec, 'Генплан участка')] });
  if ((oi.card === 'building' || oi.card === 'apartment') && !has('tp')) demo.push({ id: `demo-tp-${oi.id}`, kind: 'tp', title: 'Техпаспорт', owner: 'демо', demo: true, pages: [demoTp(oi, 'Техпаспорт'), demoFloor(oi, 'Экспликация')] });
  if ((oi.card === 'building' || oi.card === 'apartment') && !has('floor')) demo.push({ id: `demo-fl-${oi.id}`, kind: 'floor', title: 'Поэтажный план', owner: 'демо', demo: true, pages: [demoFloor(oi, 'Поэтажный план')] });
  // Порядок — как смотрят на месте: генплан, техпаспорт, поэтажный, остальное.
  const order = { genplan: 0, tp: 1, floor: 2, doc: 3 };
  return [...real, ...demo].sort((a, b) => order[a.kind] - order[b.kind]);
}

// Строка документов и открытый документ.
export function viewerHTML(docs, st) {
  if (!docs.length) return '';
  const cur = docs.find((d) => d.id === st.open);
  const v = cur ? (st.views[cur.id] || { page: 0 }) : null;
  const pages = cur ? cur.pages : [];
  const page = v ? Math.min(v.page || 0, Math.max(0, pages.length - 1)) : 0;
  return `<div class="ins-docbar ${cur ? 'open' : ''} ${cur && st.collapsed ? 'collapsed' : ''}" data-docbar>
    <div class="ins-docbar-row" role="toolbar" aria-label="Документы объекта">
      ${docs.map((d) => `<button type="button" class="ins-docchip ${cur && cur.id === d.id ? 'on' : ''}" data-doc-view="${esc(d.id)}"
        aria-pressed="${cur && cur.id === d.id ? 'true' : 'false'}" title="${esc(d.title + (d.owner ? ' · ' + d.owner : ''))}">
        ${esc(KIND_LABEL[d.kind] === 'Документ' ? d.title : KIND_LABEL[d.kind])}${d.demo ? '<i>демо</i>' : ''}</button>`).join('')}
    </div>
    ${cur ? `<section class="ins-viewer" aria-label="${esc(cur.title)}">
      <div class="ins-viewer-bar">
        <b title="${esc(cur.title)}">${esc(cur.title)}</b>
        ${pages.length > 1 ? `<span class="ins-viewer-pages">
          <button type="button" data-doc-page="-1" aria-label="Предыдущая страница" ${page ? '' : 'disabled'}>‹</button>
          <span>${page + 1} / ${pages.length}</span>
          <button type="button" data-doc-page="1" aria-label="Следующая страница" ${page < pages.length - 1 ? '' : 'disabled'}>›</button></span>` : ''}
        <button type="button" class="ins-viewer-b" data-doc-fit aria-label="Целиком" title="Целиком">⤢</button>
        <button type="button" class="ins-viewer-b" data-doc-collapse aria-label="${st.collapsed ? 'Развернуть' : 'Свернуть'}" title="${st.collapsed ? 'Развернуть' : 'Свернуть'}">${st.collapsed ? '▾' : '▴'}</button>
        <button type="button" class="ins-viewer-b" data-doc-close aria-label="Закрыть документ" title="Закрыть">✕</button>
      </div>
      ${st.collapsed ? '' : `<div class="ins-viewer-stage" data-doc-stage>
        ${pages.length
    ? `<img src="${esc(pages[page])}" alt="${esc(cur.title)} — страница ${page + 1}" data-doc-img draggable="false">`
    : '<p class="ins-viewer-none">Файла у документа нет — попросите ЦОД приложить.</p>'}
      </div>`}
    </section>` : ''}
  </div>`;
}

// Масштаб и сдвиг: указатели (два пальца — масштаб, один — сдвиг), колесо,
// двойное касание. Положение — в st.views[id] и переживает перерисовку.
export function bindViewer(root, st, docId) {
  const stage = root.querySelector('[data-doc-stage]');
  const img = root.querySelector('[data-doc-img]');
  if (!stage || !img || !docId) return;
  const v = st.views[docId] = st.views[docId] || { page: 0 };
  const apply = () => { img.style.transform = `translate(${v.x || 0}px, ${v.y || 0}px) scale(${v.s || 1})`; };
  const fit = () => { v.s = 1; v.x = 0; v.y = 0; apply(); };
  if (!v.s) fit(); else apply();
  const clamp = (s) => Math.max(1, Math.min(8, s));
  const zoomAt = (ns, cx, cy) => {
    const r = stage.getBoundingClientRect();
    const px = cx - r.left - r.width / 2;
    const py = cy - r.top - r.height / 2;
    const k = ns / (v.s || 1);
    v.x = px - (px - (v.x || 0)) * k;
    v.y = py - (py - (v.y || 0)) * k;
    v.s = ns;
    if (ns === 1) { v.x = 0; v.y = 0; }
    apply();
  };
  const pts = new Map();
  let last = null;
  let lastTap = 0;
  stage.onpointerdown = (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = Date.now();
    if (pts.size === 1 && now - lastTap < 300) zoomAt((v.s || 1) > 1.2 ? 1 : 2.5, e.clientX, e.clientY);
    lastTap = now;
    last = null;
  };
  stage.onpointermove = (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (last) zoomAt(clamp((v.s || 1) * (d / last)), (a.x + b.x) / 2, (a.y + b.y) / 2);
      last = d;
    } else if (pts.size === 1 && (v.s || 1) > 1) {
      v.x = (v.x || 0) + e.clientX - prev.x;
      v.y = (v.y || 0) + e.clientY - prev.y;
      apply();
    }
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) last = null; };
  stage.onpointerup = up;
  stage.onpointercancel = up;
  stage.onwheel = (e) => { e.preventDefault(); zoomAt(clamp((v.s || 1) * (e.deltaY < 0 ? 1.2 : 1 / 1.2)), e.clientX, e.clientY); };
  root.querySelectorAll('[data-doc-fit]').forEach((b) => { b.onclick = fit; });
}
