import { esc } from '../../../../kernel/dom.js';
import { photoPages, photoFileAt } from '../photos/model.js';
import { DOC_TYPES } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

// Выезжающий сайдбар просмотрщика (кнопка-гамбургер в левом верхнем углу).
//
// Зачем: раньше выбрать можно было только среди документов, УЖЕ открытых
// вкладками, либо через выпадашку «+ документ» с ограниченным набором scope.
// Здесь — всё, что есть в записи ОЦ целиком: документы самого ОЦ и всех литер,
// а в фоторежиме — все фото по литерам и категориям. Что показывать, зависит от
// режима просмотрщика: документы, фото, либо и то и другое в «Сравнении».

// Все документы записи: и уровня ОЦ, и всех литер — «любой из ОЦ».
function allDocs(rec) {
  const out = (rec.docs || []).map((d) => ({ scope: 'oc', label: 'ОЦ', doc: d }));
  (rec.oi || []).forEach((oi) => {
    (oi.docs || []).forEach((d) => out.push({
      scope: oi.id,
      label: oi.letter ? `Лит ${oi.letter}` : (oi.name || 'ОИ'),
      doc: d,
    }));
  });
  return out;
}

function docItemHTML(x, active) {
  const on = active && active.scope === x.scope && active.id === x.doc.id;
  const pages = x.doc.pages ? x.doc.pages.length : null;

  return `<button class="vsb-item ${on ? 'on' : ''}" data-vsb-doc="${esc(x.scope)}|${esc(x.doc.id)}">
    <span class="vsb-tag">${esc(x.label)}</span>
    <span class="vsb-main"><b>${esc(x.doc.name)}</b><span class="vsb-sub">${esc(x.doc.date || '')}</span></span>
    ${pages ? `<span class="vsb-count">${pages}</span>` : ''}
  </button>`;
}

// Документы сгруппированы по типу — техпаспорта, ПУДы, госакты и т.д. (Л3.5).
// Порядок групп берётся из словаря opt('oc', 'docType', DOC_TYPES), а не из порядка прикрепления:
// так список выглядит одинаково у любой записи. Типы, которых нет в словаре
// (пришли из старых данных), идут в конце — терять их нельзя.
function docsSection(ctx, active) {
  const items = allDocs(ctx.rec);
  if (!items.length) return '<div class="vsb-empty">Документов пока нет</div>';

  const known = opt('oc', 'docType', DOC_TYPES).filter((t) => items.some((x) => x.doc.type === t));
  const rest = [...new Set(items.map((x) => x.doc.type))].filter((t) => !opt('oc', 'docType', DOC_TYPES).includes(t));

  return [...known, ...rest].map((type) => {
    const group = items.filter((x) => x.doc.type === type);
    return `<div class="vsb-group">
      <div class="vsb-group-h">${esc(type)}<span class="vsb-group-n">${group.length}</span></div>
      ${group.map((x) => docItemHTML(x, active)).join('')}
    </div>`;
  }).join('');
}

function photosSection(ctx) {
  const rows = [];

  (ctx.rec.oi || []).forEach((oi) => {
    const pages = photoPages(oi);
    if (!pages.length) return;

    const label = oi.letter ? `Лит ${oi.letter} · ${oi.name}` : (oi.name || 'ОИ');
    rows.push(`<div class="vsb-group">${esc(label)}</div>`);

    pages.forEach((p, idx) => {
      const f = photoFileAt(oi, p.cat, p.i);
      rows.push(`<button class="vsb-item vsb-photo" data-vsb-photo="${esc(oi.id)}|${idx + 1}">
        <span class="vsb-thumb"${f ? ` style="background-image:url('${f.dataUrl}')"` : ''}></span>
        <span class="vsb-main"><b>${esc(p.cat)}</b><span class="vsb-sub">фото ${p.i + 1}</span></span>
      </button>`);
    });
  });

  return rows.length ? rows.join('') : '<div class="vsb-empty">Фотографий пока нет</div>';
}

export function viewerSidebarHTML(ctx, mode) {
  if (!ctx.ui.viewerSidebar) return '';

  const active = ctx.ui.viewerDoc;
  const showDocs = mode === 'doc' || mode === 'compare';
  const showPhotos = mode === 'photo' || mode === 'compare';

  return `<div class="vsb" data-vsb>
    <div class="vsb-head">Выбрать<button class="tool-btn" data-vsb-close title="Закрыть">×</button></div>
    <div class="vsb-body">
      ${showDocs ? `<div class="vsb-sec">Документы объекта оценки</div>${docsSection(ctx, active)}` : ''}
      ${showPhotos ? `<div class="vsb-sec">Фото по литерам</div>${photosSection(ctx)}` : ''}
    </div>
  </div>`;
}
