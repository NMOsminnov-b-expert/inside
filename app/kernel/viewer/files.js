import { esc } from '../dom.js';
import { openTabOnly } from './state.js';
import { docListFor, attachedFileFrom, scopeLabel, nextDocId, docTypes } from './deps.js';
// Предел размера — из ядра напрямую: окно прикрепления открывается и там, где
// просмотрщика нет (у осмотрщика), и доступа к данным модуля у него нет.
import { isFileTooLarge, MAX_DOC_FILE_MB } from '../fileUpload.js';

const maxFileMb = () => MAX_DOC_FILE_MB;

// Прикрепление документов пачкой: выбором, перетаскиванием и вставкой.
//
// Требование пользователя 21.09.2026: «обязательны drag'n'drop, множественная
// вставка (имена берём от файлов, которые импортируем)». Практики (граф:
// practice:rabota-s-dokumentami-v-prosmotrshchike): несколько файлов за раз,
// перед прикреплением видно, что уйдёт и под каким видом, после — сообщение,
// сколько прикреплено.
//
// Имя документа — имя файла. Вид документа подбирается по имени («техпаспорт»,
// «гос акт» …), а если не угадан — первый из справочника; всё это правится в
// окне до прикрепления, и одним списком можно задать вид сразу всем.

// Подсказки вида по имени файла. Сравнение без регистра и «ё».
const TYPE_HINTS = [
  [/тех.?паспорт|техпасп|te[xkh].?pasport|tekhpasport/, 'Техпаспорт'],
  [/гос.?акт|госакт|акт на землю|gos.?akt/, 'Гос. акт на землю'],
  [/акт осмотр|осмотр|osmotr/, 'Акт осмотра'],
  [/\bпуд\b|правоустан|договор|свидетельств|pud/, 'ПУД'],
];

export function guessType(name, types) {
  const n = String(name || '').toLowerCase().replace(/ё/g, 'е');
  const hit = TYPE_HINTS.find(([re, type]) => re.test(n) && types.includes(type));
  return hit ? hit[1] : (types.includes('Прочее') ? 'Прочее' : types[0]);
}

// Системный выбор файлов — несколько сразу. Поле создаётся в документе ТОГО
// окна, где нажали кнопку: при вынесенном просмотрщике окно выбора иначе
// открывалось бы на другом мониторе, а по клавише Ctrl+O из вынесенного окна
// не открывалось вовсе — браузер разрешает выбор файла только в окне, где
// человек только что действовал.
export function pickFiles(doc = document) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.multiple = true;
    // «Отмена» в диалоге — пустой выбор, а не вечно ждущее обещание.
    input.addEventListener('cancel', () => resolve([]));
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

const kb = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ'
  : Math.max(1, Math.round(n / 1024)) + ' КБ');

