// Разметка экранов осмотрщика. Ничего не считает и ничего не меняет — только
// показывает то, что дали tasks.js, form.js и запись.
//
// Экраны свои, а не адаптив настольных карточек: у осмотрщика телефон, одна
// рука и улица, а настольная карточка ОЦ — это широкие таблицы, просмотрщик
// документов рядом с полями и панель фильтров. При этом сами экраны
// АДАПТИВНЫЕ (задача пользователя 08.09.2026): на планшете и мониторе они
// раскладываются в две колонки, а разделы уходят наверх — см. inspector.css.
//
// Поля осмотра строятся не разметкой, а из ОПИСАНИЯ (kernel/fieldSchema.js +
// form.js): одно описание — и мобильный экран, и, в дальнейшем, настольная
// карточка. Это и есть «конструктор», о котором просил пользователь.
import { esc } from '../../kernel/dom.js';
import { fmtEni } from '../../kernel/fmt.js';
import {
  sectionHTML, requiredLeft, filledCount, sectionProgress, getValue,
} from '../../kernel/fieldSchema.js';
import { PHOTO_CATS, PHOTO_LIMIT, READY_STATUS, oiLabel, FOUND_KINDS } from './tasks.js';
import { sections, allFields, mismatchHint } from './form.js';

// --- значки ---------------------------------------------------------------
//
// Контурные SVG, как в остальном макете (kernel/yearField.js, ctxPlate.js).
// Эмодзи не годятся: их рисует цветной шрифт системы, и на Android и iOS одна
// и та же «камера» выглядит по-разному.
const I = {
  back: '<path d="M13 4 6 11l7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  task: '<path d="M6 3h6a1 1 0 0 1 1 1v1h2v13H3V5h2V4a1 1 0 0 1 1-1Zm-1 6h8M5 12h8M5 15h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  object: '<path d="M3 17V6l6-3 6 3v11M7 17v-4h4v4M6 9h2M11 9h2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  docs: '<path d="M5 2h6l4 4v12H5zM11 2v4h4M7 11h6M7 14h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  photo: '<path d="M3 7h3l1.5-2h5L14 7h3v10H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  pin: '<path d="M10 18s6-5.5 6-9.5A6 6 0 0 0 4 8.5C4 12.5 10 18 10 18Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="8.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  copy: '<rect x="4" y="4" width="9" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 4V2.5h8.5V14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11M9 9v5M11 9v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  chev: '<path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ok: '<path d="M4 10.5 8 14.5 16 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  pen: '<path d="M3 17h4l9-9-4-4-9 9zM12 4l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
};

const ico = (name, size = 20) =>
  `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">${I[name]}</svg>`;

// Классы полей на этих экранах. Описание поля их не знает: оформление здесь
// своё, а в настольной карточке будет своё — конструктор ядра принимает набор
// классов снаружи.
const FS_UI = {
  field: 'ins-fs',
  label: 'ins-fs-l',
  req: 'ins-fs-req',
  opts: 'ins-chips',
  opt: 'ins-chip',
  on: 'on',
  input: 'ins-num',
  unit: 'ins-num-u',
  select: 'select ins-select',
  wide: 'ins-fs-wide',
  area: 'ins-ta',
  hint: 'ins-fs-hint',
};

// --- общие части ----------------------------------------------------------

const statusTone = (status) => {
  if (status === READY_STATUS) return 'go';
  if (status === 'Осмотрен' || status === 'Удостоверен после осмотра') return 'done';
  return 'wait';
};

