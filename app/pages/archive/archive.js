// Архив документов — отдельный экран (решение пользователя 2026-09-02).
//
// Документ, убранный из карточки, не исчезает: он переезжает сюда, где его
// можно найти поиском и вернуть на место. Экран общий для всех типов ОЦ —
// сам он ни одного из них не знает, а собирает архив через реестр модулей
// (kernel/archive.js).
//
// Права: администратор и «любая роль» видят весь архив, остальные — только по
// своим учреждениям (kernel/session.js). Это то же правило, по которому
// открывается лог действий: доступ к истории объекта — одно понятие, а не два.
import { esc } from '../../kernel/dom.js';
import { fmtEni } from '../../kernel/fmt.js';
import { queryArchive, archiveFacets, findRecordOf, restoreDoc } from '../../kernel/archive.js';
import { canSeeInstitution, seesEverything, myInstitutions, session } from '../../kernel/session.js';
import { sortedTypes } from '../../kernel/registry.js';
import { setCrumbs, setActiveNav } from '../../shell/shell.js';

const state = {
  q: '',
  docType: [],
  institution: [],
  typeId: [],
  from: '',
  to: '',
};

// Доступ к самому экрану: сотруднику без учреждений показывать нечего.
export function canViewArchive() {
  return seesEverything() || myInstitutions().length > 0;
}

function chipList(title, values, selected, key) {
  const items = Object.entries(values).sort((a, b) => b[1] - a[1]);
  if (!items.length) return '';

  return `<div class="arc-facet">
    <div class="arc-facet-head">${esc(title)}</div>
    <div class="arc-chips">
      ${items.map(([value, n]) => `<button class="arc-chip ${selected.includes(value) ? 'on' : ''}"
        data-facet="${esc(key)}" data-value="${esc(value)}">${esc(value)}<span>${n}</span></button>`).join('')}
    </div>
  </div>`;
}

function rowHTML(entry) {
  const from = entry.from;
  return `<tr data-arc-row="${esc(from.ocId)}|${esc(entry.id)}">
    <td>
      <div class="arc-doc"><b>${esc(entry.name)}</b><span class="arc-type">${esc(entry.type)}</span></div>
    </td>
    <td>
      <div class="arc-from">
        <span class="mono">${esc(fmtEni(from.eni))}</span>
        <span class="ell" title="${esc(from.ocTitle)}">${esc(from.ocTitle)}</span>
        <span class="arc-scope">${esc(from.scopeLabel)}</span>
      </div>
    </td>
    <td><span class="ell" title="${esc(from.institution)}">${esc(from.institution || '—')}</span></td>
    <td>${esc(entry.archivedBy || '—')}</td>
    <td class="mono">${esc(entry.archivedAt || '—')}</td>
    <td class="arc-act">
      ${entry.file ? `<a class="btn btn-ghost btn-sm" href="${esc(entry.file.dataUrl)}" target="_blank"
        rel="noopener" title="Открыть файл в новой вкладке">Открыть</a>` : ''}
      <button class="btn btn-ghost btn-sm" data-arc-goto="${esc(from.typeId)}|${esc(from.ocId)}"
        title="Перейти к объекту оценки">К объекту</button>
      <button class="btn btn-primary btn-sm" data-arc-restore="${esc(from.ocId)}|${esc(entry.id)}"
        title="Вернуть документ в карточку, откуда он был убран">Вернуть</button>
    </td>
  </tr>`;
}

