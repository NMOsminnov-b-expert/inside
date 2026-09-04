// Что исчезнет из карточки, если сменить значение поля.
//
// Зачем: в карточках есть поля, от которых зависит состав ОСТАЛЬНЫХ полей —
// категория ОИ открывает дополнительные параметры производственного строения,
// тип участка переключает сельхоз-характеристики на инженерные сети. Человек
// меняет одно значение и не видит, что вместе с ним со страницы ушли пять
// заполненных полей: они просто перестают показываться. ТЗ требует
// предупреждения (docs/tz/30-uchastok-pravki.md §9.6).
//
// Как считается: карточка рисуется дважды — с текущим значением и с новым — и
// сравниваются НАБОРЫ ПОДПИСЕЙ полей. Не ключи данных и не data-атрибуты:
// подпись это и есть человеческий текст, который нужно показать в диалоге, а
// значит не нужен ни справочник ключей, ни риск вывести в интерфейс кусок кода
// (docs/reestr-kosyakov.md §2). Значения берутся из той же отрисовки, поэтому
// про устройство записи здесь тоже знать не требуется — правило работает в
// любой карточке любого модуля.
//
// Ограничение приёма: сравниваются только поля (.field). Раздел, исчезающий
// целиком, виден как исчезновение всех своих полей — этого достаточно; а вот
// исчезнувший заголовок без полей замечен не будет.

// Поля отрисованной карточки: подпись → показанное значение.
function fieldsOf(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = new Map();

  doc.querySelectorAll('.field').forEach((field) => {
    const label = field.querySelector('label');
    if (!label) return;

    // Значок заметки «i» и вложенные поля в тексте подписи не участвуют.
    const copy = label.cloneNode(true);
    copy.querySelectorAll('.dev-note, input, select, textarea').forEach((n) => n.remove());
    const text = (copy.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || out.has(text)) return;

    out.set(text, valueOf(field));
  });

  return out;
}

// Показанное значение поля. Флажок читается как «да/нет»: в диалоге «отдельный
// вход (нет)» бессмысленно, поэтому невыбранный флажок считается пустым.
function valueOf(field) {
  const el = field.querySelector('input, select, textarea');
  if (!el) return '';

  if (el.tagName === 'SELECT') {
    const picked = el.querySelector('option[selected]');
    return picked ? (picked.textContent || '').trim() : '';
  }
  if (el.tagName === 'TEXTAREA') return (el.textContent || '').trim();
  if (el.getAttribute('type') === 'checkbox') {
    return el.hasAttribute('checked') ? 'да' : '';
  }
  return (el.getAttribute('value') || '').trim();
}

// Поля, которые есть сейчас и пропадут после смены значения — только
// заполненные: в пустых терять нечего, а длинный список пустых полей пугает на
// пустом месте.
//
// render — функция отрисовки карточки (ctx, oi) → HTML;
// oi — текущая запись объекта имущества;
// change — что в ней поменять, объектом: { catClass: 'Прочее' }.
//
// Сама запись не меняется: отрисовка идёт по копии. Иначе предпросмотр стал бы
// правкой и попал в лог действий, даже если человек нажмёт «Отмена».
export function fieldsThatDisappear(render, ctx, oi, change) {
  try {
    const before = fieldsOf(render(ctx, oi));
    const after = fieldsOf(render(ctx, { ...oi, ...change }));

    const lost = [];
    before.forEach((value, label) => {
      if (!after.has(label) && value) lost.push(`${label} (${value})`);
    });
    return lost;
  } catch (e) {
    // Предпросмотр — вспомогательная вещь: если карточка почему-то не
    // отрисовалась дважды, смена значения должна работать всё равно.
    return [];
  }
}
