// Год и дата — единый компонент на весь проект (Л2.3, Л2.4).
//
// Почему в ядре: поле года есть во всех карточках ОИ всех пяти модулей, а
// требования к нему одинаковые и неочевидные — их легко потерять при копировании.
//
// Требования, ради которых компонент и заведён:
//   * ввод с клавиатуры, а не только выбор мышью;
//   * КОЛЁСИКО МЫШИ НЕ МЕНЯЕТ ЗНАЧЕНИЕ. Прямое требование: у обычного
//     <input type="number"> прокрутка страницы над полем незаметно правит год;
//   * валидация: только цифры, разумный диапазон, подсветка ошибки;
//   * годов может быть несколько — здание достраивали и перестраивали
//     (Л2.4), поэтому это список с добавлением по кнопке.

const MIN_YEAR = 1800;

// Иконка календаря — тонкий контур в стиле макета, а не эмодзи: эмодзи
// рисуется цветным шрифтом системы и выбивается из оформления.
const CAL_ICON = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <path d="M1.5 5.5h11M4.5 1.5v2M9.5 1.5v2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

// Верхняя граница — текущий год: дом не может быть построен в будущем.
const maxYear = () => new Date().getFullYear();

// Год в данных может лежать как одно значение (так было до Л2.4) или списком.
// Читаем всегда списком, чтобы старые записи не падали.
//
// Пустые значения НЕ отбрасываем: только что добавленная кнопкой строка пуста,
// и если её выбросить, она исчезнет на первой же перерисовке — кнопка «+»
// выглядела бы нерабочей. Отсеиваются пустые только при показе (yearSummary).
export function yearList(oi, key = 'year') {
  const v = oi && oi[key];
  if (Array.isArray(v)) return v.slice();
  return v ? [v] : [];
}

// Пустая строка допустима — год просто не заполнен.
export function yearError(value) {
  const t = String(value == null ? '' : value).trim();
  if (!t) return '';
  if (!/^\d{4}$/.test(t)) return 'Год — четыре цифры';
  const n = +t;
  if (n < MIN_YEAR) return `Не раньше ${MIN_YEAR}`;
  if (n > maxYear()) return `Не позже ${maxYear()}`;
  return '';
}

// Выбор года мышью — страницами по 12 лет, а не одним списком: годов от 1800
// до текущего больше двухсот, и прокручивать их — мучение. Страница
// открывается на десятилетии текущего значения, стрелками ходят по соседним.
const PAGE = 12;

const pageStart = (value) => {
  const base = /^\d{4}$/.test(String(value || '')) ? +value : maxYear();
  return Math.floor(base / PAGE) * PAGE;
};

export function pickBodyHTML(key, i, value, from) {
  const years = [];
  for (let y = from; y < from + PAGE; y++) {
    if (y >= MIN_YEAR && y <= maxYear()) years.push(y);
  }

  return `<div class="yf-pick-head">
      <button class="yf-pick-nav" data-year-page="${key}|${i}|${from - PAGE}"
        ${from - PAGE < MIN_YEAR ? 'disabled' : ''} title="Раньше">‹</button>
      <span class="yf-pick-range">${from}—${Math.min(from + PAGE - 1, maxYear())}</span>
      <button class="yf-pick-nav" data-year-page="${key}|${i}|${from + PAGE}"
        ${from + PAGE > maxYear() ? 'disabled' : ''} title="Позже">›</button>
    </div>
    <div class="yf-pick-grid">
      ${years.map((y) => `<button class="yf-pick-y ${String(y) === String(value) ? 'on' : ''}"
        data-year-set="${key}|${i}|${y}">${y}</button>`).join('')}
    </div>`;
}

function pickerHTML(key, i, value) {
  return `<div class="yf-pick" data-year-pick="${key}|${i}" hidden>
    ${pickBodyHTML(key, i, value, pageStart(value))}
  </div>`;
}

function rowHTML(key, value, i, single) {
  const err = yearError(value);

  // Кнопка выбора — ВНУТРИ поля, у правого края: снаружи она отъедала ширину у
  // и без того узкого поля и висела отдельным элементом.
  return `<div class="yf-row" data-year-row="${i}">
    <span class="yf-ctl">
      <input class="input yf-input ${err ? 'yf-bad' : ''}" data-year-input="${key}|${i}"
        value="${String(value == null ? '' : value)}" inputmode="numeric" maxlength="4"
        placeholder="ГГГГ" title="Четыре цифры, от ${MIN_YEAR} до ${maxYear()}">
      <button class="yf-cal" data-year-cal="${key}|${i}" title="Выбрать год">${CAL_ICON}</button>
      ${pickerHTML(key, i, value)}
    </span>
    ${single ? '' : `<button class="yf-del" data-year-del="${key}|${i}" title="Убрать год">×</button>`}
    ${err ? `<span class="yf-err">${err}</span>` : ''}
  </div>`;
}

