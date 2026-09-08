// Карточка ОИ «Механизм» — импортируется из mechanisms (см. app/README.md и
// граф знаний: решение заменить старую движимую карточку card:'movable',
// kind:'МЕХ' новой, общей для всех модулей). Тот же приём, что и у земельного
// участка (см. ../land/index.js).
import { render } from '../../../mechanisms/oi/mech/view.js';
import { bind } from '../../../mechanisms/oi/mech/ctrl.js';

export const card = {
  id: 'mech',
  init() {},
  render,
  bind,
};
