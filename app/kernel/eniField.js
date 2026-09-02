// Поле кода ЕНИ — ввод, маска и проверка длины в одном месте.
//
// Требование пользователя: «Формат ЕНИ другим быть не может. Если он другой —
// это ошибка». Сама проверка (eniError, ENI_LENGTH) давно лежала в kernel/fmt.js,
// но её никто не вызывал: во всех формах стоял только parseEni, который
// вычищает нецифры и записывает что угодно. Код из пяти цифр сохранялся молча
// и доезжал до реестра и до фильтра областей (он берёт первую цифру).
//
// Почему отдельный модуль, а не строчка в каждом контроллере: полей ЕНИ в
// проекте шесть видов (две формы ОЦ, шапки карточек литеры, квартиры и участка),
// и правило должно быть одно на всех — иначе разъедется, как уже разъехались
// значки состояния.
import { fmtEni, parseEni, eniError } from './fmt.js';

// Сообщение живёт рядом с полем и НЕ входит в поток: сетки форм выравнивают
// поля по низу, и выросшее на строку поле подняло бы соседей (этим уже
// отличалась подпись под GPS-координатами).
function errorBox(input) {
  const holder = input.closest('.field') || input.parentElement;
  if (!holder) return null;
  let box = holder.querySelector('[data-eni-err]');
  if (!box) {
    box = document.createElement('span');
    box.className = 'eni-err';
    box.setAttribute('data-eni-err', '');
    holder.appendChild(box);
  }
  return box;
}

// Показать/снять ошибку. Возвращает текст ошибки ('' — всё в порядке).
export function showEniError(input) {
  const err = eniError(input.value);
  const box = errorBox(input);
  if (box) box.textContent = err;
  input.classList.toggle('eni-bad', !!err);
  return err;
}

// Привязка к конкретному полю. onCommit вызывается только с корректным кодом:
// писать в данные заведомо неверный ЕНИ незачем — но и терять набранное нельзя,
// поэтому в поле текст остаётся, а подсветка держится до исправления.
export function bindEniField(input, onCommit) {
  if (!input) return;

  input.oninput = () => {
    showEniError(input);
  };

  input.onchange = () => {
    const err = showEniError(input);
    if (err) return;
    const digits = parseEni(input.value);
    input.value = fmtEni(digits);
    if (onCommit) onCommit(digits);
  };
}

// Проверка перед сохранением: подсвечивает все поля ЕНИ в области и возвращает
// первое неверное — контроллеру остаётся показать сообщение и не уходить с формы.
export function firstBadEni(scope) {
  const inputs = scope.$$('[data-head-eni], [data-land-eni], #fEni');
  for (const input of inputs) {
    if (showEniError(input)) return input;
  }
  return null;
}