// Статус НЕ в шапке, а полосой под ней: статусы длинные («Удостоверен по
// документам»), и на 390 пикселях они отжимали адрес до «г. Бишкек,
// Первомайский …». Адресу нужна вся ширина — по нему осмотрщик и опознаёт
// объект.
export function headerHTML({ title, sub, backHref, backLabel, status }) {
  return `<header class="ins-head">
    <a class="ins-back" href="${esc(backHref)}" aria-label="${esc(backLabel)}" title="${esc(backLabel)}">${ico('back', 22)}</a>
    <div class="ins-head-txt">
      <b class="ins-head-title">${esc(title)}</b>
      ${sub ? `<span class="ins-head-sub">${esc(sub)}</span>` : ''}
    </div>
  </header>
  ${status ? `<div class="ins-strip ins-strip-${statusTone(status)}">
    <span class="ins-strip-l">Статус</span>
    <b>${esc(status)}</b>
  </div>` : ''}`;
}

// Панель разделов. Четыре пункта — предел, за которым подписи перестают
// читаться на узком экране; пятый раздел пришлось бы прятать в «ещё», а это
// уже не «быстро и удобно». На телефоне панель внизу, на широком экране
// уезжает наверх — порядком в CSS, без второй разметки.
const TABS = [
  { key: 'task', label: 'Задача', icon: 'task' },
  { key: 'object', label: 'Объект', icon: 'object' },
  { key: 'docs', label: 'Документы', icon: 'docs' },
  { key: 'photo', label: 'Фото', icon: 'photo' },
];

export function tabsHTML(section, hrefFor, counts = {}) {
  return `<nav class="ins-tabs" role="tablist">
    ${TABS.map((t) => {
    const n = counts[t.key];
    return `<a class="ins-tab ${t.key === section ? 'on' : ''}" href="${esc(hrefFor(t.key))}"
      role="tab" aria-selected="${t.key === section ? 'true' : 'false'}">
      <span class="ins-tab-ico">${ico(t.icon)}${n ? `<i class="ins-tab-n">${n > 99 ? '99+' : n}</i>` : ''}</span>
      <span class="ins-tab-l">${esc(t.label)}</span>
    </a>`;
  }).join('')}
  </nav>`;
}

const rowHTML = (label, value, mono) => `<div class="ins-row">
    <span class="ins-row-l">${esc(label)}</span>
    <span class="ins-row-v${mono ? ' mono' : ''}">${value === '' || value == null ? '—' : esc(String(value))}</span>
  </div>`;

// --- экран 1: мои осмотры -------------------------------------------------

// total и pendingCount приходят снаружи: считать их из показанного списка
// нельзя — он уже отфильтрован, и «Все мои» показывали бы число ждущих.
export function listHTML({ tasks, total, pendingCount, inspectors, person, onlyPending, backHref }) {
  return `<div class="ins">
    <header class="ins-head">
      <a class="ins-back" href="${esc(backHref)}" aria-label="К объектам оценки"
        title="К объектам оценки">${ico('back', 22)}</a>
      <div class="ins-head-txt">
        <b class="ins-head-title">Мои осмотры</b>
        <span class="ins-head-sub">${esc(person)}</span>
      </div>
    </header>

    <div class="ins-body ins-body-list">
      <div class="ins-seg" role="tablist">
        <button class="ins-seg-b ${onlyPending ? 'on' : ''}" data-only="1" role="tab"
          aria-selected="${onlyPending ? 'true' : 'false'}">Ждут осмотра${pendingCount ? ` · ${pendingCount}` : ''}</button>
        <button class="ins-seg-b ${onlyPending ? '' : 'on'}" data-only="0" role="tab"
          aria-selected="${onlyPending ? 'false' : 'true'}">Все мои · ${total}</button>
      </div>

      ${tasks.length ? `<ul class="ins-list">
        ${tasks.map(cardHTML).join('')}
      </ul>` : `<p class="ins-empty">${onlyPending
    ? 'Объектов, ждущих осмотра, нет. Посмотрите «Все мои».'
    : 'На этого осмотрщика объекты не назначены.'}</p>`}

      <div class="ins-as">
        <label for="insAs">Показать осмотры</label>
        <select class="select ins-select" id="insAs" data-view-as>
          ${inspectors.map((x) => `<option value="${esc(x.name)}" ${x.name === person ? 'selected' : ''}>${esc(x.name)} · ${x.count}</option>`).join('')}
        </select>
        <span class="ins-note">В работе осмотрщик — это вошедший пользователь;
          выбор здесь нужен только макету, чтобы показать чужие назначения.</span>
      </div>
    </div>
  </div>`;
}

