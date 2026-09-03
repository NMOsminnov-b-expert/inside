// Создание/редактирование документа — модальное окно (решение пользователя
// 2026-09-02: не отдельная страница), с drag-and-drop для файла. formDialog
// (kernel/dialog.js) не подходит — там только текстовые поля, а тут нужны
// select/date/файл/теги, поэтому модалка собрана здесь напрямую поверх тех же
// глобальных классов .modal-back/.modal (kernel/tokens.css).
import { esc } from '../../kernel/dom.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { DOC_TYPES, DOC_STATUSES, detectAutoStatus, createDocument, updateDocument } from '../../kernel/documentsRegistry.js';

function draftFrom(doc) {
  if (!doc) {
    return {
      type: '', date: '', number: '', status: DOC_STATUSES[0], files: [],
      owner: '', institution: '', linkedObjects: [], _statusTouched: false, _err: '',
    };
  }
  return {
    type: doc.type, date: doc.date, number: doc.number, status: doc.status,
    files: (doc.files || []).slice(), owner: doc.owner, institution: doc.institution,
    linkedObjects: (doc.linkedObjects || []).slice(),
    _statusTouched: true, _err: '',
  };
}

function linkLabel(l) {
  return `${l.type}${l.eni ? ` · ЕНИ ${l.eni}` : ''}${l.letter ? ` · Лит ${l.letter}` : ''}`;
}