// Окно подтверждения пачки. Своё, а не kernel/dialog.js: там нет окна со
// списком строк, а здесь у каждого файла своё имя и вид.
//
// Одно окно на всю систему (решение пользователя 29.10.2026: «При прикреплении
// через документы у нас должно прикрепляться все через такое же окно как в
// документах. Важно добавить предпросмотр документа. и возможность подгрузки
// нескольких документов. Для каждого - свои параметры»): карточка ОЦ и
// осмотрщик. У каждого файла — миниатюра, касание открывает предпросмотр
// целиком (у PDF — все страницы); place — необязательное поле «К чему
// относится» со своим списком (у осмотрщика).
export function attachDialog(doc, files, { types, whereLabel = '', place = null, okLabel = 'Прикрепить' } = {}) {
  return new Promise((resolve) => {
    doc.querySelectorAll('.modal-back').forEach((old) => old.remove());
    const rows = files.map((f) => ({
      file: f, name: f.name, type: guessType(f.name, types), big: isFileTooLarge(f), on: !isFileTooLarge(f),
      place: place ? place.value || '' : '', thumb: '',
      pdf: f.type === 'application/pdf' || /\.pdf$/i.test(f.name), image: (f.type || '').startsWith('image/'),
    }));
    const urls = [];
    const urlOf = (f) => { const u = URL.createObjectURL(f); urls.push(u); return u; };
    rows.forEach((r) => { if (r.image) r.thumb = urlOf(r.file); });
    let peek = -1;          // какой файл открыт в предпросмотре
    let peekPages = null;   // его страницы — ссылки на картинки; null — готовятся

    const back = doc.createElement('div');
    back.className = 'modal-back';
    const typeOpts = (cur) => types.map((t) => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const placeOpts = (cur) => (place ? place.options : [])
      .map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    const thumbHTML = (r, i) => `<button type="button" class="vattach-thumb" data-att-peek="${i}"
      aria-label="Предпросмотр «${esc(r.file.name)}»" title="Предпросмотр">
      ${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : `<span>${r.pdf ? 'PDF' : 'файл'}</span>`}</button>`;
    const listHTML = () => {
      const n = rows.filter((r) => r.on).length;
      return `<div class="modal vattach ${place ? 'with-place' : ''}" role="dialog" aria-modal="true" aria-labelledby="vattachTitle">
        <div class="modal-head" id="vattachTitle">${esc(okLabel)} документы · ${esc(whereLabel)}</div>
        <div class="modal-body">
          ${rows.length > 1 ? `<div class="vattach-all"><label for="vattachAll">Вид для всех</label>
            <select class="select" id="vattachAll" data-att-all><option value="">— как подобрано —</option>${typeOpts('')}</select></div>` : ''}
          <div class="vattach-list">
            ${rows.map((r, i) => `<div class="vattach-row ${r.on ? '' : 'off'}">
              <input type="checkbox" data-att-on="${i}" ${r.on ? 'checked' : ''} ${r.big ? 'disabled' : ''}
                aria-label="Прикрепить «${esc(r.file.name)}»">
              ${thumbHTML(r, i)}
              <input class="input" data-att-name="${i}" value="${esc(r.name)}" aria-label="Название документа">
              <select class="select" data-att-type="${i}" aria-label="Вид документа">${typeOpts(r.type)}</select>
              ${place ? `<select class="select" data-att-place="${i}" aria-label="${esc(place.label)}">${placeOpts(r.place)}</select>` : ''}
              <span class="vattach-size ${r.big ? 'warn' : ''}" title="${r.big ? `Больше ${maxFileMb()} МБ — не прикрепить` : ''}">
                ${r.big ? `больше ${maxFileMb()} МБ` : kb(r.file.size)}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-att-cancel>Отмена</button>
          <button class="btn btn-primary" data-att-ok ${n ? '' : 'disabled'}>${esc(okLabel)}${n > 1 ? ` · ${n}` : ''}</button>
        </div></div>`;
    };
    const peekHTML = () => {
      const r = rows[peek];
      const body = peekPages === null ? '<p class="vattach-wait">Готовим страницы…</p>'
        : peekPages.length ? peekPages.map((u, k) => `<figure><img src="${esc(u)}" alt="Страница ${k + 1}">
          <figcaption>${k + 1} из ${peekPages.length}</figcaption></figure>`).join('')
          : '<p class="vattach-wait">Предпросмотр недоступен для этого типа файла.</p>';
      return `<div class="modal vattach vattach-peek" role="dialog" aria-modal="true" aria-labelledby="vattachPeekTitle">
        <div class="modal-head vattach-peek-head"><button class="btn btn-ghost btn-sm" data-att-back>← К списку</button>
          <span id="vattachPeekTitle">${esc(r.file.name)}</span></div>
        <div class="modal-body vattach-peek-body">${body}</div></div>`;
    };
    const draw = () => {
      back.innerHTML = peek >= 0 ? peekHTML() : listHTML();
      bind();
    };
    const closePeek = () => { peek = -1; peekPages = null; draw(); };
    const openPeek = async (i) => {
      peek = i;
      const r = rows[i];
      peekPages = r.image ? [r.thumb] : r.pdf ? null : [];
      draw();
      if (!r.pdf) return;
      try {
        const { pdfToJpegFiles } = await import('./pdf.js');
        const pages = await pdfToJpegFiles(r.file, { maxSide: 1400 });
        if (peek !== i) return;
        peekPages = pages.map(urlOf);
      } catch (e) {
        if (peek !== i) return;
        peekPages = [];
      }
      draw();
    };

    const done = (v) => { back.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); resolve(v); };
    const bind = () => {
      const toList = back.querySelector('[data-att-back]');
      if (toList) {
        toList.onclick = closePeek;
        toList.focus();
        return;
      }
      back.querySelectorAll('[data-att-name]').forEach((i) => { i.oninput = () => { rows[+i.dataset.attName].name = i.value; }; });
      back.querySelectorAll('[data-att-type]').forEach((s) => { s.onchange = () => { rows[+s.dataset.attType].type = s.value; }; });
      back.querySelectorAll('[data-att-place]').forEach((s) => { s.onchange = () => { rows[+s.dataset.attPlace].place = s.value; }; });
      back.querySelectorAll('[data-att-on]').forEach((c) => { c.onchange = () => { rows[+c.dataset.attOn].on = c.checked; draw(); }; });
      back.querySelectorAll('[data-att-peek]').forEach((b) => { b.onclick = () => openPeek(+b.dataset.attPeek); });
      const all = back.querySelector('[data-att-all]');
      if (all) {
        all.onchange = () => {
          if (!all.value) return;
          rows.forEach((r) => { r.type = all.value; });
          draw();
        };
      }
      back.querySelector('[data-att-cancel]').onclick = () => done(null);
      back.querySelector('[data-att-ok]').onclick = () => done(rows.filter((r) => r.on));
    };

    back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (peek >= 0) closePeek(); else done(null);
      }
      if (e.key === 'Enter' && peek < 0 && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        const ok = back.querySelector('[data-att-ok]');
        if (ok && !ok.disabled) ok.click();
      }
    });
    draw();
    doc.body.appendChild(back);
    // Миниатюра PDF — первая страница, по готовности.
    rows.forEach(async (r) => {
      if (!r.pdf) return;
      try {
        const { pdfToJpegFiles } = await import('./pdf.js');
        const [first] = await pdfToJpegFiles(r.file, { maxSide: 240, pages: 1 });
        if (!first) return;
        r.thumb = urlOf(first);
        const b = back.querySelector(`[data-att-peek="${rows.indexOf(r)}"]`);
        if (b) b.innerHTML = `<img src="${esc(r.thumb)}" alt="">`;
      } catch (e) { /* миниатюры нет — останется «PDF» */ }
    });
    const first = back.querySelector('[data-att-name]');
    if (first) first.focus();
  });
}

const batchDialog = (doc, files, types, whereLabel) => attachDialog(doc, files, { types, whereLabel });

// Куда прикрепляется: в карточке литеры — к литере, иначе — к объекту оценки.
export const attachScope = (ctx) => ((ctx.view === 'oi' && ctx.oi) ? ctx.oi.id : 'oc');

export async function attachFiles(ctx, files) {
  const list = Array.from(files || []).filter((f) => f && f.size !== undefined);
  if (!list.length) return [];
  const scope = attachScope(ctx);
  const where = scope === 'oc' ? 'объект оценки' : `${scopeLabel(scope)} · ${ctx.oi ? (ctx.oi.letter ? 'литера ' + ctx.oi.letter : ctx.oi.name) : ''}`;

  // Окно прикрепления — там же, откуда пришли файлы (главное окно или окно
  // просмотра на втором мониторе, см. popout.js).
  const doc = (ctx.scope && ctx.scope.root && ctx.scope.root.ownerDocument) || document;
  const picked = await batchDialog(doc, list, docTypes(), where);
  if (!picked || !picked.length) return [];

  const docs = docListFor(ctx, scope);
  const added = [];
  for (const r of picked) {
    const item = {
      id: nextDocId(ctx.rec), type: r.type, name: (r.name || r.file.name).trim(),
      date: ctx.today, file: await attachedFileFrom(r.file), pages: null,
    };
    docs.push(item);
    openTabOnly(scope, item.id);
    added.push(item);
  }

  // Открыт первый из прикреплённых: его и смотрят сразу, остальные ждут во
  // вкладках рядом.
  ctx.ui.viewerDoc = { scope, id: added[0].id };
  ctx.ui.viewer = { mode: (ctx.ui.viewer && ctx.ui.viewer.mode === 'compare') ? 'compare' : 'doc' };
  ctx.ui.viewerClosed = false;
  ctx.render();
  ctx.toast(added.length > 1 ? `Прикреплено документов: ${added.length}` : `Документ прикреплён: ${added[0].name}`, 'ok');
  return added;
}

// Есть ли в перетаскиваемом файлы (а не текст или ссылка).
const hasFiles = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

// Перетаскивание файлов — на всю карточку: бросить можно куда угодно, а
// подсвечивается просмотрщик (или вся область, если он закрыт) — туда
// документ и попадёт. Заодно это защита: брошенный мимо файл браузер открыл
// бы вместо макета, и введённое пропало бы.
//
// Слушатели на документе — один раз за монтирование модуля (index.js), как у
// горячих клавиш: bindViewer зовётся на каждую перерисовку.
export function bindFileDrop(ctx) {
  let depth = 0;
  const target = () => ctx.scope.$('.viewer:not(.vpop-stub)') || ctx.scope.root;
  const mark = (on) => {
    ctx.scope.$$('.vdrop-on').forEach((n) => n.classList.remove('vdrop-on'));
    if (on) target().classList.add('vdrop-on');
  };
  // Только пока смонтирован модуль ОЦ (на страницах ядра dataset.module пуст).
  // Прежде — только у 'civil': проверка осталась с переноса просмотрщика в ядро
  // (21.09.2026), и в остальных модулях брошенный файл браузер открывал вместо
  // макета (код-ревью 09.10.2026).
  const inModule = () => !!document.body.dataset.module;

  ctx.scope.onDocument('dragenter', (e) => {
    if (!inModule() || !hasFiles(e)) return;
    depth += 1;
    mark(true);
  });
  ctx.scope.onDocument('dragover', (e) => {
    if (!inModule() || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  ctx.scope.onDocument('dragleave', (e) => {
    if (!inModule() || !hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) mark(false);
  });
  ctx.scope.onDocument('drop', (e) => {
    if (!inModule() || !hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    mark(false);
    attachFiles(ctx, e.dataTransfer.files);
  });

  // Вставка файлов из буфера (Ctrl+V): скопированный в проводнике файл или
  // снимок экрана. Текст в полях вставляется как обычно.
  ctx.scope.onDocument('paste', (e) => {
    if (!inModule()) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, [contenteditable="true"]')) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (!files.length) return;
    e.preventDefault();
    attachFiles(ctx, files);
  });
}
