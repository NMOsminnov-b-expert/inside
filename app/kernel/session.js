// Текущая "сессия" макета — общая для меню ОЦ и всех 5 модулей: кто
// действует, в какой роли и за какими учреждениями закреплён. Это
// переключатель для демонстрации ролевой модели, а не настоящая
// авторизация (см. граф знаний — decision про механизм ролей). Состояние
// читается/пишется через один общий стор, поэтому смена роли/учреждений в
// реестре сразу видна внутри карточек ОЦ (например, доступ к логу действий
// — см. app/modules/residential-house/audit/access.js).
import { createStore } from './store.js';

export const ROLES = [
  { key: 'any', label: 'любая роль', hint: 'без ограничений — как у администратора' },
  { key: 'insp', label: 'осмотрщик', hint: 'осматривает объекты, уже удостоверенные по документам' },
  { key: 'appr', label: 'оценщик', hint: 'оценивает объекты после осмотра' },
  { key: 'cod', label: 'оператор ЦОД', hint: 'заполняет и удостоверяет данные до осмотра, назначает осмотрщика' },
  { key: 'gov', label: 'от учреждения', hint: 'отвечает за объект со стороны учреждения; этапы не ведёт' },
  { key: 'admin', label: 'администратор', hint: 'видит лог действий по всем объектам; остальные права — как у "любая роль"' },
];

// institutions — учреждения, за которыми закреплён текущий сотрудник (кроме
// admin — тот видит всё). Пока нет реальных учётных записей — это
// тестовый переключатель (см. ocMenu whoHTML), не настоящее назначение.
export const session = createStore({ person: 'Осминов Н.', role: 'any', institutions: [] });

export function isAdmin() {
  return session.state.role === 'admin';
}

// «Видит всё, независимо от учреждений» — администратор и роль «любая».
// Отдельным понятием, потому что этим правилом пользуются и лог действий, и
// архив документов: роль «любая роль» описана как «без ограничений», и раньше
// расходилась с проверками, которые требовали именно admin.
export function seesEverything() {
  return session.state.role === 'admin' || session.state.role === 'any';
}

// Учреждения, за которыми закреплён сотрудник (у «видит всё» — не ограничивают).
export function myInstitutions() {
  return session.state.institutions || [];
}

// Доступ к записи по учреждению: администратору и «любой роли» — всё, остальным
// — только свои учреждения.
export function canSeeInstitution(institution) {
  if (seesEverything()) return true;
  const mine = myInstitutions();
  return mine.length > 0 && mine.includes(institution);
}

export function roleLabel(key) {
  const r = ROLES.find((x) => x.key === key);
  return r ? r.label : key;
}
