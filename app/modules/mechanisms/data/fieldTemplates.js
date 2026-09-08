// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: шаблоны полей и история значений сейчас живут в памяти
// вкладки и обнуляются при перезагрузке. На сервере это отдельное хранилище
// (таблица «имя механизма → список подписей полей», таблица истории значений
// по подписи), общее на всех пользователей, а не per-tab; нужно решить, как
// версионировать шаблон при переименовании/удалении поля у уже существующих
// записей.
//
// Конструктор полей карточки «Механизмы и оборудование» (card/ocForm и
// oi/mech) не может использовать кернел-движок словарей (kernel/dicts.js):
// тот строит перечни исключительно из статических data/dictExport.js
// каждого модуля, а подпись поля здесь придумывает пользователь в рантайме —
// привязать к ней справочник заранее нечем (см. граф знаний, decision про
// локальный, не kernel, механизм словарей конструктора).
//
// templates:    { [name]: string[] }   — какие подписи полей заводили под этим названием
// valueHistory: { [label]: string[] }  — какие значения когда-либо вписывали в поле с такой подписью
const templates = {};
const valueHistory = {};

// Список подписей для названия механизма, или [] если название встречается впервые.
export function getTemplate(name) {
  return templates[name] ? templates[name].slice() : [];
}

// Доливает новые подписи в шаблон названия — без дублей, с сохранением порядка.
export function rememberTemplate(name, labels) {
  if (!name) return;
  const list = templates[name] || (templates[name] = []);
  (labels || []).forEach((label) => {
    if (label && !list.includes(label)) list.push(label);
  });
}

// Все названия, когда-либо использованные — для даталиста поля «Название».
export function allNames() {
  return Object.keys(templates);
}

// История значений по подписи поля — для даталиста значения.
export function rememberValue(label, value) {
  if (!label || !value) return;
  const list = valueHistory[label] || (valueHistory[label] = []);
  if (!list.includes(value)) list.push(value);
}

export function valuesFor(label) {
  return valueHistory[label] ? valueHistory[label].slice() : [];
}