function cardHTML(t) {
  return `<li class="ins-card ${t.done ? 'is-done' : ''}">
    <a class="ins-card-a" href="#/insp/${encodeURIComponent(t.typeId)}/${encodeURIComponent(t.ocId)}">
      <span class="ins-card-top">
        <span class="ins-pill ins-pill-${statusTone(t.status)}">${esc(t.status)}</span>
        <span class="ins-card-type">${esc(t.typeLabel)}</span>
      </span>
      <b class="ins-card-title">${esc(t.title)}</b>
      <span class="ins-card-eni mono">${esc(t.eni || '')}</span>
      <span class="ins-card-meta">
        <span>ОИ: ${t.oiCount}</span>
        ${t.photos ? `<span>фото: ${t.photos}</span>` : ''}
        ${t.pendingNotes ? `<span class="ins-warn">заметок: ${t.pendingNotes}</span>` : ''}
        ${t.done ? `<span class="ins-done">${ico('ok', 14)} осмотр завершён</span>` : ''}
      </span>
    </a>
  </li>`;
}

// --- экран 2: задача ------------------------------------------------------

export function taskHTML({ rec, state, hrefFor, counts, backHref }) {
  const gps = (rec.gps || '').trim();
  const notes = (rec.notes || []).filter((n) => n && n.text);

  return `<div class="ins">
    ${headerHTML({
    title: rec.address || 'Объект оценки',
    sub: rec.type,
    backHref,
    backLabel: 'К моим осмотрам',
    status: rec.status,
  })}

    <div class="ins-body">
      <div class="ins-cols">
        <section class="ins-blk">
          <h2 class="ins-blk-h">Куда ехать</h2>
          ${gps ? `<div class="ins-map" data-map>
            ${mapSchemeHTML()}
            <span class="ins-map-gps mono">${esc(gps)}</span>
          </div>
          <div class="ins-acts">
            <a class="ins-btn ins-btn-main" data-open-map href="${mapLink(gps)}"
              target="_blank" rel="noopener">${ico('pin')} Открыть в картах</a>
            <button class="ins-btn ins-btn-icon" data-copy-gps="${esc(gps)}"
              aria-label="Скопировать координаты" title="Скопировать координаты">${ico('copy')}</button>
          </div>` : '<p class="ins-empty">Координаты объекта не заданы — ориентируйтесь по адресу.</p>'}
        </section>

        <section class="ins-blk">
          <h2 class="ins-blk-h">Сводка</h2>
          ${rowHTML('Тип ОЦ', rec.type)}
          ${rowHTML('Назначение по ТП', rec.purposeTP)}
          ${rowHTML('Код ЕНИ', fmtEni(rec.eni), true)}
          ${rowHTML('Учреждение', rec.institution)}
          ${rowHTML('Подвед', rec.podved)}
          ${rowHTML('Объектов имущества', (rec.oi || []).length)}
          ${rowHTML('Оператор ЦОД', (rec.resp || {}).cod)}
        </section>
      </div>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Примечания к объекту</h2>
        ${notes.length ? `<ul class="ins-notes">
          ${notes.map((n) => `<li class="${n.done ? 'is-done' : ''}">
            <span class="ins-note-txt">${esc(n.text)}</span>
            <span class="ins-note-st">${n.done ? 'выполнено' : 'ждёт'}</span>
          </li>`).join('')}
        </ul>` : '<p class="ins-empty">Замечаний от ЦОД нет.</p>'}
      </section>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Моя заметка с осмотра</h2>
        <textarea class="textarea ins-ta" data-own-note rows="4"
          placeholder="Что увидели на месте: расхождения, доступ, кто встречал">${esc(state.note)}</textarea>
        <p class="ins-hint">Заметка уйдёт в объект вместе с фотографиями.
          Голосовые примечания появятся в серверной версии.</p>
      </section>

      <section class="ins-blk">
        <button class="ins-btn ${state.done ? '' : 'ins-btn-main'} ins-btn-wide" data-toggle-done>
          ${ico('ok')} ${state.done ? 'Снять отметку «осмотр завершён»' : 'Осмотр завершён'}
        </button>
        <p class="ins-hint">Статус «Осмотрен» ставит ЦОД после проверки —
          отметка говорит ему, что можно проверять.</p>
      </section>
    </div>

    ${tabsHTML('task', hrefFor, counts)}
  </div>`;
}

