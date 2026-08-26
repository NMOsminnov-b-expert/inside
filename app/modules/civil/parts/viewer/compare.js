import { esc } from '../../../../kernel/dom.js';
import { VS } from './state.js';
import { docPageHTML } from './doc.js';
import { photoFileAt } from '../photos/model.js';

// Режим «Сравнение»: фото слева, документ справа.
//
// Раньше здесь показывалась РОВНО ОДНА страница документа и одно фото, листались
// они только кнопками, а зум был общий на обе колонки. Теперь каждая колонка —
// такая же прокручиваемая лента, как в обычном режиме просмотра (колесо листает
// и фото, и документ), и у каждой колонки СВОЙ зум: сравнивают обычно мелкую
// деталь на фото с крупным планом в документе, общий зум для этого бесполезен.
export function renderCompareMode(ctx, vctx) {
  const { d, dSt, pages, groups } = vctx;
  const pSt = vctx.pSt || { page: 1, rot: 0 };

  const toolbar = `<div class="vtoolbar">
    <div class="tool-group right"><span class="vtitle">Фото + документ рядом</span><button class="tool-btn" data-vclose>×</button></div>
  </div>`;

  // Зум на колонку. cmpZoom живёт в VS рядом с остальным состоянием
  // просмотрщика, поэтому переживает перерисовку экрана.
  const zoomCtl = (which) => `<div class="tool-group cmp-zoom">
    <button class="tool-btn" data-cmp-zoom="${which}|-">−</button>
    <span class="zoom-label" data-cmp-zoomlabel="${which}">${VS.cmpZoom[which]}%</span>
    <button class="tool-btn" data-cmp-zoom="${which}|+">+</button>
  </div>`;

  let gi = 0;
  const photoRibbon = groups.map((g) => {
    const inner = g.items.map((it) => {
      gi++;
      const f = photoFileAt(vctx.oi, it.cat, it.i);
      return `<div class="vpage-wrap" data-cmp-phblk="${gi}"><div class="vpage photo-page">
        ${f ? `<img class="vimg" src="${f.dataUrl}" alt="${esc(f.name)}">`
            : `<div class="photo-fill">${esc(it.cat)} · фото ${it.i + 1}</div>`}</div></div>`;
    }).join('');
    return `<div class="vgroup-h">${esc(g.cat)} · ${g.items.length}</div>${inner}`;
  }).join('') || '<div class="vpage photo-page"><div class="photo-fill">Фото не загружены</div></div>';

  const docRibbon = d
    ? d.pages.map((p, i) => `<div class="vpage-wrap" data-cmp-dcblk="${i + 1}"><div class="vpage">${docPageHTML(d, i + 1)}</div></div>`).join('')
    : '<div class="muted" style="padding:12px">Откройте документ во вкладке «Документы»</div>';

  const body = `<div class="cmp" data-cmp>
    <div class="cmp-col">
      <div class="cmp-h">ФОТО <span data-cmp-phnum>${pages.length ? Math.min(pSt.page, pages.length) : 0}/${pages.length}</span>${zoomCtl('photo')}</div>
      <div class="cmp-body" data-cmp-stage="photo"><div class="cmp-ribbon" data-cmp-ribbon="photo" style="zoom:${VS.cmpZoom.photo / 100}">${photoRibbon}</div></div>
    </div>
    <div class="cmp-col">
      <div class="cmp-h">${d ? esc(d.type) : 'Нет документа'} <span data-cmp-dcnum>${d ? dSt.page + '/' + d.pages.length : ''}</span>${d ? zoomCtl('doc') : ''}</div>
      <div class="cmp-body" data-cmp-stage="doc"><div class="cmp-ribbon" data-cmp-ribbon="doc" style="zoom:${VS.cmpZoom.doc / 100}">${docRibbon}</div></div>
    </div>
  </div>`;

  return { toolbar, body };
}
