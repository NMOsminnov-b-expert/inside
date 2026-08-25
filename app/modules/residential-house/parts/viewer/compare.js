import { esc } from '../../../../kernel/dom.js';
import { VS } from './state.js';
import { docPageHTML } from './doc.js';

export function renderCompareMode(ctx, vctx) {
  const { d, dSt, pages, curPhoto } = vctx;
  const pSt = vctx.pSt || { page: 1 };

  const toolbar = `<div class="vtoolbar">
    <div class="tool-group"><button class="tool-btn" data-cmp-ph-prev>‹</button><span class="muted">фото</span>
      <button class="tool-btn" data-cmp-ph-next>›</button></div>
    <div class="tool-group"><button class="tool-btn" data-cmp-dc-prev>‹</button><span class="muted">документ</span>
      <button class="tool-btn" data-cmp-dc-next>›</button></div>
    <div class="tool-group"><button class="tool-btn" data-vzoom->−</button><span class="zoom-label" data-zoomlabel>${VS.zoom}%</span><button class="tool-btn" data-vzoom+>+</button></div>
    <div class="tool-group right"><span class="vtitle">Фото + документ рядом</span><button class="tool-btn" data-vclose>×</button></div>
  </div>`;

  const body = `<div class="cmp" data-cmp>
    <div class="cmp-col"><div class="cmp-h">ФОТО · ${esc(curPhoto ? curPhoto.cat : '—')} ${pSt ? Math.min(pSt.page, pages.length || 1) : 0}/${pages.length}</div>
      <div class="cmp-body">${curPhoto ? `<div class="vpage photo-page"><div class="photo-fill">${esc(curPhoto.cat)} · фото ${curPhoto.i + 1}</div></div>` : '<div class="muted">Нет фото</div>'}</div></div>
    <div class="cmp-col"><div class="cmp-h">${d ? esc(d.type) : 'Нет документа'} ${dSt ? dSt.page + '/' + d.pages.length : ''}</div>
      <div class="cmp-body">${d ? `<div class="vpage">${docPageHTML(d, dSt.page)}</div>` : '<div class="muted">Откройте документ во вкладке «Документы»</div>'}</div></div>
  </div>`;

  return { toolbar, body };
}