// label — подпись поля; key — имя поля записи (обычно 'year').
export function yearFieldHTML(oi, label, key = 'year') {
  const list = yearList(oi, key);
  const rows = list.length ? list : [''];

  return `<div class="field yf" data-year-field="${key}">
    <label>${label}
      <button class="yf-add" data-year-add="${key}" title="Добавить ещё год — здание могли достраивать">+</button>
    </label>
    <div class="yf-rows">${rows.map((v, i) => rowHTML(key, v, i, rows.length === 1)).join('')}</div>
  </div>`;
}

// Значение для показа в одну строку (перечни, плашки): «1998, 2014».
export const yearSummary = (oi, key = 'year') =>
  yearList(oi, key).filter((x) => String(x).trim()).join(', ');

// Слушатели вешаются ПРЯМО на элементы, а не делегированием на скоуп: карточка
// перепривязывается на каждой отрисовке, и делегированные слушатели копились бы
// (этим уже отличились заметки, состав и отопление).
export function bindYearField(ctx, oi, key = 'year') {
  const box = ctx.scope.$(`[data-year-field="${key}"]`);
  if (!box) return;

  // Список годов закрывается кликом мимо. Вешается один раз на скоуп:
  // карточка перепривязывается на каждой отрисовке, а документные слушатели
  // снимаются только при уходе с экрана — иначе копились бы.
  if (!ctx.scope.root.dataset.yearPickBound) {
    ctx.scope.root.dataset.yearPickBound = '1';
    ctx.scope.onDocument('click', (e) => {
      if (e.target.closest('.yf-row')) return;
      ctx.scope.$$('[data-year-pick]').forEach((x) => { x.hidden = true; });
    });
  }

  // Пишем как есть, вместе с пустыми: пустая строка — это ещё не заполненный
  // год, а не мусор. При показе они отсеиваются.
  const write = (list) => { oi[key] = list; };

  box.querySelectorAll('[data-year-input]').forEach((inp) => {
    // Только цифры и не длиннее четырёх — правим по ходу набора, чтобы поле
    // нельзя было довести до заведомо неверного вида.
    inp.oninput = () => {
      const clean = inp.value.replace(/\D/g, '').slice(0, 4);
      if (clean !== inp.value) inp.value = clean;

      const list = yearList(oi, key);
      const i = +inp.dataset.yearInput.split('|')[1];
      while (list.length <= i) list.push('');
      list[i] = clean;
      write(list);

      inp.classList.toggle('yf-bad', !!yearError(clean));
    };

    // Колёсико над полем не меняет год — оно прокручивает страницу.
    // Формально <input type="text"> и не должен реагировать, но поле может
    // получить фокус и стрелки, поэтому гасим явно и оставляем прокрутку
    // странице (без preventDefault).
    inp.onwheel = (e) => { if (document.activeElement === inp) inp.blur(); void e; };

    // Стрелками вверх-вниз год тоже не крутим: значение вводят, а не подбирают.
    inp.onkeydown = (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); };
  });

  // Календарь здесь — ОПЦИЯ: значение вводят с клавиатуры, а иконкой открывают
  // список. Поле хранит только год, поэтому и выбирать можно только год —
  // месяцы и числа тут не нужны (решение пользователя 2026-08-27).
  box.querySelectorAll('[data-year-cal]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pick = btn.parentElement.querySelector('[data-year-pick]');
      box.querySelectorAll('[data-year-pick]').forEach((x) => { if (x !== pick) x.hidden = true; });
      pick.hidden = !pick.hidden;
    };
  });

  // Перелистывание страниц перерисовывает только сам список: полный render()
  // закрыл бы его, и до соседнего десятилетия было бы не добраться.
  const bindPick = (pick) => {
    pick.querySelectorAll('[data-year-page]').forEach((nav) => {
      nav.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const [k, i, from] = nav.dataset.yearPage.split('|');
        const cur = yearList(oi, k)[+i] || '';
        pick.innerHTML = pickBodyHTML(k, +i, cur, +from);
        bindPick(pick);
      };
    });

    pick.querySelectorAll('[data-year-set]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const [, i, y] = btn.dataset.yearSet.split('|');
        const list = yearList(oi, key);
        while (list.length <= +i) list.push('');
        list[+i] = y;
        write(list);
        ctx.render();
      };
    });
  };

  box.querySelectorAll('[data-year-pick]').forEach(bindPick);

  const add = box.querySelector('[data-year-add]');
  if (add) add.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = yearList(oi, key);
    list.push('');
    oi[key] = list;
    ctx.render();
  };

  box.querySelectorAll('[data-year-del]').forEach((b) => b.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const i = +b.dataset.yearDel.split('|')[1];
    const list = yearList(oi, key);
    list.splice(i, 1);
    oi[key] = list;
    ctx.render();
  });
}
