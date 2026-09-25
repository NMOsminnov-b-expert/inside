import { esc } from '../dom.js';
import { VS } from './state.js';
import { docPageHTML, tabsBarHTML } from './doc.js';
import { photoFileAt } from './deps.js';

// Режим «Сравнение»: слева фото или второй документ, справа основной документ.
//
// Два документа рядом — пожелание пользователей (переписка, 25.09.2026): если
// открыто несколько вкладок, сравнение сразу показывает два документа —
// основной и открытый перед ним; вкладки остаются и меняют документ слева,
// вкладку можно перетащить на колонку. Практика — «разделённый редактор»
// VS Code и Visual Studio: вкладку тянут в область просмотра, и документ
// открывается рядом (граф: practice:sravnenie-dvuh-dokumentov).
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
      ? d.pages.map((p, i) => `<div class="vpage-wrap" data-cmp-dcblk="${i + 1}"><div class="vpage">${docPageHTML(d, i + 1)}</div></div>`).join('')
      : '<div class="muted" style="padding:12px">Файл не прикреплён</div>');

  // Половины можно свернуть значком-папкой (Л3.9): фото убирается влево,
  // документ вправо. Свёрнутая половина остаётся узкой полосой с тем же
  // значком — развернуть её можно там же, где свернули.
  // Левая колонка — второй документ, если он выбран.
  const leftDocRibbon = d2 ? (d2.pages.length
    ? d2.pages.map((p, i) => `<div class="vpage-wrap" data-cmp-phblk="${i + 1}"><div class="vpage">${docPageHTML(d2, i + 1)}</div></div>`).join('')
    : '<div class="muted" style="padding:12px">Файл не прикреплён</div>') : '';

  const hidden = ctx.ui.cmpHidden || null;
  const fold = (side, title) =>
    `<button class="cmp-fold" data-cmp-fold="${side}" title="${title}">${side === 'photo' ? '⯇' : '⯈'}</button>`;

  const body = `<div class="cmp ${hidden ? 'cmp-folded-' + hidden : ''}" data-cmp
    style="--cmp-photo:${ctx.ui.cmpSplit || 50}%">
    <div class="cmp-col" data-cmp-side="photo" data-cmp-drop="left">
      ${d2
    ? `<div class="cmp-h">${fold('photo', 'Свернуть документ влево')}${esc(d2.type)} <span class="cmp-nm" title="${esc(d2.name)}">${esc(d2.name)}</span>
        <span data-cmp-phnum>${d2.pages.length ? d2St.page + '/' + d2.pages.length : ''}</span>
        <button type="button" class="cmp-src" data-cmp-left-photo title="Показать фото вместо документа">Фото</button>${zoomCtl('photo')}</div>`
    : `<div class="cmp-h" title="Перетащите сюда вкладку — откроется документ для сравнения">${fold('photo', 'Свернуть фото влево')}ФОТО <span data-cmp-phnum>${pages.length ? Math.min(pSt.page, pages.length) : 0}/${pages.length}</span>${zoomCtl('photo')}</div>`}
      <div class="cmp-body" data-cmp-stage="photo"><div class="cmp-ribbon" data-cmp-ribbon="photo" style="zoom:${VS.cmpZoom.photo / 100}">${d2 ? leftDocRibbon : photoRibbon}</div></div>
    </div>
    <div class="cmp-split" data-cmp-split title="Потяните, чтобы изменить соотношение"></div>
    <div class="cmp-col" data-cmp-side="doc" data-cmp-drop="right">
      <div class="cmp-h">${fold('doc', 'Свернуть документ вправо')}${d ? `${esc(d.type)} <span class="cmp-nm" title="${esc(d.name)}">${esc(d.name)}</span>` : 'Нет документа'} <span data-cmp-dcnum>${d && d.pages.length ? dSt.page + '/' + d.pages.length : ''}</span>${d ? zoomCtl('doc') : ''}</div>
      <div class="cmp-body" data-cmp-stage="doc"><div class="cmp-ribbon" data-cmp-ribbon="doc" style="zoom:${VS.cmpZoom.doc / 100}">${docRibbon}</div></div>
    </div>
  </div>`;

  // Вкладки остаются и в сравнении: щелчок меняет документ слева.
  const tabsBar = tabsBarHTML(ctx, vctx.vd, d2 ? ctx.ui.cmpLeft : null);

  return { right, body, tabsBar };
}
