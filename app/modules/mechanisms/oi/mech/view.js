import { renderMechList } from '../../parts/mechConstructor.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';

// Карточка ОИ «Механизмы и оборудование» — тонкая обёртка вокруг общего
// конструктора (parts/mechConstructor.js), адаптированная под контракт вида
// ОИ (render(ctx, oi), см. app/README.md). ОИ здесь — контейнер списка
// механизмов (oi.mechanisms), тем же renderMechList, что и у карточки ОЦ
// этого модуля (card/ocForm.view.js) — внутри одного ОИ можно завести сразу
// несколько единиц техники, а не только одну (задача пользователя).
//
// splitWrap/viewerHTML — импортированы из ЭТОГО (mechanisms) модуля, не из
// production/civil, где карточка встраивается как вид ОИ: тот же приём, что
// и у карточки земельного участка (см. land-plot/oi/land/view.js) — карточка
// сама отвечает за свой просмотрщик (документы записи-владельца + фото
// механизмов через ctx.ui.viewerPhotoTarget, см. parts/mechConstructor.js:
// openPhoto), вызывающий модуль об этом не знает.
export function render(ctx, oi) {
  oi.mechanisms = (oi.mechanisms && oi.mechanisms.length) ? oi.mechanisms : [];
  const body = `<div class="card t-teal">
    <div class="card-head"><span class="card-idx">01</span><h3>Механизмы</h3></div>
    <div class="card-pad">${renderMechList(oi.mechanisms)}</div>
  </div>`;
  return splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body);
}
