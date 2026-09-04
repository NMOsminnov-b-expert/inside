// Перевод текстовых полей участка на справочники (решение пользователя
// 04.09.2026: «пройдись по словарям и другим карточкам… согласовать»).
//
// Назначение по правоудостоверяющему документу, тип почвы и каменистость были
// свободным текстом, стали справочниками. Проблема перехода: значение, которого
// нет в справочнике, селект показать не может — он молча встанет на «Не
// выбрано», и заполненное поле окажется пустым. Причём заметить это можно только
// сравнив с прежними данными, то есть практически никогда.
//
// Поэтому старые значения переводятся здесь, до первой отрисовки:
//   * почва и каменистость — сводятся к значению справочника по написанию
//     («Чернозем» → «Чернозёмная»): это те же слова, набранные без ё и в другом
//     роде, терять их незачем;
//   * назначение — если формулировка не из справочника, ставим «Иное» и
//     сохраняем исходный текст в поле ручного ввода. Формулировки назначения
//     идут из документов, свести их к списку догадками нельзя.
//
// Вызывать ДО отрисовки (там же, где migrateUtilities и migrateImprovements),
// иначе перевод попадёт в лог правок как правка человека.
import { LAND_PURPOSE_DOC, LAND_SOIL, LAND_STONINESS } from '../../data/dictionaries.js';

// Сравнение написаний: без ё, без регистра, без хвостовых окончаний рода
// («чернозем», «черноземная», «черноземный» — одно и то же).
const norm = (v) => String(v || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/(ая|ый|ое|ой|ая|ые)$/, '')
  .trim();

function fromDict(values, value) {
  if (!value) return '';
  const n = norm(value);
  if (!n) return '';
  const exact = values.find((v) => norm(v) === n);
  if (exact) return exact;
  // Совпадение по началу слова: «каштановая почва» → «Каштановая».
  return values.find((v) => norm(v) && (n.startsWith(norm(v)) || norm(v).startsWith(n))) || '';
}

export function migrateLandDicts(oi) {
  if (!oi) return;

  if (oi.soil) {
    const hit = fromDict(LAND_SOIL, oi.soil);
    if (hit) oi.soil = hit;
    else if (LAND_SOIL.includes('Иное')) oi.soil = 'Иное';
    else oi.soil = '';
  }

  if (oi.stoniness) {
    const hit = fromDict(LAND_STONINESS, oi.stoniness);
    oi.stoniness = hit || '';
  }

  if (oi.purpose && !LAND_PURPOSE_DOC.includes(oi.purpose)) {
    const hit = fromDict(LAND_PURPOSE_DOC, oi.purpose);
    if (hit) {
      oi.purpose = hit;
    } else {
      // Формулировку не угадываем — переносим как есть в ручной ввод.
      if (!oi.purposeOther) oi.purposeOther = oi.purpose;
      oi.purpose = 'Иное';
    }
  }
}