// Схема вместо карты: тайлы тянуть неоткуда — у макета нет внешних
// зависимостей, и на осмотре связь бывает хуже, чем в офисе.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь настоящая карта (2ГИС или Яндекс по API, как в
// ТЗ) с точкой объекта и маршрутом, плюс заранее скачанная область для работы
// без сети.
function mapSchemeHTML() {
  return `<svg class="ins-map-svg" viewBox="0 0 320 120" role="img"
    aria-label="Схема: точка объекта на карте">
    <rect width="320" height="120" fill="var(--ins-map-bg)"/>
    <path d="M0 84h320M0 40h320M74 0v120M206 0v120" stroke="var(--ins-map-line)" stroke-width="6" fill="none"/>
    <path d="M0 62h320" stroke="var(--ins-map-line)" stroke-width="12" fill="none"/>
    <g transform="translate(146,26)" fill="none" stroke="var(--ins-map-pin)" stroke-width="2.5">
      <path d="M14 44S26 30 26 20A12 12 0 0 0 2 20c0 10 12 24 12 24Z" fill="var(--ins-map-pin-fill)"/>
      <circle cx="14" cy="20" r="4.5"/>
    </g>
  </svg>`;
}

// Ссылка одна на все платформы: geo: понимают и Android, и приложения карт на
// iOS, а если обработчика нет — открывается веб-карта.
function mapLink(gps) {
  const [lat, lon] = String(gps).split(',').map((x) => x.trim());
  return `geo:${encodeURIComponent(lat)},${encodeURIComponent(lon)}?q=${encodeURIComponent(lat + ',' + lon)}`;
}

// --- экран 3: карточка ОЦ, только для чтения ------------------------------

export function objectHTML({ rec, openOi, found, hrefFor, assetHref, filledFor, counts, backHref }) {
  const oi = rec.oi || [];

  return `<div class="ins">
    ${headerHTML({
    title: 'Объект оценки',
    sub: rec.address,
    backHref,
    backLabel: 'К задаче',
    status: rec.status,
  })}

    <div class="ins-body">
      <p class="ins-ro">${ico('ok', 14)} Данные ЦОД — только для просмотра. Свои значения вносите в осмотре объекта имущества</p>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Общие данные</h2>
        <div class="ins-cols">
          <div>
            ${rowHTML('Категория', rec.category)}
            ${rowHTML('Тип ОЦ', rec.type)}
            ${rowHTML('Код ЕНИ', fmtEni(rec.eni), true)}
          </div>
          <div>
            ${rowHTML('Координаты', rec.gps, true)}
            ${rowHTML('Собственники', (rec.owners || []).join(', '))}
            ${rowHTML('Пользователи', (rec.users || []).join(', '))}
          </div>
        </div>
      </section>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Объекты имущества · ${oi.length}</h2>
        ${oi.length ? `<ul class="ins-oi">
          ${oi.map((o) => oiItemHTML(o, o.id === openOi, assetHref, filledFor)).join('')}
        </ul>` : '<p class="ins-empty">В объекте нет ни одного ОИ.</p>'}
      </section>

      <section class="ins-blk">
        <h2 class="ins-blk-h">Выявлено на осмотре${found.length ? ' · ' + found.length : ''}</h2>
        ${found.length ? `<ul class="ins-found">
          ${found.map(foundItemHTML).join('')}
        </ul>` : `<p class="ins-empty">Если на месте нашлось строение или механизм,
          которого нет в списке, добавьте его здесь — ЦОД увидит, что объект пришёл
          с осмотра.</p>`}
        <div class="ins-cols" style="margin-top:10px">
          <div class="ins-field">
            <label for="insFoundKind">Что нашли</label>
            <select class="select ins-select" id="insFoundKind" data-found-kind>
              ${FOUND_KINDS.map((k) => `<option>${esc(k)}</option>`).join('')}
            </select>
          </div>
          <button class="ins-btn ins-btn-main" data-found-add>Добавить объект</button>
        </div>
      </section>
    </div>

    ${tabsHTML('object', hrefFor, counts)}
  </div>`;
}

