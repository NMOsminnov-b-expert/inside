import { esc } from '../../../../kernel/dom.js';

export function docsTableHTML(rec, withDel) {
  const docs = rec.docs || [];

  return `<table class="tbl">
    <colgroup><col style="width:150px"><col><col style="width:90px"><col style="width:${withDel ? 60 : 40}px"></colgroup>
    <thead><tr><th>Тип</th><th>Наименование</th><th>Дата</th><th></th></tr></thead>
    <tbody>${docs.map((d) => `<tr class="clickable" data-open-doc="${d.id}" title="Открыть документ в просмотрщике">
      <td><span class="tag-mini">${esc(d.type)}</span></td><td class="ell">${esc(d.name)}</td><td>${esc(d.date)}</td>
      <td><div class="row-actions">${withDel ? `<button class="btn btn-danger btn-sm" data-doc-del="${d.id}" title="Открепить документ">×</button>` : ''}<span class="rowchev-open">›</span></div></td></tr>`).join('')}</tbody>
  </table>`;
}

export function docsBlockInner(oi, scope) {
  return `<table class="tbl"><colgroup><col style="width:130px"><col><col style="width:90px"><col style="width:40px"></colgroup><thead><tr><th>Тип</th><th>Наименование</th><th>Дата</th><th></th></tr></thead>
  <tbody>${(oi.docs || []).map((d) => `<tr class="clickable" data-open-movdoc="${scope}|${d.id}" title="Открыть документ в просмотрщике">
    <td><span class="tag-mini">${esc(d.type)}</span></td><td class="ell">${esc(d.name)}</td><td>${esc(d.date)}</td>
    <td><span class="rowchev-open">›</span></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Нет документов</td></tr>'}</tbody></table>
  <button class="btn btn-ghost btn-sm" data-add-movdoc style="margin-top:6px">+ Добавить документ</button>`;
}
