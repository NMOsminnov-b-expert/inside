import { esc } from '../../../../kernel/dom.js';
import { docListFor, scopeLabel } from '../docs/model.js';
import { VS } from './state.js';

function realFilePageHTML(f) {
  if (f.kind === 'image') {
    return `<img src="${f.dataUrl}" alt="${esc(f.name)}" style="max-width:100%;display:block;margin:0 auto;">`;
  }
  if (f.kind === 'pdf') {
    return `<embed src="${f.dataUrl}" type="application/pdf" style="width:100%;height:78vh;border:0;">`;
  }
  return `<div class="vempty-box">Предпросмотр недоступен для этого типа файла (${esc(f.mime || 'неизвестный формат')}).</div>
<a class="btn btn-primary btn-sm" href="${f.dataUrl}" download="${esc(f.name)}" style="margin-top:8px;display:inline-block">Скачать «${esc(f.name)}»</a>`;
}

export function docPageHTML(d, n) {
  if (d.file) return realFilePageHTML(d.file);

  if (n === 1 || d.pages[n - 1].kind === 'title') {
    return `<div class="pp-h">${esc(d.type)}</div><div class="pp-sub">${esc(d.name)} · страница 1</div>
      <div class="sk-h"></div>${[100, 94, 97, 88].map((w) => `<div class="sk-line" style="width:${w}%"></div>`).join('')}
      <table class="sk-table"><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></table>
      <div class="sk-h" style="width:30%"></div>${[96, 90].map((w) => `<div class="sk-line" style="width:${w}%"></div>`).join('')}`;
  }
  return `<div class="pp-sub" style="margin-top:0">${esc(d.name)} · страница ${n}</div>
    <div class="sk-h"></div>${[100, 92, 96, 85, 93, 60].map((w) => `<div class="sk-line" style="width:${w}%"></div>`).join('')}
    ${n % 2 === 0 ? `<table class="sk-table"><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr></table>` : ''}
    <div class="sk-h" style="width:34%"></div>${[95, 88].map((w) => `<div class="sk-line" style="width:${w}%"></div>`).join('')}`;
}

export function renderDocMode(ctx, vctx) {
  const { scopes, vd, d, dSt } = vctx;

  if (!d) {
    return {
      toolbar: `<div class="vtoolbar"><div class="tool-group right"><span class="vtitle">Документы</span><button class="tool-btn" data-vclose>×</button></div></div>`,
      body: `<div class="vempty"><div class="vempty-box">Нет прикреплённых документов</div><button class="btn btn-primary" data-attach-default>Прикрепить файл</button></div>`,
    };
  }

  const all = [];
  scopes.forEach((sc) => {
    (VS.openTabs[sc] || []).forEach((id) => {
      const t = docListFor(ctx, sc).find((x) => x.id === id);
      if (t) all.push({ sc, t });
    });
  });

  const remaining = [];
  scopes.forEach((sc) => {
    docListFor(ctx, sc).forEach((t) => {
      if (!(VS.openTabs[sc] || []).includes(t.id)) remaining.push({ sc, t });
    });
  });

  const tabsBar = `<div class="vtabs">
    ${all.map((x) => `<button class="vtab ${vd && vd.scope === x.sc && vd.id === x.t.id ? 'active' : ''}" data-vtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)}${all.length > 1 ? `<span data-vtabclose="${x.sc}|${x.t.id}">×</span>` : ''}</button>`).join('')}
    ${remaining.length ? `<div class="dd"><button class="btn btn-ghost btn-sm" data-dd-toggle style="margin:0 0 4px 4px">+ документ</button>
      <div class="dd-menu">${remaining.map((x) => `<button data-vaddtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)} · ${esc(x.t.name)}</button>`).join('')}</div></div>` : ''}
  </div>`;

  const toolbar = `<div class="vtoolbar">
    <div class="tool-group"><button class="tool-btn" data-vprev>‹</button>
      <input class="page-input" data-vpage value="${dSt.page}"><span class="muted">/ ${d.pages.length}</span>
      <button class="tool-btn" data-vnext>›</button></div>
    <div class="tool-group"><button class="tool-btn" data-vrot>⟳</button></div>
    <div class="tool-group"><button class="tool-btn" data-vzoom->−</button><span class="zoom-label" data-zoomlabel>${VS.zoom}%</span><button class="tool-btn" data-vzoom+>+</button></div>
    <div class="tool-group right"><span class="vtitle">${esc(d.type)} · ${esc(d.name)}</span><button class="tool-btn" data-vclose>×</button></div>
  </div>`;

  const body = `<div class="vbody"><div class="vrail"><div class="vrail-list">
    ${d.pages.map((p, i) => `<div class="vthumb doc ${i + 1 === dSt.page ? 'active' : ''}" data-vthumb="${i + 1}" title="Страница ${i + 1}">
      ${d.file ? '' : `<button class="vthumb-del" data-vdelpage="${i + 1}">×</button>`}<span class="vthumb-num">${i + 1}</span></div>`).join('')}
    </div>${d.file ? '' : `<button class="btn btn-ghost btn-sm" data-vaddpage style="margin:6px">+ Страница</button>`}</div>
    <div class="vstage" data-vstage><div class="vribbon" data-vribbon>
      ${d.pages.map((p, i) => `<div class="vpage-wrap" data-vpageblk="${i + 1}"><div class="vpage" data-vpageinner style="transform:rotate(${dSt.rot}deg)">${docPageHTML(d, i + 1)}</div></div>`).join('')}
    </div></div></div>`;

  return { tabsBar, toolbar, body };
}
