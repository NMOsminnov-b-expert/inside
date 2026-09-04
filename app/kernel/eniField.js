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
import { fmtEni, parseEni, eniError, ENI_UNIQUE } from './fmt.js';
import { sortedTypes } from './registry.js';
import { ocEntryByEni } from './archiveStore.js';
import { ARCHIVE_HREF } from './router.js';

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

// Совпадение кода ЕНИ (ТЗ docs/tz/20-arhiv.md §6.3, уточнение пользователя
// 03.09.2026): код МОЖЕТ повторяться у живых записей, но не должен молча
// потеряться в архиве — совпавшая архивная запись всегда называется, ссылкой
// на неё. Флаг ENI_UNIQUE (kernel/fmt.js) переключает, блокирует ли совпадение
// сохранение (true) или только предупреждает (false, по умолчанию).
//
// Ищем и по живым записям (across sortedTypes — ядро не знает типов ОЦ, но
// умеет их перечислить через реестр), и по архиву (archiveStore.eniTaken/
// ocEntryByEni) — единственное место с этой логикой, иначе разные формы будут
// проверять по-разному.
function findEniMatches(digits, exceptId) {
  const live = [];
  sortedTypes().forEach((t) => {
    if (!t.records.allRecords) return;
    t.records.allRecords().forEach((r) => {
      if (String(r.eni) === digits && r.id !== exceptId) {
        live.push({ typeId: t.manifest.id, typeLabel: t.manifest.label, rec: r });
      }
    });
  });
  return { live, archived: ocEntryByEni(digits) };
}

// Предупреждение/блокировка о совпадении — отдельная плашка от формата: та
// красная и всегда обязательна, эта жёлтая при ENI_UNIQUE=false (можно
// продолжать) и красная при true (сохранить нельзя).
function dupBox(input) {
  const holder = input.closest('.field') || input.parentElement;
  if (!holder) return null;
  let box = holder.querySelector('[data-eni-dup]');
  if (!box) {
    box = document.createElement('span');
    box.className = 'eni-err';
    box.setAttribute('data-eni-dup', '');
    holder.appendChild(box);
  }
  return box;
}

// Проверка совпадений для уже отформатированного кода. exceptId — id самой
// записи (правка не должна находить совпадение сама с собой).
export function checkEniDuplicate(input, digits, exceptId) {
  const box = dupBox(input);
  if (!digits) { if (box) { box.textContent = ''; box.className = 'eni-err'; } return null; }

  const { live, archived } = findEniMatches(digits, exceptId);
  if (!live.length && !archived) {
    if (box) { box.textContent = ''; box.className = 'eni-err'; }
    input.classList.remove('eni-dup-bad');
    return null;
  }

  const blocking = ENI_UNIQUE;
  let text;
  if (archived) {
    text = blocking ? 'Такой код ЕНИ у объекта в архиве.' : `Такой код уже есть у объекта в архиве.`;
  } else {
    text = blocking ? 'Такой код ЕНИ уже используется.'
      : `Такой код уже есть у ${live.length} ${live.length === 1 ? 'объекта' : 'объектов'}.`;
  }

  if (box) {
    box.className = 'eni-err' + (blocking ? ' eni-dup-blocking' : ' eni-dup-warn');
    box.innerHTML = '';
    box.append(document.createTextNode(text + ' '));
    if (archived || live.length) {
      const a = document.createElement('a');
      a.href = archived ? ARCHIVE_HREF : `#/oc/${live[0].typeId}/${live[0].rec.id}`;
      a.textContent = 'Показать';
      box.appendChild(a);
    }
  }
  input.classList.toggle('eni-dup-bad', blocking);

  return { blocking, live, archived };
}

// Привязка к конкретному полю. onCommit вызывается только с корректным кодом:
// писать в данные заведомо неверный ЕНИ незачем — но и терять набранное нельзя,
// поэтому в поле текст остаётся, а подсветка держится до исправления.
//
// exceptId — id записи, к которой относится поле (правка существующего
// объекта): без него собственный код находился бы как «совпадение».
export function bindEniField(input, onCommit, exceptId) {
  if (!input) return;

  input.oninput = () => {
    showEniError(input);
  };

  input.onchange = () => {
    const err = showEniError(input);
    if (err) return;
    const digits = parseEni(input.value);
    input.value = fmtEni(digits);

    const dup = checkEniDuplicate(input, digits, exceptId);
    if (dup && dup.blocking) return;

    if (onCommit) onCommit(digits);
  };
}

// Проверка перед сохранением: подсвечивает все поля ЕНИ в области и возвращает
// первое неверное — контроллеру остаётся показать сообщение и не уходить с формы.
// exceptId — id самой записи при правке (создание — undefined): без него
// собственный код формы находился бы как совпадение с самим собой.
export function firstBadEni(scope, exceptId) {
  const inputs = scope.$$('[data-head-eni], [data-land-eni], #fEni');
  for (const input of inputs) {
    if (showEniError(input)) return input;
    const dup = checkEniDuplicate(input, parseEni(input.value), exceptId);
    if (dup && dup.blocking) return input;
  }
  return null;
}
