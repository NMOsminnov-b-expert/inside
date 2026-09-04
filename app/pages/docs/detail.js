// Карточка документа — открывается кликом по строке в реестре (решение
// пользователя 2026-09-02, по присланному скриншоту): заголовок с статусом,
// полноценный просмотрщик слева (или пустое состояние с прикреплением),
// метаданные и привязка к объектам оценки справа, в сворачиваемых секциях.
import { esc } from '../../kernel/dom.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { statusTone, addFile, removeFile, addLink, removeLink } from '../../kernel/documentsRegistry.js';
import { archiveRegistryDoc } from '../../kernel/archive.js';
import { openDocumentModal, openLinkModal } from './create.js';
import { viewerHTML, bindViewer } from '../../kernel/docViewer.js';

// Какой файл документа сейчас открыт в просмотрщике — сбрасывается на первый
// файл при переходе к другому документу.
let activeFileId = null;
let lastDocId = null;

// Список соседних документов — колонкой слева, как в карточке учреждения
// (пользователь 03.09.2026: «проработай аналогично тому, как реализовано в
// учреждениях»). Сворачивается в закладку, ширина тянется перегородкой:
// просмотрщику нужно место, а список нужен не всё время.
let listOpen = true;
let listWidth = 300;
const LIST_MIN = 150;
const VIEW_MIN = 320;

// Соседние документы: стрелки со счётчиком в шапке и лента под ней. Список
// тот же, из которого документ открыли (учреждение или выборка реестра),
// поэтому переключение не выбрасывает человека из его контекста.
function navHTML(siblings) {
  if (!siblings || siblings.list.length < 2) return '';

  const { list, index } = siblings;
  const prev = list[index - 1];
  const next = list[index + 1];

  return `<div class="dd-nav">
    <button class="dd-nav-btn" data-docs-prev-doc ${prev ? '' : 'disabled'}
      title="${prev ? 'Предыдущий: ' + esc(docLabel(prev)) : 'Это первый документ'}">‹</button>
    <span class="dd-nav-count">${index + 1} из ${list.length}</span>
    <button class="dd-nav-btn" data-docs-next-doc ${next ? '' : 'disabled'}
      title="${next ? 'Следующий: ' + esc(docLabel(next)) : 'Это последний документ'}">›</button>
  </div>`;
}

function docLabel(d) {
  const file = (d.files || [])[0];
  return `${d.type || 'Документ'}${file ? ' · ' + file.name : ''}${d.date ? ' · ' + d.date : ''}`;
}

// Колонка со списком, из которого документ открыт (выборка реестра или
// документы учреждения): видно, что рядом, и переход не выбрасывает человека
// из его контекста. Строка устроена как в учреждениях — тип, файл, дата,
// статус, — чтобы список читался одинаково в обоих разделах.
function listHTML(doc, siblings) {
  if (!siblings || siblings.list.length < 2) return '';

  const rows = siblings.list.map((d) => {
    const file = (d.files || [])[0];
    return `<button class="dd-list-row ${d.id === doc.id ? 'on' : ''}"
      data-docs-open-doc="${esc(d.id)}" title="${esc(docLabel(d))}">
      <span class="dd-list-type">${esc(d.type || 'Документ')}</span>
      <span class="dd-list-name">${esc(file ? file.name : 'без файла')}</span>
      <span class="dd-list-date">${esc(d.date || '—')}</span>
      <span class="docs-status ${statusTone(d.status)}">${esc(d.status)}</span>
    </button>`;
  }).join('');

  return `<div class="dd-list">
    <div class="dd-list-head">
      <b title="${esc(siblings.scope)}">${esc(siblings.scope)}</b>
      <span class="dd-list-n">${siblings.list.length}</span>
      <button class="dd-list-hide" data-dd-list-close
        title="Свернуть список — просмотрщику больше места">‹</button>
    </div>
    <div class="dd-list-body">${rows}</div>
  </div>
  <div class="dd-split" data-dd-split title="Потяните, чтобы изменить соотношение"></div>`;
}

function listTabHTML(siblings) {
  if (!siblings || siblings.list.length < 2) return '';
  return `<button class="dd-list-tab" data-dd-list-open title="Показать список документов">
    <span>${esc(siblings.scope)} · ${siblings.list.length}</span>
  </button>`;
}

