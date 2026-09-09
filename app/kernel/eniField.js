// Поле кода ЕНИ — ввод, маска и проверка длины в одном месте.
//
// Требование пользователя: «Формат ЕНИ другим быть не может. Если он другой —
// это ошибка». Допустимых длин три — 13, 15 и 18 цифр (уточнение 04.09.2026),
// см. ENI_LENGTHS. Сама проверка (eniError) давно лежала в kernel/fmt.js,
// но её никто не вызывал: во всех формах стоял только parseEni, который
// вычищает нецифры и записывает что угодно. Код из пяти цифр сохранялся молча
// и доезжал до реестра и до фильтра областей (он берёт первую цифру).
//
// Почему отдельный модуль, а не строчка в каждом контроллере: полей ЕНИ в
// проекте шесть видов (две формы ОЦ, шапки карточек литеры, квартиры и участка),
// и правило должно быть одно на всех — иначе разъедется, как уже разъехались
// значки состояния.
import { fmtEni, eniError, ENI_LENGTHS } from './fmt.js';
import { foldEniList } from './eniFold.js';

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

// Хвост заменяет БЛОК между тире, а не столько же последних цифр: «это может
// быть блок из четырёх последних, двух последних или трёх последних цифр —
// блок, разделённый тирешками» (пользователь 09.09.2026).
//
// Ищем справа налево первую группу той же длины, что набранный хвост, и меняем
// её; всё, что правее, отбрасываем — это уже другой объект. Так «…-3510-11» с
// хвостом «12» даёт «…-3510-12», а с хвостом «3599» — «…-3599», а не смесь из
// обеих записей.
function replaceTail(base, tail) {
  const groups = String(fmtEni(base) || '').split('-').filter(Boolean);
  const last = groups[groups.length - 1] || '';

  // 1. Длина совпала с последним блоком — это он и есть: «…-3510» + «3511».
  if (last.length === tail.length) return groups.slice(0, -1).join('') + tail;

  // 2. Не совпала, но приписывание даёт код допустимой длины — значит набрали
  //    ПРОДОЛЖЕНИЕ, следующий блок: «…-3510» + «11» → «…-3510-11». Ровно второй
  //    случай из примеров пользователя.
  const appended = groups.join('') + tail;
  if (ENI_LENGTHS.includes(appended.length)) return appended;

  // 3. Ни то ни другое — меняем самый правый блок такой же длины: набрали блок
  //    из середины кода, а не его хвост.
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].length === tail.length) return groups.slice(0, i).join('') + tail;
  }
  return appended;
}

// Полные коды из содержимого поля: сокращённые хвосты раскрываются по первому
// коду — «7-10-06-0053-0016,0017» это два кода, у второго отличается последняя
// группа.
export function eniCodesOf(value) {
  const parts = String(value ?? '').split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean);
  if (!parts.length) return [];

  const out = [parts[0]];
  parts.slice(1).forEach((p) => {
    if (p.length > 4) { out.push(p); return; }
    out.push(replaceTail(out[0], p));
  });
  return out;
}

// Показать/снять ошибку. Возвращает текст ошибки ('' — всё в порядке).
export function showEniError(input) {
  // Каждый код проверяется отдельно: склеенные цифры двух кодов дают длину,
  // которой не бывает, и поле краснело бы на верном вводе.
  const err = eniCodesOf(input.value).map(eniError).find(Boolean) || '';
  const box = errorBox(input);
  if (box) box.textContent = err;
  input.classList.toggle('eni-bad', !!err);
  return err;
}

// Текст поля по маске: тире расставляет интерфейс, человек печатает только
// цифры (требование пользователя 09.09.2026 — «сам человек тирешки не
// печатает»).
//
// Кодов в поле может быть несколько, через запятую. Сокращённая запись
// «7-10-06-0053-0016,0017» означает, что у второго кода отличается только
// последняя группа: её и печатают. Отличать её от нового полного кода можно по
// длине — группы маски короче пяти цифр, поэтому сегмент из пяти и более цифр
// это уже начало следующего полного кода.
export function formatEniText(raw) {
  const parts = String(raw ?? '').split(',');
  const out = parts.map((part, i) => {
    const digits = part.replace(/\D/g, '');
    if (!digits) return '';
    // Первый сегмент всегда полный код; дальше короткий — это хвост.
    return (i === 0 || digits.length > 4) ? fmtEni(digits) : digits;
  });

  // Пустой хвост в конце сохраняем: человек только что поставил запятую и
  // продолжает набирать.
  while (out.length > 1 && out[out.length - 1] === '' && parts[parts.length - 1] !== '') {
    out.pop();
  }
  return out.join(', ').replace(/,\s*$/, parts[parts.length - 1] === '' ? ', ' : '');
}

// Куда вернуть курсор: считаем не символы, а то, что человек НАБРАЛ, — цифры и
// запятые. Тире и пробелы ставит маска, и по ним считать нельзя.
//
// Запятую обязательно учитываем наравне с цифрами: если считать одни цифры,
// курсор после набранной запятой встаёт ПЕРЕД ней, и следующие цифры уходят в
// предыдущий код — «0016,0017» превращалось в один код «00160017».
const TYPED = /[\d,]/;

function caretAfterTyped(text, count) {
  if (!count) return text.length;

  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (TYPED.test(text[i])) seen++;
    if (seen >= count) {
      // Пробел после запятой ставит маска — курсор должен стоять за ним.
      let pos = i + 1;
      while (pos < text.length && text[pos] === ' ') pos++;
      return pos;
    }
  }
  return text.length;
}

// Привязка к конкретному полю. onCommit вызывается только с корректным кодом:
// писать в данные заведомо неверный ЕНИ незачем — но и терять набранное нельзя,
// поэтому в поле текст остаётся, а подсветка держится до исправления.
export function bindEniField(input, onCommit) {
  if (!input) return;

  input.oninput = () => {
    // Маска ставится ПО ХОДУ ввода, а не по потере фокуса: раньше поле до
    // самого конца показывало сплошную строку цифр, и проверить набранное по
    // документу было нельзя — глаз считает код группами.
    const caret = input.selectionStart || 0;
    const typedBefore = (input.value.slice(0, caret).match(/[\d,]/g) || []).length;

    const next = formatEniText(input.value);
    if (next !== input.value) {
      input.value = next;
      const pos = caretAfterTyped(next, typedBefore);
      input.setSelectionRange(pos, pos);
    }

    showEniError(input);
  };

  input.onchange = () => {
    const err = showEniError(input);
    if (err) return;

    // Уходя с поля, показываем коды СВЁРНУТО: общее начало называется один раз,
    // различающиеся хвосты идут в скобках — «1-47-56-1681-(3510, 3511)»
    // (требование пользователя 09.09.2026 про отображение). Набирают при этом
    // по-прежнему цифрами и запятыми.
    //
    // Свёрнутый вид разбирается обратно тем же eniCodesOf: скобки и тире для
    // него нецифры, а хвост в скобках читается как хвост после запятой —
    // поэтому поле можно править дальше, не разворачивая руками.
    const codes = eniCodesOf(input.value);
    input.value = foldEniList(codes);

    // onCommit получает первый код: остальные пока хранить некуда — у записи
    // одно поле eni (вопрос вынесен пользователю 09.09.2026).
    if (onCommit) onCommit(codes[0] || '');
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
