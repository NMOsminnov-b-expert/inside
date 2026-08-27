import { esc } from '../../../../kernel/dom.js';
import { photoPages, photoMatches, photoFileAt } from './model.js';
import { splitWrap, viewerHTML } from '../viewer/shell.js';
import { openPhotoInPlace } from '../viewer/state.js';

// Фото удалённых литер: сама литера удалена, но её фото сохранены на уровне
// ОЦ с пометкой, какой литере принадлежали (см. index.js deleteOi). Тайлы не
// кликабельны: просмотрщик открывает фото по маршруту литеры, которой уже нет.
function orphanSectionsHTML(ctx) {
  const q = ctx.ui.photoQuery || '';
  return (ctx.rec.ocOrphanPhotos || []).map((o) => {
    const pages = photoPages(o)
      .map((p, i) => ({ cat: p.cat, i: p.i, idx: i }))
      .filter((p) => photoMatches(o, p.cat, p.idx, q));
    if (!pages.length) return '';
    return `<div class="photo-sec">
      <div class="photo-sec-h">Литера ${esc(o.letter || '—')} (удалена) · ${esc(o.name)} <span class="tag-mini">${pages.length}</span></div>
      <div class="tile-grid">${pages.map((p) => {
        const f = photoFileAt(o, p.cat, p.i);
        return `<div class="tile tile-orphan" title="${esc(p.cat)} · фото ${p.i + 1} — принадлежало литере ${esc(o.letter || '')} «${esc(o.name)}»">
        <div class="tile-img">${f ? `<img src="${f.dataUrl}" alt="">` : esc(p.cat)}</div>
        <div class="tile-cap">${esc(p.cat)} · фото ${p.i + 1}</div>
      </div>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

export function photoSectionsHTML(ctx) {
  const q = ctx.ui.photoQuery || '';
  const objects = ctx.rec.oi;

  const sections = objects.map((oi) => {
    const pages = photoPages(oi)
      .map((p, i) => ({ cat: p.cat, i: p.i, idx: i }))
      .filter((p) => photoMatches(oi, p.cat, p.idx, q));

    if (!pages.length) return '';

    const head = oi.card === 'land'
      ? 'Земельный участок'
      : `Литера ${esc(oi.letter)} · ${esc(oi.name)}`;

    return `<div class="photo-sec">
      <div class="photo-sec-h">${head} <span class="tag-mini">${pages.length}</span></div>
      <div class="tile-grid">${pages.map((p) => `<div class="tile" data-tile-photo="${oi.id}|${p.idx}" title="${esc(p.cat)} · фото ${p.i + 1}">
        <div class="tile-img">${(() => { const f = photoFileAt(oi, p.cat, p.i); return f ? `<img src="${f.dataUrl}" alt="">` : esc(p.cat); })()}</div>
        <div class="tile-cap">${esc(p.cat)} · фото ${p.i + 1}</div>
      </div>`).join('')}</div>
    </div>`;
  }).join('');

  const orphans = orphanSectionsHTML(ctx);
  const orphanBlock = orphans
    ? `<div class="sec-h" style="margin-top:14px">Фото без литеры <span class="muted" style="font-weight:400">— литера удалена, фото сохранены</span></div>${orphans}`
    : '';

  return (sections + orphanBlock) || `<div class="note-empty">Ничего не найдено по запросу «${esc(q)}».</div>`;
}

export function photosTab(ctx) {
  return splitWrap(
    (ctx.ui.viewer && ctx.ui.viewer.mode === 'photo') ? viewerHTML(ctx) : null,
    `<div class="card t-blue">
      <div class="card-head"><span class="card-idx">03</span><h3>Фото по литерам</h3><span class="hint">крупные плитки; поиск по литере и названию</span>
        <input class="input" id="photoSearch" style="margin-left:auto;max-width:340px" placeholder="Напр.: Лит А фасад" value="${esc(ctx.ui.photoQuery || '')}">
      </div>
      <div class="card-pad" id="photoSections">${photoSectionsHTML(ctx)}</div>
    </div>`);
}

function bindTiles(ctx) {
  ctx.scope.$$('[data-tile-photo]').forEach((t) => {
    t.onclick = () => {
      const [oiId, idx] = t.dataset.tilePhoto.split('|');
      openPhotoInPlace(ctx, oiId, +idx);
    };
  });
}

export function bindPhotoExplorer(ctx) {
  const ps = ctx.scope.$('#photoSearch');
  if (ps) ps.oninput = () => {
    ctx.ui.photoQuery = ps.value;
    const sec = ctx.scope.$('#photoSections');
    if (sec) sec.innerHTML = photoSectionsHTML(ctx);
    bindTiles(ctx);
  };
  bindTiles(ctx);
}