// Объекты имущества раскрываются по одному: на телефоне десять развёрнутых
// карточек — это сплошная прокрутка, в которой не найти нужную.
function oiItemHTML(o, open, assetHref, filledFor) {
  const addr = [o.street ? 'ул. ' + o.street : '', o.house ? 'д. ' + o.house : '',
    o.flat ? 'кв. ' + o.flat : ''].filter(Boolean).join(', ');

  // Статус и адрес склеиваем через фильтр, а не строкой с точкой: у движимого
  // имущества статуса нет, и точка висела в начале строки.
  const sub = [o.status || '', addr].filter(Boolean).join(' · ');
  const filled = filledFor ? filledFor(o.id) : 0;

  return `<li class="ins-oi-i ${open ? 'on' : ''}">
    <button class="ins-oi-h" data-oi="${esc(o.id)}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="ins-oi-t">
        <b>${esc(oiLabel(o))}</b>
        <span class="ins-oi-sub">${esc(sub)}</span>
      </span>
      ${filled ? `<span class="ins-oi-n" title="Заполнено полей осмотра">${filled}</span>` : ''}
      <span class="ins-oi-chev">${ico('chev', 18)}</span>
    </button>
    ${open ? `<div class="ins-oi-b">
      ${rowHTML('Код ЕНИ', fmtEni(o.eni), true)}
      ${rowHTML('Год постройки', Array.isArray(o.year) ? o.year.join(', ') : o.year)}
      ${rowHTML('Площадь по ТП, м²', (o.areas || {}).tp)}
      ${rowHTML('Площадь застройки, м²', (o.areas || {}).build)}
      ${rowHTML('Этажей', o.floors)}
      ${rowHTML('Координаты', o.gps, true)}
      ${o.serial ? rowHTML('Заводской номер', o.serial, true) : ''}
      <a class="ins-btn ins-btn-main ins-btn-wide ins-oi-go"
        href="${esc(assetHref(o.id))}">${ico('pen')} ${filled ? 'Продолжить осмотр' : 'Осмотреть'}</a>
    </div>` : ''}
  </li>`;
}