function viewHTML() {
  const rows = queryArchive(state, canSeeInstitution);
  const facets = archiveFacets(canSeeInstitution);
  const typeNames = {};
  sortedTypes().forEach((t) => { typeNames[t.manifest.id] = t.manifest.label || t.manifest.id; });

  const scopeNote = seesEverything()
    ? 'Виден архив по всем учреждениям.'
    : `Виден архив учреждений: ${esc(myInstitutions().join(', '))}.`;

  const empty = facets.total === 0
    ? `<div class="arc-empty">В архиве пока ничего нет.<br>
         Документ попадает сюда, когда его убирают из карточки кнопкой «В архив» в просмотрщике.</div>`
    : `<div class="arc-empty">Ничего не найдено. Измените запрос или снимите фильтры.</div>`;

  return `<div class="arc">
    <div class="arc-head">
      <div>
        <h2>Архив документов</h2>
        <div class="arc-note">${scopeNote} Всего в архиве: <b>${facets.total}</b>.</div>
      </div>
      <div class="arc-search">
        <input class="input" data-arc-q value="${esc(state.q)}" autocomplete="off"
          placeholder="Поиск: имя файла, тип, объект, код ЕНИ, учреждение, кто убрал…">
        ${state.q || state.docType.length || state.institution.length || state.typeId.length || state.from || state.to
          ? '<button class="btn btn-ghost btn-sm" data-arc-reset>Сбросить</button>' : ''}
      </div>
    </div>

    <div class="arc-facets">
      ${chipList('Тип документа', facets.docType, state.docType, 'docType')}
      ${chipList('Тип ОЦ', Object.fromEntries(Object.entries(facets.typeId)
        .map(([k, n]) => [typeNames[k] || k, n])), state.typeId.map((k) => typeNames[k] || k), 'typeIdLabel')}
      ${chipList('Учреждение', facets.institution, state.institution, 'institution')}
      <div class="arc-facet">
        <div class="arc-facet-head">Убрано в период</div>
        <div class="arc-dates">
          <input class="input" type="date" data-arc-from value="${esc(state.from)}" title="С этой даты">
          <span class="muted">—</span>
          <input class="input" type="date" data-arc-to value="${esc(state.to)}" title="По эту дату">
        </div>
      </div>
    </div>

    <div class="arc-body">
      ${rows.length ? `<table class="tbl arc-tbl">
        <thead><tr>
          <th style="width:22%">Документ</th>
          <th style="width:25%">Откуда</th>
          <th style="width:14%">Учреждение</th>
          <th style="width:10%">Убрал</th>
          <th style="width:8%">Дата</th>
          <th style="width:21%">Действия</th>
        </tr></thead>
        <tbody>${rows.map(rowHTML).join('')}</tbody>
      </table>
      <div class="arc-count">Показано: <b>${rows.length}</b> из ${facets.total}</div>` : empty}
    </div>
  </div>`;
}

export function mountArchive(host) {
  const scope = host.scope;
  document.body.dataset.page = 'archive';
  setActiveNav('archive');
  setCrumbs([{ label: 'Главная', to: '#/' }, { label: 'Архив документов', current: true }]);

  function render() {
    scope.setHTML(viewHTML());
    bind();
  }

  function bind() {
    const q = scope.$('[data-arc-q]');
    if (q) {
      // Поиск по мере набора: архив невелик по сравнению с реестром, страницы
      // ему не нужны, поэтому и задержки не нужно.
      q.oninput = () => {
        state.q = q.value;
        const pos = q.selectionStart;
        render();
        const again = scope.$('[data-arc-q]');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
      };
    }

    scope.$$('[data-facet]').forEach((b) => b.onclick = () => {
      const key = b.dataset.facet;
      const value = b.dataset.value;

      // Тип ОЦ в фильтре хранится идентификатором, а показывается названием.
      if (key === 'typeIdLabel') {
        const t = sortedTypes().find((x) => (x.manifest.label || x.manifest.id) === value);
        const id = t ? t.manifest.id : value;
        const i = state.typeId.indexOf(id);
        if (i >= 0) state.typeId.splice(i, 1); else state.typeId.push(id);
      } else {
        const list = state[key];
        const i = list.indexOf(value);
        if (i >= 0) list.splice(i, 1); else list.push(value);
      }
      render();
    });

    const from = scope.$('[data-arc-from]');
    if (from) from.onchange = () => { state.from = from.value; render(); };
    const to = scope.$('[data-arc-to]');
    if (to) to.onchange = () => { state.to = to.value; render(); };

    const reset = scope.$('[data-arc-reset]');
    if (reset) reset.onclick = () => {
      state.q = '';
      state.docType = [];
      state.institution = [];
      state.typeId = [];
      state.from = '';
      state.to = '';
      render();
    };

    scope.$$('[data-arc-goto]').forEach((b) => b.onclick = () => {
      const [typeId, ocId] = b.dataset.arcGoto.split('|');
      location.hash = `#/oc/${encodeURIComponent(typeId)}/${encodeURIComponent(ocId)}`;
    });

    scope.$$('[data-arc-restore]').forEach((b) => b.onclick = async () => {
      const [ocId, docId] = b.dataset.arcRestore.split('|');
      const rows = queryArchive({}, canSeeInstitution);
      const entry = rows.find((e) => e.id === docId && e.from.ocId === ocId);
      if (!entry) return;

      const rec = findRecordOf(entry);
      if (!rec) {
        host.toast('Объект оценки не найден — вернуть документ некуда', 'warn');
        return;
      }

      const res = restoreDoc(rec, docId);
      render();
      if (!res) return;
      host.toast(res.movedToOc
        ? `Литеры уже нет — документ возвращён в документы объекта оценки`
        : `Документ возвращён: ${res.restoredTo}`, 'ok');
    });
  }

  render();

  // Смена роли или списка учреждений меняет видимый архив — перерисовываем.
  const off = session.subscribe(() => render());

  return {
    onRoute() { render(); },
    destroy() { if (off) off(); },
  };
}
