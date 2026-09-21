import { esc } from '../dom.js';
import { openTabOnly } from './state.js';
import { docListFor, attachedFileFrom, isFileTooLarge, scopeLabel, nextDocId, maxFileMb, docTypes } from './deps.js';

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
  [/тех.?паспорт|техпасп|tex.?pasport|tekhpasport/, 'Техпаспорт'],
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
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

const kb = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ'
  : Math.max(1, Math.round(n / 1024)) + ' КБ');

// Окно подтверждения пачки. Своё, а не kernel/dialog.js: там нет окна со
// списком строк, а здесь у каждого файла своё имя и вид.
function batchDialog(doc, files, types, whereLabel) {
  return new Promise((resolve) => {
    doc.querySelectorAll('.modal-back').forEach((old) => old.remove());
    const rows = files.map((f) => ({
      file: f, name: f.name, type: guessType(f.name, types), big: isFileTooLarge(f), on: !isFileTooLarge(f),
    }));

    const back = doc.createElement('div');
    back.className = 'modal-back';
    const typeOpts = (cur) => types.map((t) => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const draw = () => {
      const n = rows.filter((r) => r.on).length;
      back.innerHTML = `<div class="modal vattach" role="dialog" aria-modal="true" aria-labelledby="vattachTitle">
        <div class="modal-head" id="vattachTitle">Прикрепить документы · ${esc(whereLabel)}</div>
        <div class="modal-body">
          <div class="vattach-all"><label for="vattachAll">Вид для всех</label>
            <select class="select" id="vattachAll" data-att-all><option value="">— как подобрано —</option>${typeOpts('')}</select></div>
          <div class="vattach-list">
            ${rows.map((r, i) => `<div class="vattach-row ${r.on ? '' : 'off'}">
              <input type="checkbox" data-att-on="${i}" ${r.on ? 'checked' : ''} ${r.big ? 'disabled' : ''}
                aria-label="Прикрепить «${esc(r.file.name)}»">
              <input class="input" data-att-name="${i}" value="${esc(r.name)}" aria-label="Название документа">
              <select class="select" data-att-type="${i}" aria-label="Вид документа">${typeOpts(r.type)}</select>
              <span class="vattach-size ${r.big ? 'warn' : ''}" title="${r.big ? `Больше ${maxFileMb()} МБ — не прикрепить` : ''}">
                ${r.big ? `больше ${maxFileMb()} МБ` : kb(r.file.size)}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-att-cancel>Отмена</button>
          <button class="btn btn-primary" data-att-ok ${n ? '' : 'disabled'}>Прикрепить${n > 1 ? ` · ${n}` : ''}</button>
        </div></div>`;
      bind();
    };

    const done = (v) => { back.remove(); resolve(v); };
    const bind = () => {
      back.querySelectorAll('[data-att-name]').forEach((i) => i.oninput = () => { rows[+i.dataset.attName].name = i.value; });
      back.querySelectorAll('[data-att-type]').forEach((s) => s.onchange = () => { rows[+s.dataset.attType].type = s.value; });
      back.querySelectorAll('[data-att-on]').forEach((c) => c.onchange = () => { rows[+c.dataset.attOn].on = c.checked; draw(); });
      const all = back.querySelector('[data-att-all]');
      all.onchange = () => {
        if (!all.value) return;
        rows.forEach((r) => { r.type = all.value; });
        draw();
      };
      back.querySelector('[data-att-cancel]').onclick = () => done(null);
      back.querySelector('[data-att-ok]').onclick = () => done(rows.filter((r) => r.on));
    };

    back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        const ok = back.querySelector('[data-att-ok]');
        if (ok && !ok.disabled) ok.click();
      }
    });
    draw();
    doc.body.appendChild(back);
    const first = back.querySelector('[data-att-name]');
    if (first) first.focus();
  });
}

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
  const inCivil = () => document.body.dataset.module === 'civil';

  ctx.scope.onDocument('dragenter', (e) => {
    if (!inCivil() || !hasFiles(e)) return;
    depth += 1;
    mark(true);
  });
  ctx.scope.onDocument('dragover', (e) => {
    if (!inCivil() || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  ctx.scope.onDocument('dragleave', (e) => {
    if (!inCivil() || !hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) mark(false);
  });
  ctx.scope.onDocument('drop', (e) => {
    if (!inCivil() || !hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    mark(false);
    attachFiles(ctx, e.dataTransfer.files);
  });

  // Вставка файлов из буфера (Ctrl+V): скопированный в проводнике файл или
  // снимок экрана. Текст в полях вставляется как обычно.
  ctx.scope.onDocument('paste', (e) => {
    if (!inCivil()) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, [contenteditable="true"]')) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (!files.length) return;
    e.preventDefault();
    attachFiles(ctx, files);
  });
}