// Выявленный на осмотре объект. Помечается признаком — по нему ЦОД видит, что
// объект пришёл с осмотра, а не был заведён по документам (решение
// пользователя 08.09.2026). Прикрепить к нему можно то, что получится:
// наименование, заметку и фото через раздел «Фото».
function foundItemHTML(f) {
  return `<li class="ins-found-i">
    <span class="ins-found-top">
      <span class="ins-pill ins-pill-wait">выявлен на осмотре</span>
      <span class="ins-found-kind">${esc(f.kind)}</span>
      <span class="ins-found-at">${esc(f.foundAt)}</span>
    </span>
    <div class="ins-field">
      <label>Наименование</label>
      <input class="input ins-input" data-found-name="${esc(f.id)}" value="${esc(f.name)}"
        placeholder="Например: навес за котельной">
    </div>
    <div class="ins-field">
      <label>Что видно на месте</label>
      <textarea class="textarea ins-ta" data-found-note="${esc(f.id)}" rows="2"
        placeholder="Размеры на глаз, состояние, к чему примыкает">${esc(f.note)}</textarea>
    </div>
    <button class="ins-btn ins-btn-icon" data-found-drop="${esc(f.id)}"
      aria-label="Убрать объект" title="Убрать объект">${ico('trash', 18)}</button>
  </li>`;
}

// --- экран 3б: осмотр одного объекта имущества ----------------------------
//
// Поля строятся из описания (form.js) конструктором ядра — разметки полей тут
// нет вовсе. Добавили поле в описание — оно появится и здесь, и в карточке,
// когда карточка на конструктор перейдёт.
export function assetHTML({
  rec, typeId, oi, values, premises, photoHref, collapsed, hrefFor, counts, backHref,
}) {
  // Разделы и перечень полей — по типу ОЦ задачи: материалы приходят из его
  // справочников, поэтому описание формы уже не константа.
  const SECTIONS = sections(typeId);
  const ALL_FIELDS = allFields(typeId);
  const left = requiredLeft(ALL_FIELDS, values);
  const filled = filledCount(ALL_FIELDS, values);

  // Все разделы открыты по умолчанию: свёрнутое заранее приходится
  // разворачивать, а на осмотре нужно заполнять (замечание пользователя
  // 08.09.2026). Свернуть раздел можно руками — тогда он попадает в collapsed.

  return `<div class="ins">
    ${headerHTML({
    title: oiLabel(oi),
    sub: rec.address,
    backHref,
    backLabel: 'К объектам имущества',
  })}

    <div class="ins-sum" data-sum>
      <span class="ins-sum-t">
        <b>${filled}</b> из ${ALL_FIELDS.length} полей
        <i class="${left ? 'ins-warn' : 'ins-done'}">${left
    ? `· обязательных ${left}`
    : '· обязательные заполнены'}</i>
      </span>
      <button class="ins-btn ins-btn-main ins-btn-sm" data-asset-save>Сохранить</button>
    </div>

    <div class="ins-body">
      <section class="ins-blk">
        <h2 class="ins-blk-h">Объект</h2>
        <div class="ins-cols">
          <div>
            ${rowHTML('Код ЕНИ', fmtEni(oi.eni), true)}
            ${rowHTML('Наименование', oi.name)}
          </div>
          <div>
            ${rowHTML('Этажность', oi.floors)}
            ${rowHTML('Год постройки', Array.isArray(oi.year) ? oi.year.join(', ') : oi.year)}
          </div>
        </div>
      </section>

      ${SECTIONS.map((sec) => accordionHTML(sec, values, oi, collapsed)).join('')}

      ${premisesHTML(premises)}

      <section class="ins-blk">
        <a class="ins-btn ins-btn-wide" href="${esc(photoHref)}">${ico('photo')} Прикрепить фото или документ</a>
      </section>
    </div>

    ${tabsHTML('object', hrefFor, counts)}
  </div>`;
}

