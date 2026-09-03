// Карточка документа — открывается кликом по строке в реестре (решение
// пользователя 2026-09-02, по присланному скриншоту): заголовок с статусом,
// полноценный просмотрщик слева (или пустое состояние с прикреплением),
// метаданные и привязка к объектам оценки справа, в сворачиваемых секциях.
import { esc } from '../../kernel/dom.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { statusTone, addFile, removeFile, addLink, removeLink } from '../../kernel/documentsRegistry.js';
import { openDocumentModal, openLinkModal } from './create.js';
import { viewerHTML, bindViewer } from './viewer.js';

// Какой файл документа сейчас открыт в просмотрщике — сбрасывается на первый
// файл при переходе к другому документу.
let activeFileId = null;
let lastDocId = null;

export function detailHTML(doc) {
  const files = doc.files || [];
  const links = doc.linkedObjects || [];

  if (doc.id !== lastDocId) {
    lastDocId = doc.id;
    activeFileId = files[0] ? files[0].id : null;
  }

  return `<div class="docs-detail">
    <div class="dd-head">
      <button class="back-btn" data-docs-back title="К списку документов">‹</button>
      <div class="dd-icon">📄</div>
      <div class="dd-title">
        <h2>${esc(doc.type || 'Документ')}</h2>
        <div class="dd-meta-row">
          <span class="docs-status ${statusTone(doc.status)}">${esc(doc.status)}</span>
          <span class="tag-mini">${esc(doc.type || '—')}</span>
          <span class="muted">${esc(doc.date || '—')}</span>
        </div>
      </div>
      <button class="btn btn-ghost" data-docs-edit>✎ Редактировать</button>
      <button class="btn btn-ghost" data-docs-download ${files.length ? '' : 'disabled'}>⭳ Скачать</button>
    </div>

    <div class="dd-body">
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

export function bindDetail(scope, { doc, host, onBack, onChanged }) {
  const back = scope.$('[data-docs-back]');
  if (back) back.onclick = onBack;

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