function formInnerHTML(draft) {
  return `<div class="grid g-3">
    <div class="field"><label>Тип документа</label>
      <select class="select" data-df-type>
        <option value="">Не выбран</option>
        ${DOC_TYPES.map((t) => `<option ${t === draft.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Дата документа</label>
      <input class="input" type="date" data-df-date value="${esc(draft.date || '')}">
    </div>
    <div class="field"><label>№ документа</label>
      <input class="input" data-df-number value="${esc(draft.number || '')}">
    </div>
  </div>
  <div class="grid g-3" style="margin-top:10px">
    <div class="field"><label>Статус<span class="req">*</span></label>
      <select class="select" data-df-status>
        ${DOC_STATUSES.map((s) => `<option ${s === draft.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Владелец</label>
      <input class="input" data-df-owner value="${esc(draft.owner || '')}">
    </div>
    <div class="field"><label>Учреждение / Подвед<span class="req">*</span></label>
      <input class="input" data-df-institution value="${esc(draft.institution || '')}">
    </div>
  </div>
  <div class="field" style="margin-top:10px">
    <label>Файл</label>
    <div class="df-drop" data-df-drop>
      <div class="df-drop-hint">Перетащите файл сюда или <button type="button" class="df-drop-btn" data-df-pick>выберите на диске</button></div>
      ${draft.files.length ? `<div class="df-files">${draft.files.map((f, i) => `<span class="ms-tag">${esc(f.name)}<span data-df-file-rm="${i}" title="Убрать">×</span></span>`).join('')}</div>` : ''}
    </div>
  </div>
  <div class="field" style="margin-top:10px">
    <label>Оценочные объекты и имущество</label>
    <div class="inline-row" style="flex-wrap:wrap; gap:6px">
      ${(draft.linkedObjects || []).map((l, i) => `<span class="ms-tag">${esc(linkLabel(l))}<span data-df-link-rm="${i}" title="Убрать">×</span></span>`).join('')}
      <button type="button" class="btn btn-ghost btn-sm" data-df-link-add>+ Добавить</button>
    </div>
  </div>
  <div class="modal-err" data-df-err ${draft._err ? '' : 'hidden'}>${esc(draft._err || '')}</div>`;
}

// Маленькая модалка привязки к объекту оценки/имуществу — свободный ввод
// (тип/ЕНИ/литера), не живой поиск по записям модулей: реестр документов не
// зависит от типов ОЦ (решение пользователя 2026-09-02).
export function openLinkModal({ onAdd }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head">Прикрепить объект оценки</div>
    <div class="modal-body">
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label>Тип</label>
          <select class="select" data-lm-type><option>ОЦ</option><option>ОИ</option></select>
        </div>
        <div class="field"><label>ЕНИ</label><input class="input" data-lm-eni></div>
        <div class="field"><label>Литера</label><input class="input" data-lm-letter placeholder="—"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
      <button class="btn btn-primary" data-modal-ok>Добавить</button>
    </div>
  </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();
  back.querySelector('[data-modal-cancel]').onclick = close;
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  back.querySelector('[data-modal-ok]').onclick = () => {
    const type = back.querySelector('[data-lm-type]').value;
    const eni = back.querySelector('[data-lm-eni]').value.trim();
    const letter = back.querySelector('[data-lm-letter]').value.trim();
    close();
    if (onAdd) onAdd({ type, eni, letter });
  };
}

export function openDocumentModal(host, { doc = null, onSaved } = {}) {
  const draft = draftFrom(doc);

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal docs-modal" role="dialog" aria-modal="true">
    <div class="modal-head">${doc ? 'Редактирование документа' : 'Создание документа'}</div>
    <div class="modal-body" data-df-body>${formInnerHTML(draft)}</div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-modal-cancel>Отмена</button>
      <button class="btn btn-primary" data-modal-ok>${doc ? 'Сохранить' : 'Создать'}</button>
    </div>
  </div>`;
  document.body.appendChild(back);

  const close = () => back.remove();

  function rerender() {
    back.querySelector('[data-df-body]').innerHTML = formInnerHTML(draft);
    bindFields();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (isFileTooLarge(file)) { host.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); continue; }
      draft.files.push(await attachedFileFrom(file));
      if (!draft._statusTouched) draft.status = await detectAutoStatus(file);
    }
    rerender();
  }

  function bindFields() {
    const body = back.querySelector('[data-df-body]');

    const ty = body.querySelector('[data-df-type]');
    if (ty) ty.onchange = () => { draft.type = ty.value; };

    const dt = body.querySelector('[data-df-date]');
    if (dt) dt.onchange = () => { draft.date = dt.value; };

    const nm = body.querySelector('[data-df-number]');
    if (nm) nm.onchange = () => { draft.number = nm.value; };

    const st = body.querySelector('[data-df-status]');
    if (st) st.onchange = () => { draft.status = st.value; draft._statusTouched = true; };

    const ow = body.querySelector('[data-df-owner]');
    if (ow) ow.onchange = () => { draft.owner = ow.value; };

    const inst = body.querySelector('[data-df-institution]');
    if (inst) inst.onchange = () => { draft.institution = inst.value; };

    const pick = body.querySelector('[data-df-pick]');
    if (pick) pick.onclick = async () => {
      const file = await pickFile();
      if (!file) return;
      await handleFiles([file]);
    };

    const drop = body.querySelector('[data-df-drop]');
    if (drop) {
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
      });
    }

    body.querySelectorAll('[data-df-file-rm]').forEach((b) => b.onclick = () => {
      draft.files.splice(+b.dataset.dfFileRm, 1);
      rerender();
    });

    const linkAdd = body.querySelector('[data-df-link-add]');
    if (linkAdd) linkAdd.onclick = () => openLinkModal({
      onAdd: (link) => { draft.linkedObjects.push(link); rerender(); },
    });

    body.querySelectorAll('[data-df-link-rm]').forEach((b) => b.onclick = () => {
      draft.linkedObjects.splice(+b.dataset.dfLinkRm, 1);
      rerender();
    });
  }

  bindFields();

  back.querySelector('[data-modal-cancel]').onclick = () => close();
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  back.querySelector('[data-modal-ok]').onclick = () => {
    const missing = [];
    if (!draft.status) missing.push('Статус');
    if (!draft.institution || !draft.institution.trim()) missing.push('Учреждение / Подвед');

    if (missing.length) {
      draft._err = 'Заполните обязательные поля: ' + missing.join(', ');
      rerender();
      return;
    }

    const saved = doc ? updateDocument(doc.id, draft) : createDocument(draft);
    close();
    host.toast(doc ? 'Документ обновлён' : 'Документ создан', 'ok');
    if (onSaved) onSaved(saved);
  };
}