// Раздел. Свёрнутый ОБЯЗАН говорить о себе: сколько полей заполнено и сколько
// обязательных осталось — иначе свёртка прячет не только поля, но и то, что в
// них не хватает.
function accordionHTML(sec, values, oi, collapsed) {
  const p = sectionProgress(sec, values);
  const open = !(collapsed || []).includes(sec.key);

  const inner = sectionHTML(sec, values, {
    ui: FS_UI,
    hintFor: (f) => mismatchHint(f, values, oi),
    wrap: (s, html) => `<div class="ins-fs-grid">${html}</div>`,
  });

  return `<section class="ins-blk ins-acc ${open ? 'on' : ''}">
    <button class="ins-acc-h" data-sec="${esc(sec.key)}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="ins-acc-t">
        <b>${esc(sec.title)}</b>
        <span class="ins-acc-sub">${p.filled} из ${p.total}${sec.optional ? ' · по возможности' : ''}</span>
      </span>
      ${p.requiredLeft
    ? `<span class="ins-acc-n ins-acc-need"
        title="Обязательных полей осталось: ${p.requiredLeft}">${p.requiredLeft}</span>`
    : (p.filled ? `<span class="ins-acc-n ins-acc-ok"
        title="Обязательные поля раздела заполнены">${ico('ok', 14)}</span>` : '')}
      <span class="ins-oi-chev">${ico('chev', 18)}</span>
    </button>
    ${open ? `<div class="ins-acc-b">${inner}</div>` : ''}
  </section>`;
}

function premisesHTML(list) {
  return `<section class="ins-blk">
    <h2 class="ins-blk-h">Помещения${list.length ? ' · ' + list.length : ''}</h2>
    ${list.length ? `<ul class="ins-pm">
      ${list.map((pm) => `<li class="ins-pm-i">
        <div class="ins-field">
          <label>Наименование</label>
          <input class="input ins-input" data-pm-name="${esc(pm.id)}" value="${esc(pm.name)}"
            placeholder="Кабинет, коридор, санузел">
        </div>
        <div class="ins-field ins-pm-area">
          <label>Площадь, м²</label>
          <input class="input ins-input" data-pm-area="${esc(pm.id)}" value="${esc(pm.area)}"
            inputmode="decimal">
        </div>
        <button class="ins-icon-b" data-pm-drop="${esc(pm.id)}"
          aria-label="Убрать помещение" title="Убрать помещение">${ico('trash', 18)}</button>
      </li>`).join('')}
    </ul>` : '<p class="ins-empty">В строении пока нет помещений.</p>'}
    <button class="ins-btn ins-btn-wide" data-pm-add style="margin-top:10px">Добавить помещение</button>
    <p class="ins-hint">Поэтажные планы и экспликации — в техпаспорте, раздел «Документы».
      Планировку определяет оценщик, на осмотре её не заполняют.</p>
  </section>`;
}

// --- экран 4: документы ---------------------------------------------------

export function docsHTML({ rec, docs, hrefFor, counts, backHref }) {
  return `<div class="ins">
    ${headerHTML({
    title: 'Документы',
    sub: rec.address,
    backHref,
    backLabel: 'К задаче',
  })}

    <div class="ins-body">
      ${docs.length ? `<ul class="ins-docs">
        ${docs.map(docItemHTML).join('')}
      </ul>` : `<p class="ins-empty">На осмотр документы не назначены.
        Их выбирает региональный менеджер при назначении осмотра.</p>`}
    </div>

    ${tabsHTML('docs', hrefFor, counts)}
  </div>`;
}

// owner — чей это документ: объект оценки, литера, механизм или транспортное
// средство. Без него «паспорт котла» не найти среди десятка паспортов, а
// техпаспорт литеры не отличить от техпаспорта соседней (требование
// пользователя 08.09.2026).
function docItemHTML({ doc: d, owner }) {
  const file = d.file || null;
  const meta = [d.type, d.date, file && file.name].filter(Boolean).join(' · ');

  return `<li class="ins-doc">
    <span class="ins-doc-ico">${ico('docs')}</span>
    <span class="ins-doc-t">
      <b>${esc(d.title || d.name || 'Документ')}</b>
      <span class="ins-doc-owner">${esc(owner)}</span>
      <span class="ins-doc-sub">${esc(meta || 'без файла')}</span>
    </span>
    ${file && file.dataUrl
    ? `<a class="ins-btn ins-btn-sm" href="${esc(file.dataUrl)}" target="_blank" rel="noopener">Открыть</a>`
    : '<span class="ins-doc-no">файла нет</span>'}
  </li>`;
}

