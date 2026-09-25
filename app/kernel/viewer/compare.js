import { esc } from '../dom.js';
import { VS, tabKey } from './state.js';
import { docPageHTML, tabsBarHTML } from './doc.js';
import { tabs, tabLabel } from './docActions.js';
import { photoFileAt, docListFor } from './deps.js';

// Режим «Сравнение»: слева фото или второй документ, справа основной документ.
//
// Два документа рядом — пожелание пользователей (переписка, 25.09.2026): если
// открыто несколько вкладок, сравнение сразу показывает два документа —
// основной и открытый перед ним; вкладки остаются и меняют документ слева,
// вкладку можно перетащить на колонку. Практика — «разделённый редактор»
// VS Code и Visual Studio: вкладку тянут в область просмотра, и документ
// открывается рядом (граф: practice:sravnenie-dvuh-dokumentov).
//
// Управление двумя документами (замечание пользователя 25.09.2026: «не совсем
// понятно, что с чем соединяется»). Как у групп редактора VS Code и вкладок
// Rider: у колонок номера 1 и 2 и свой цвет, те же номера — на вкладках; в
// шапке каждой колонки — выбор документа; одна колонка «в фокусе» (обведена),
// щелчок по вкладке открывает документ в ней; кнопка ⇄ между колонками меняет
// документы местами.
//
// Раньше здесь показывалась РОВНО ОДНА страница документа и одно фото, листались
// они только кнопками, а зум был общий на обе колонки. Теперь каждая колонка —
// такая же прокручиваемая лента, как в обычном режиме просмотра (колесо листает
// и фото, и документ), и у каждой колонки СВОЙ зум: сравнивают обычно мелкую
// деталь на фото с крупным планом в документе, общий зум для этого бесполезен.
export function renderCompareMode(ctx, vctx) {
  const { d, dSt, d2, d2St, pages, groups } = vctx;
  const pSt = vctx.pSt || { page: 1, rot: 0 };

  // Заголовок и закрытие — в общей панели просмотрщика (shell.js).
  const right = `<span class="vtitle">${d2 ? 'Два документа рядом' : 'Фото и документ рядом'}</span>`;

  // Зум на колонку. cmpZoom живёт в VS рядом с остальным состоянием
  // просмотрщика, поэтому переживает перерисовку экрана.
  const zoomCtl = (which) => `<div class="tool-group cmp-zoom">
    <button class="tool-btn" data-cmp-zoom="${which}|-">−</button>
    <span class="zoom-label" data-cmp-zoomlabel="${which}">${VS.cmpZoom[which]}%</span>
    <button class="tool-btn" data-cmp-zoom="${which}|+">+</button>
  </div>`;

  let gi = 0;
  const photoRibbon = groups.map((g) => {
    const inner = g.items.map((it) => {
      gi++;
      const f = photoFileAt(vctx.oi, it.cat, it.i);
      return `<div class="vpage-wrap" data-cmp-phblk="${gi}"><div class="vpage photo-page">
        ${f && f.dataUrl ? `<img class="vimg" src="${f.dataUrl}" alt="${esc(f.name)}">`
            : `<div class="photo-fill">${esc(it.cat)} · фото ${it.i + 1}</div>`}</div></div>`;
    }).join('');
    return `<div class="vgroup-h">${esc(g.cat)} · ${g.items.length}</div>${inner}`;
  }).join('') || '<div class="vpage photo-page"><div class="photo-fill">Фото не загружены</div></div>';

  // Документ без страниц — значит без файла: раньше на его месте рисовались
  // страницы-заглушки, теперь пишем как есть.
  const docRibbon = !d
    ? '<div class="muted" style="padding:12px">Откройте документ во вкладке «Документы»</div>'
    : (d.pages.length
      ? d.pages.map((p, i) => `<div class="vpage-wrap" data-cmp-dcblk="${i + 1}"><div class="vpage" data-cmp-inner style="transform:rotate(${dSt.rot || 0}deg)">${docPageHTML(d, i + 1)}</div></div>`).join('')
      : '<div class="muted" style="padding:12px">Файл не прикреплён</div>');

  // Половины можно свернуть значком-папкой (Л3.9): фото убирается влево,
  // документ вправо. Свёрнутая половина остаётся узкой полосой с тем же
  // значком — развернуть её можно там же, где свернули.
  // Левая колонка — второй документ, если он выбран.
  const leftDocRibbon = d2 ? (d2.pages.length
    ? d2.pages.map((p, i) => `<div class="vpage-wrap" data-cmp-phblk="${i + 1}"><div class="vpage" data-cmp-inner style="transform:rotate(${d2St.rot || 0}deg)">${docPageHTML(d2, i + 1)}</div></div>`).join('')
    : '<div class="muted" style="padding:12px">Файл не прикреплён</div>') : '';

  // Выбор документа в шапке колонки: открытые вкладки, у левой ещё «Фото».
  const left = d2 ? ctx.ui.cmpLeft : null;
  const vd = vctx.vd;
  const pick = (side) => {
    const cur = side === 'left' ? (left ? tabKey(left.scope, left.id) : 'photo') : (vd ? tabKey(vd.scope, vd.id) : '');
    const opts = tabs(ctx).map((x) => {
      const doc = docListFor(ctx, x.sc).find((t) => t.id === x.id);
      if (!doc) return '';
      const k = tabKey(x.sc, x.id);
      return `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(tabLabel(x.sc, doc))} · ${esc(doc.name)}</option>`;
    }).join('');
    const photo = side === 'left' ? `<option value="photo" ${cur === 'photo' ? 'selected' : ''}>Фото</option>` : '';
    return `<select class="cmp-pick" data-cmp-pick="${side}" aria-label="Документ в колонке ${side === 'left' ? 1 : 2}"
      title="Что показать в колонке ${side === 'left' ? 1 : 2}">${photo}${opts}</select>`;
  };
  const chip = (n) => `<span class="cmp-chip c${n}" aria-hidden="true">${n}</span>`;
  const focus = ctx.ui.cmpFocus === 'right' ? 'right' : 'left';

  const hidden = ctx.ui.cmpHidden || null;
  const fold = (side, title) =>
    `<button class="cmp-fold" data-cmp-fold="${side}" title="${title}">${side === 'photo' ? '⯇' : '⯈'}</button>`;

  const body = `<div class="cmp ${hidden ? 'cmp-folded-' + hidden : ''}" data-cmp
    style="--cmp-photo:${ctx.ui.cmpSplit || 50}%">
    <div class="cmp-col c1 ${focus === 'left' ? 'cmp-focus' : ''}" data-cmp-side="photo" data-cmp-drop="left">
      <div class="cmp-h">${fold('photo', 'Свернуть колонку 1 влево')}${chip(1)}${pick('left')}
        <span data-cmp-phnum>${d2 ? (d2.pages.length ? d2St.page + '/' + d2.pages.length : '') : `${pages.length ? Math.min(pSt.page, pages.length) : 0}/${pages.length}`}</span>${zoomCtl('photo')}</div>
      <div class="cmp-body" data-cmp-stage="photo"><div class="cmp-ribbon" data-cmp-ribbon="photo" style="zoom:${VS.cmpZoom.photo / 100}">${d2 ? leftDocRibbon : photoRibbon}</div></div>
    </div>
    <div class="cmp-split" data-cmp-split title="Потяните, чтобы изменить соотношение">${d2
    ? '<button type="button" class="cmp-swap" data-cmp-swap title="Поменять документы местами" aria-label="Поменять документы местами">⇄</button>' : ''}</div>
    <div class="cmp-col c2 ${focus === 'right' ? 'cmp-focus' : ''}" data-cmp-side="doc" data-cmp-drop="right">
      <div class="cmp-h">${fold('doc', 'Свернуть колонку 2 вправо')}${chip(2)}${d ? pick('right') : 'Нет документа'} <span data-cmp-dcnum>${d && d.pages.length ? dSt.page + '/' + d.pages.length : ''}</span>${d ? zoomCtl('doc') : ''}</div>
      <div class="cmp-body" data-cmp-stage="doc"><div class="cmp-ribbon" data-cmp-ribbon="doc" style="zoom:${VS.cmpZoom.doc / 100}">${docRibbon}</div></div>
    </div>
  </div>`;

  // Вкладки остаются и в сравнении: номер на вкладке — колонка, где документ
  // открыт; щелчок открывает документ в колонке в фокусе.
  const tabsBar = tabsBarHTML(ctx, vctx.vd, d2 ? ctx.ui.cmpLeft : null, { compare: true, focus });

  return { right, body, tabsBar };
}
