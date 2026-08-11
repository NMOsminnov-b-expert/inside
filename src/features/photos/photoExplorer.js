import { OI, appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { photoPages, photoMatches } from './photoModel.js';
import { splitWrap, viewerHTML } from '../viewer/viewerShell.js';
import { openPhotoInPlace } from '../viewer/viewerState.js';

export function photoSectionsHTML() {
  const q = appState.photoQuery || '';
  const objects = OI.filter((o) => o.kind === 'realty' || o.kind === 'land');
  const sections = objects.map((oi) => {
    const pages = photoPages(oi).map((p, i) => ({ cat: p.cat, i: p.i, idx: i })).filter((p) => photoMatches(oi, p.cat, p.idx, q));
    if (!pages.length) return '';
    const head = oi.kind === 'land'
      ? 'Земельный участок'
      : `Литера ${esc(oi.letter)} · ${esc(oi.name)}`;
    return `<div class="photo-sec">
      <div class="photo-sec-h">${head} <span class="tag-mini">${pages.length}</span></div>
      <div class="tile-grid">${pages.map((p) => `<div class="tile" data-tile-photo="${oi.id}|${p.idx}" title="${esc(p.cat)} · фото ${p.i + 1}">
        <div class="tile-img">${esc(p.cat)}</div>
        <div class="tile-cap">${esc(p.cat)} · фото ${p.i + 1}</div>
      </div>`).join('')}</div>
    </div>`;
  }).join('');
  return sections || `<div class="note-empty">Ничего не найдено по запросу «${esc(q)}».</div>`;
}

export function photosTab() {
  return splitWrap(
    (appState.viewer && appState.viewer.mode === 'photo') ? viewerHTML() : null,
    `<div class="card t-blue">
      <div class="card-head"><span class="card-idx">03</span><h3>Фото по литерам</h3><span class="hint">крупные плитки; поиск по литере и названию</span>
        <input class="input" id="photoSearch" style="margin-left:auto;max-width:340px" placeholder="Напр.: Лит А фасад" value="${esc(appState.photoQuery || '')}">
      </div>
      <div class="card-pad" id="photoSections">${photoSectionsHTML()}</div>
    </div>`);
}

function bindTiles() {
  document.querySelectorAll('[data-tile-photo]').forEach((t) => {
    t.onclick = () => {
      const [oiId, idx] = t.dataset.tilePhoto.split('|');
      openPhotoInPlace(oiId, +idx);
    };
  });
}

export function bindPhotoExplorer() {
  const ps = document.getElementById('photoSearch');
  if (ps) ps.oninput = () => {
    appState.photoQuery = ps.value;
    const sec = document.getElementById('photoSections');
    if (sec) sec.innerHTML = photoSectionsHTML();
    bindTiles();
  };
  bindTiles();
}