// --- экран 5: фото --------------------------------------------------------
//
// Снимок привязывается к объекту имущества, а не только к категории
// (требование пользователя 08.09.2026): фото кровли без литеры не отличить от
// фото кровли соседней литеры, а «какой механизм» — единственное, что делает
// снимок механизма осмысленным.
export function photoHTML({ groups, total, oiId, cat, oiList, hrefFor, counts, backHref, sub }) {
  return `<div class="ins">
    ${headerHTML({
    title: 'Фото с осмотра',
    sub: sub || `${total} из ${PHOTO_LIMIT}`,
    backHref,
    backLabel: 'К задаче',
  })}

    <div class="ins-body">
      <section class="ins-blk">
        <div class="ins-cols">
          <div class="ins-field">
            <label for="insOi">Объект имущества</label>
            <select class="select ins-select" id="insOi" data-oi-pick>
              ${oiList.map((o) => `<option value="${esc(o.id)}" ${o.id === oiId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
            </select>
          </div>
          <div class="ins-field">
            <label for="insCat">Категория съёмки</label>
            <select class="select ins-select" id="insCat" data-cat>
              ${PHOTO_CATS.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="ins-btn ins-btn-main ins-btn-wide" data-shoot
          ${oiList.length ? '' : 'disabled'}>${ico('photo')} Снять или выбрать</button>
        <p class="ins-hint">${oiList.length
    ? 'Снимок попадёт выбранному объекту в выбранную категорию — перенести его можно из просмотра.'
    : 'Сначала в объекте должен появиться хотя бы один объект имущества.'}</p>
      </section>

      ${total ? [...groups.entries()].map(([, g]) => `<section class="ins-blk">
        <h2 class="ins-blk-h">${esc(g.label)}</h2>
        ${[...g.cats.entries()].map(([name, list]) => `<div class="ins-shots">
          <span class="ins-shots-h">${esc(name)} · ${list.length}</span>
          <ul class="ins-grid">
            ${list.map((p) => `<li class="ins-shot">
              <button class="ins-shot-b" data-shot="${esc(p.id)}" title="Открыть снимок">
                <img src="${esc(p.url)}" alt="${esc(p.name)}" loading="lazy">
              </button>
            </li>`).join('')}
          </ul>
        </div>`).join('')}
      </section>`).join('') : '<p class="ins-empty">Снимков пока нет.</p>'}
    </div>

    ${tabsHTML('photo', hrefFor, counts)}
  </div>`;
}

// Полноэкранный просмотр снимка — он же место, где снимок переносят и
// удаляют. В сетке для двух списков и кнопки нет ширины, а здесь есть: и
// смотреть удобнее, и промахнуться по мелкой кнопке невозможно.
export function lightboxHTML(p, oiList) {
  return `<div class="ins-lb" data-lb>
    <button class="ins-lb-x" data-lb-close aria-label="Закрыть">${ico('back', 22)}</button>
    <img src="${esc(p.url)}" alt="${esc(p.name)}">
    <div class="ins-lb-bar">
      <div class="ins-field">
        <label for="lbOi">Объект имущества</label>
        <select class="select ins-select" id="lbOi" data-move-oi="${esc(p.id)}">
          ${oiList.map((o) => `<option value="${esc(o.id)}" ${o.id === p.oiId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </div>
      <div class="ins-field">
        <label for="lbCat">Категория</label>
        <select class="select ins-select" id="lbCat" data-move="${esc(p.id)}">
          ${PHOTO_CATS.map((c) => `<option ${c === p.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <button class="ins-btn ins-btn-icon" data-drop="${esc(p.id)}"
        aria-label="Удалить снимок" title="Удалить снимок">${ico('trash', 18)}</button>
    </div>
  </div>`;
}
