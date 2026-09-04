// Сообщение об ошибке рядом с полем — одна реализация на все поля с проверкой.
//
// Первым таким полем был код ЕНИ (kernel/eniField.js), и сообщение жило там же,
// с классами `eni-err`/`eni-bad`. Когда проверка формата понадобилась
// координатам участка, выбор был между «переиспользовать классы с чужим именем»
// и «завести второй такой же механизм». Оба плохи: в первом случае в разметке
// координат появляется ЕНИ, во втором сообщения начнут выглядеть по-разному.
//
// Сообщение НЕ входит в поток: сетки форм выравнивают поля по низу, и выросшее
// на строку поле подняло бы соседей (этим уже отличалась подпись под
// координатами).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: проверка здесь только формата — того, что видно по
// самому значению. Правила, требующие данных (существует ли такой код, попадает
// ли точка в границы области), проверяются на сервере, и сообщение о них
// приходит оттуда — этой же функцией его и показывать.

// Куда положить сообщение: в блок поля, иначе рядом с самим полем.
function errorBox(input) {
  const holder = input.closest('.field') || input.parentElement;
  if (!holder) return null;

  let box = holder.querySelector('[data-field-err]');
  if (!box) {
    box = document.createElement('span');
    box.className = 'field-err';
    box.setAttribute('data-field-err', '');
    holder.appendChild(box);
  }
  return box;
}

// Показать ошибку или снять её (пустой текст). Возвращает текст ошибки.
export function setFieldError(input, text) {
  if (!input) return '';
  const box = errorBox(input);
  if (box) box.textContent = text || '';
  input.classList.toggle('field-bad', !!text);
  return text || '';
}

// Привязка поля с проверкой формата.
//
// check(value) возвращает текст ошибки или '' — пустое значение проверять не
// должен: незаполненное поле не ошибка, а просто незаполненное поле.
// onCommit вызывается только с корректным значением: писать в данные заведомо
// неверное незачем, но и терять набранное нельзя — в поле текст остаётся, а
// подсветка держится до исправления.
export function bindCheckedField(input, check, onCommit) {
  if (!input) return;

  input.oninput = () => { setFieldError(input, check(input.value)); };

  input.onchange = () => {
    const err = setFieldError(input, check(input.value));
    if (err) return;
    if (onCommit) onCommit(input.value.trim());
  };
}
