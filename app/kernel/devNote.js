// Заметка для разработчиков — значок «i» в кружке рядом с полем или блоком.
//
// Зачем: в макете есть места, где решение отложено или ещё обсуждается —
// «зона и микрорайон потом будут подставляться по координатам», «признаки
// рангов не описаны». Такие вещи терялись в переписке и всплывали заново.
// Требование пользователя 04.09.2026: показывать их прямо в интерфейсе,
// значком «i» в кружке, ЯРКИМ цветом — чтобы точно заметили.
//
// Кому адресована: разработчикам и тем, кто принимает макет. В рабочей системе
// таких заметок нет — это макетная пометка, и цвет у неё намеренно чужой для
// интерфейса (янтарный), чтобы её не приняли за обычную подсказку.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: заметки не переносятся — при переходе на настоящую
// систему они либо превращаются в задачи, либо снимаются вместе с вопросом,
// который их породил.
import { esc } from './dom.js';

// Раскрытие — на CSS (:hover и :focus-within), без обработчиков: заметка живёт
// внутри карточек, которые перерисовываются целиком, и любой JS-обработчик
// пришлось бы привязывать заново после каждой отрисовки.
//
// Куда раскрывается — считает installDevNoteBounds по фактическим размерам
// текста: у полей правой колонки он уезжал за край экрана, а в заголовке блока
// построек уходил под таблицу (пользователь 04.09.2026). `align: 'left'` —
// пожелание раскрыть влево от значка; границы окна всё равно главнее.
//
// text  — что сказать разработчику;
// title — короткий заголовок заметки (по умолчанию «Заметка для разработчиков»);
// align — 'auto' | 'left' | 'right': куда раскрывать.
export function devNote(text, { title = 'Заметка для разработчиков', align = 'auto' } = {}) {
  if (!text) return '';

  return `<span class="dev-note ${align === 'left' ? 'left' : ''}" tabindex="0" role="note"
    data-dev-note data-dev-align="${esc(align)}">
    <span class="dev-note-ico" aria-hidden="true">i</span>
    <span class="dev-note-pop">
      <b>${esc(title)}</b>
      <span>${esc(text)}</span>
    </span>
  </span>`;
}

// Держать заметку в границах окна и поверх всего остального. Слушатель один на
// документ и ставится один раз: заметки перерисовываются вместе с карточками, и
// обработчик на каждой копился бы всю сессию.
//
// ПРАВИЛО ПРОЕКТА (docs/reestr-kosyakov.md §1): любая всплывающая подсказка
// обязана считаться с границами страницы и не может перекрываться соседними
// элементами. Уехавший за край или закрытый текст читается наполовину, и
// человек об этом даже не узнает — он просто не видит, что там было.
//
// Почему координаты считает JS, а не CSS. Заметка стоит внутри карточек и
// заголовков блоков, а те живут в своих контекстах наложения и местами режут
// содержимое по `overflow`. Абсолютно позиционированный текст в такой обстановке
// то уезжает за экран, то оказывается под таблицей вспомогательных построек
// (пользователь 04.09.2026). Поэтому раскрытая заметка переводится в
// `position:fixed` с координатами от значка: у fixed нет ни родительского
// обрезания, ни чужого порядка наложения.
let bounded = false;

export function installDevNoteBounds() {
  if (bounded || typeof document === 'undefined') return;
  bounded = true;

  const GAP = 7;      // отступ от значка
  const PAD = 8;      // отступ от края окна

  const place = (note) => {
    const pop = note.querySelector('.dev-note-pop');
    if (!pop) return;

    // Сначала снимаем прежнее решение: сторона иначе «залипает», и на другом
    // месте экрана выбор окажется неверным.
    note.classList.remove('left', 'up');
    pop.style.cssText = '';

    // Меряем в исходном положении — размеры текста от координат не зависят,
    // а :hover к моменту события уже применён, поэтому блок видим.
    const ico = note.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = note.dataset.devAlign === 'left' ? ico.right - box.width : ico.left;
    if (left + box.width > vw - PAD) left = vw - PAD - box.width;
    if (left < PAD) left = PAD;

    let top = ico.bottom + GAP;
    if (top + box.height > vh - PAD) {
      const above = ico.top - GAP - box.height;
      top = above >= PAD ? above : Math.max(PAD, vh - PAD - box.height);
    }

    pop.style.position = 'fixed';
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
  };

  const onEnter = (e) => {
    const note = e.target.closest && e.target.closest('[data-dev-note]');
    if (note) place(note);
  };

  document.addEventListener('mouseover', onEnter, true);
  document.addEventListener('focusin', onEnter, true);

  // Прокрутка и смена размера окна сдвигают значок, а fixed-текст остался бы на
  // месте. Проще убрать раскрытие, чем гнаться за координатами.
  const drop = () => {
    document.querySelectorAll('.dev-note-pop[style]').forEach((pop) => {
      const note = pop.closest('[data-dev-note]');
      if (note && !note.matches(':hover') && !note.contains(document.activeElement)) {
        pop.style.cssText = '';
      }
    });
  };
  window.addEventListener('scroll', drop, true);
  window.addEventListener('resize', drop);
}

// Заметка рядом с подписью поля: <label>Название devNote(...)</label>.
// Отдельная функция ради читаемости вызова в разметке карточек.
export const noteAfter = (label, text, opts) => `${label} ${devNote(text, opts)}`;