export function detailHTML(doc, siblings) {
  const files = doc.files || [];
  const links = doc.linkedObjects || [];

  if (doc.id !== lastDocId) {
    lastDocId = doc.id;
    activeFileId = files[0] ? files[0].id : null;
  }

  return `<div class="docs-detail">
    <div class="dd-head">
      <button class="back-btn" data-docs-back title="Вернуться туда, откуда открыли">‹</button>
      <div class="dd-icon">📄</div>
      <div class="dd-title">
        <h2>${esc(doc.type || 'Документ')}</h2>
        <div class="dd-meta-row">
          <span class="docs-status ${statusTone(doc.status)}">${esc(doc.status)}</span>
          <span class="tag-mini">${esc(doc.type || '—')}</span>
          <span class="muted">${esc(doc.date || '—')}</span>
          ${doc.institution ? `<span class="muted">· ${esc(doc.institution)}</span>` : ''}
        </div>
      </div>
      ${navHTML(siblings)}
      <button class="btn btn-ghost" data-docs-edit>✎ Редактировать</button>
      <button class="btn btn-ghost" data-docs-download ${files.length ? '' : 'disabled'}>⭳ Скачать</button>
      <button class="btn btn-ghost" data-docs-archive
        title="Убрать документ в архив — оттуда его можно найти и вернуть">🗄 В архив</button>
    </div>

    <div class="dd-body ${listOpen ? '' : 'nolist'}" style="--dd-list-w:${listWidth}px">
      ${listOpen ? listHTML(doc, siblings) : listTabHTML(siblings)}

      <div class="dd-main">
        ${files.length ? viewerHTML(doc, activeFileId) : `<div class="dd-empty">
          <div class="dd-empty-ico">📄</div>
          <b>К документу не прикреплены файлы</b>
          <span class="muted">Документ существует без вложений (legacy).</span>
          <button class="btn btn-ghost" data-docs-attach>📎 Прикрепить файлы</button>
        </div>`}
      </div>

      <div class="dd-side">
        <div class="dd-sec">
          <div class="dd-sec-head" data-dd-toggle><span class="chev">⌄</span>Файлы<span class="dd-sec-count">${files.length}</span></div>
          <div class="dd-sec-body">
            ${files.length ? files.map((f) => `<div class="dd-file-row ${f.id === activeFileId ? 'active' : ''}">
              <button class="dd-file-open ell" data-docs-file-open="${esc(f.id)}" title="Открыть в просмотрщике">${esc(f.name)}</button>
              <button class="dd-file-rm" data-docs-file-rm="${esc(f.id)}" title="Убрать">×</button>
            </div>`).join('') : '<div class="muted">К документу не прикреплены файлы</div>'}
            <button class="btn btn-ghost btn-sm" data-docs-attach style="margin-top:8px">+ Добавить файл</button>
          </div>
        </div>

        <div class="dd-sec">
          <div class="dd-sec-head" data-dd-toggle><span class="chev">⌄</span>Метаданные</div>
          <div class="dd-sec-body">
            <div class="dd-field"><span class="dd-lbl">Тип</span><span class="dd-val">${esc(doc.type || '—')}</span></div>
            <div class="dd-field"><span class="dd-lbl">№ документа</span><span class="dd-val">${esc(doc.number || '—')}</span></div>
            <div class="dd-field"><span class="dd-lbl">Дата</span><span class="dd-val">${esc(doc.date || '—')}</span></div>
            <div class="dd-field"><span class="dd-lbl">Статус</span><span class="dd-val"><span class="docs-status ${statusTone(doc.status)}">${esc(doc.status)}</span></span></div>
          </div>
        </div>

        <div class="dd-sec">
          <div class="dd-sec-head" data-dd-toggle><span class="chev">⌄</span>От кого</div>
          <div class="dd-sec-body">
            <div class="dd-field"><span class="dd-lbl">Учреждение</span><span class="dd-val">${esc(doc.institution || '—')}</span></div>
            ${doc.owner ? `<div class="dd-field"><span class="dd-lbl">Владелец</span><span class="dd-val">${esc(doc.owner)}</span></div>` : ''}
            ${doc.regAuthority ? `<div class="dd-field"><span class="dd-lbl">Орган регистрации</span><span class="dd-val">${esc(doc.regAuthority)}</span></div>` : ''}
            ${doc.regDate ? `<div class="dd-field"><span class="dd-lbl">Дата регистрации</span><span class="dd-val">${esc(doc.regDate)}</span></div>` : ''}
            ${doc.affiliation ? `<div class="dd-field"><span class="dd-lbl">Принадлежность</span><span class="dd-val">${esc(doc.affiliation)}</span></div>` : ''}
          </div>
        </div>

        <div class="dd-sec">
          <div class="dd-sec-head" data-dd-toggle><span class="chev">⌄</span>Прикреплён к<span class="dd-sec-count">${links.length}</span></div>
          <div class="dd-sec-body">
            ${links.length ? `<table class="dd-links-tbl">
              <thead><tr><th>Тип</th><th>ЕНИ</th><th>Литера</th><th></th></tr></thead>
              <tbody>${links.map((l) => `<tr>
                <td><span class="tag-mini">${esc(l.type)}</span></td>
                <td class="mono">${esc(l.eni || '—')}</td>
                <td>${esc(l.letter || '—')}</td>
                <td><button class="dd-file-rm" data-docs-link-rm="${esc(l.id)}" title="Открепить">Открепить</button></td>
              </tr>`).join('')}</tbody>
            </table>` : '<div class="muted">Не прикреплён ни к одному объекту</div>'}
            <button class="btn btn-ghost btn-sm" data-docs-link-add style="margin-top:8px">+ Прикрепить объект</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function bindDetail(scope, { doc, host, siblings, onBack, onOpen, onChanged }) {
  const back = scope.$('[data-docs-back]');
  if (back) back.onclick = onBack;

  // Переключение между соседними документами — стрелками и лентой.
  const go = (d) => { if (d && onOpen) onOpen(d.id); };
  const list = siblings ? siblings.list : [];
  const index = siblings ? siblings.index : 0;

  const prevBtn = scope.$('[data-docs-prev-doc]');
  if (prevBtn) prevBtn.onclick = () => go(list[index - 1]);

  const nextBtn = scope.$('[data-docs-next-doc]');
  if (nextBtn) nextBtn.onclick = () => go(list[index + 1]);

  scope.$$('[data-docs-open-doc]').forEach((b) => b.onclick = () => {
    if (b.dataset.docsOpenDoc !== doc.id && onOpen) onOpen(b.dataset.docsOpenDoc);
  });

  // Сворачивание списка и перетаскивание перегородки — тот же приём, что в
  // карточке учреждения и в карточках ОЦ: ширина живёт в переменной, при
  // перетаскивании страница не перерисовывается (иначе теряется указатель).
  const listClose = scope.$('[data-dd-list-close]');
  if (listClose) listClose.onclick = () => { listOpen = false; onChanged(); };

  const listShow = scope.$('[data-dd-list-open]');
  if (listShow) listShow.onclick = () => { listOpen = true; onChanged(); };

  const split = scope.$('[data-dd-split]');
  if (split) split.onpointerdown = (e) => {
    e.preventDefault();
    const box = scope.$('.dd-body');
    if (!box) return;

    const x0 = e.clientX;
    const w0 = listWidth;
    // Верхний предел считаем от самой карточки: просмотрщику оставляем VIEW_MIN,
    // остальное список может забрать целиком.
    const max = Math.max(LIST_MIN, box.getBoundingClientRect().width - VIEW_MIN);

    split.setPointerCapture(e.pointerId);
    split.classList.add('active');
    document.body.classList.add('col-resizing');

    const move = (ev) => {
      listWidth = Math.max(LIST_MIN, Math.min(max, w0 + Math.round(ev.clientX - x0)));
      box.style.setProperty('--dd-list-w', listWidth + 'px');
    };
    const up = () => {
      split.releasePointerCapture(e.pointerId);
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.classList.remove('active');
      document.body.classList.remove('col-resizing');
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
  };

  // Убрать в архив: документ исчезает из реестра, но не из системы
  // (ТЗ docs/tz/20-arhiv.md, §4.1).
  const arc = scope.$('[data-docs-archive]');
  if (arc) arc.onclick = async () => {
    const ok = await host.confirm({
      title: 'Убрать документ в архив?',
      okLabel: 'В архив',
      text: 'Документ исчезнет из реестра, но останется в разделе «Архив» — '
        + 'оттуда его можно найти и вернуть.',
    });
    if (!ok) return;

    archiveRegistryDoc({ docId: doc.id, place: 'docs' });
    host.toast('Убрано в архив: документ', 'ok');
    if (onBack) onBack();
  };

  const edit = scope.$('[data-docs-edit]');
  if (edit) edit.onclick = () => openDocumentModal(host, { doc, onSaved: onChanged });

  const dl = scope.$('[data-docs-download]');
  if (dl && !dl.disabled) dl.onclick = () => {
    (doc.files || []).forEach((f) => {
      const a = document.createElement('a');
      a.href = f.dataUrl;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  };

  scope.$$('[data-docs-attach]').forEach((b) => b.onclick = async () => {
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { host.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }
    const f = await attachedFileFrom(file);
    addFile(doc.id, f);
    activeFileId = f.id;
    onChanged();
  });

  scope.$$('[data-docs-file-open]').forEach((b) => b.onclick = () => {
    activeFileId = b.dataset.docsFileOpen;
    onChanged();
  });

  scope.$$('[data-docs-file-rm]').forEach((b) => b.onclick = () => {
    removeFile(doc.id, b.dataset.docsFileRm);
    if (activeFileId === b.dataset.docsFileRm) activeFileId = null;
    onChanged();
  });

  const linkAdd = scope.$('[data-docs-link-add]');
  if (linkAdd) linkAdd.onclick = () => openLinkModal({
    onAdd: (link) => { addLink(doc.id, link); onChanged(); },
  });

  scope.$$('[data-docs-link-rm]').forEach((b) => b.onclick = () => {
    removeLink(doc.id, b.dataset.docsLinkRm);
    onChanged();
  });

  scope.$$('[data-dd-toggle]').forEach((h) => h.onclick = () => {
    const sec = h.closest('.dd-sec');
    if (sec) sec.classList.toggle('collapsed');
  });

  if ((doc.files || []).length) {
    bindViewer(scope, {
      doc,
      activeFileId,
      onFileChange: (id) => { activeFileId = id; onChanged(); },
    });
  }
}
