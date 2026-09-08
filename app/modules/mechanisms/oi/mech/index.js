import { render } from './view.js';
import { bind } from './ctrl.js';

// Карточка ОИ «Механизмы» — СЕЙЧАС не используется этим модулем (у него нет
// объектов имущества вообще, см. records.js/manifest.js): это заготовка для
// последующей задачи, где production/civil подключат её как свой вид ОИ
// «Механизмы», тем же приёмом, каким все модули подключают земельный
// участок из land-plot (см. land-plot/oi/land/index.js и app/README.md).
export const card = {
  id: 'mech',
  init(oi) {},
  render,
  bind,
};
