import { bindColumnResize, bindColumnReorder, normalizeOrder, applyFit, orderedColumns } from '../../../kernel/columns.js';
import { OI_COLUMNS, OI_COLUMNS_DEFAULT } from './oiTable.view.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { DOC_TYPES } from '../data/dictionaries.js';
import { oiTypeByLabel } from '../data/rules.js';
import { nextLetter, nextId, nextEni, removeRecord } from '../data/store.js';
import { openDocViewer, openPhotoInPlace, VS } from '../parts/viewer/state.js';
import { photoPages } from '../parts/photos/model.js';
import { bindPhotoExplorer } from '../parts/photos/explorer.js';
import { createLandOi } from '../oi/land/model.js';

function createOi(ctx, type) {
  const rec = ctx.rec;

  if (type.card === 'land') {
    return createLandOi(rec, { nextId, nextEni, multiple: true });
  }

  const letter = nextLetter(rec);

  const oi = {
    id: nextId('oi'),
    card: type.card,
    letter,
    name: type.label,
    status: 'Основное',
    origin: 'manual',
    residential: type.label === 'Жилой дом' || type.card === 'apartment',
    resCat: '',
    eni: nextEni(rec, rec.eni),
    year: '',
    flags: { entered: false, matched: false },
    areas: { tp: '', pud: '', fact: '', build: '' },
    floors: 1,
    floorList: [],
    heights: { ext: '', int: '' },
    buildType: 'Отдельностоящее',
    struct: {
      foundation: 'Не указано',
      wallsExt: 'Не указано',
      ceilings: 'Не указано',
      roof: 'Не указано',
      floors: 'Не указано',
      windows: 'Не указано',
      doors: 'Не указано',
    },
    structOther: {},
    heating: [],
    heatingOther: '',
    comment: '',
    catClass: 'Гражданское здание',
    dis: false,
    docs: [],
    photos: {},
    notes: [],
  };

  if (type.card === 'apartment') oi.apartment = null;

  return oi;
}

export function bindOcCard(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  // --- Вкладки ------------------------------------------------------------
  s.$$('[data-tab]').forEach((b) => b.onclick = () => {
    const tab = b.dataset.tab;

    if (tab === 'docs') {
      ctx.ui.viewer = { mode: 'doc' };
      const docs = rec.docs || [];
      if (!ctx.ui.viewerDoc && docs.length) ctx.ui.viewerDoc = { scope: 'oc', id: docs[0].id };
    } else if (tab === 'photo') {
      if (ctx.ui.viewer && ctx.ui.viewer.mode !== 'photo') ctx.ui.viewer = null;
    } else {
      ctx.ui.viewer = null;
    }

    ctx.navigate({ rest: [], query: tab === 'general' ? {} : { tab } });
  });

  // --- Добавление ОИ ------------------------------------------------------
  s.$$('[data-add-oi]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    s.$$('.dd').forEach((d) => d.classList.remove('open'));

    const type = oiTypeByLabel(b.dataset.addOi);
    if (!type) { ctx.toast('Для текущего типа ОЦ этот вид ОИ недоступен', 'warn'); return; }


    // Лимит «один участок на объект» снят: участков может быть несколько
    // (Л2.2, Л4.6). Новая литера привязывается к участку — при единственном
    // участке автоматически, иначе попадёт в группу «Без участка», откуда её
    // можно перетащить (см. дерево в card/oiTable.view.js).
    // Привязка литеры к участку НЕ проставляется автоматически — никогда и ни
    // при одном участке. Относится ли литера к этому участку, из данных не
    // выводится: это факт с местности, его знает только оценщик. Любая новая
    // литера появляется в группе «Без участка», оттуда её переносит человек
    // перетаскиванием с подтверждением (решение пользователя 2026-08-27).
    const oi = createOi(ctx, type);
    rec.oi.push(oi);

    ctx.ui.letterEdit = false;
    ctx.ui.viewer = { mode: 'doc' };
    ctx.ui.viewerDoc = null;

    ctx.navigate({ rest: ['oi', oi.id] });
    ctx.toast(oi.card === 'land' ? 'Участок добавлен' : 'Литера ' + oi.letter + ' создана', 'ok');
  });

  // --- Шапка ОЦ -----------------------------------------------------------
  const be = s.$('#btnEditOc');
  if (be) be.onclick = () => {
    ctx.ui.viewer = { mode: 'doc' };
    ctx.ui.viewerDoc = null;
    ctx.navigate({ rest: ['form'] });
  };

  const bd = s.$('#btnDelOc');
  if (bd) bd.onclick = async () => {
    const ok = await ctx.host.confirm({
      title: 'Удаление объекта оценки',
      text: `Удалить «${rec.address}» вместе с ${rec.oi.length} ОИ? Действие нельзя отменить.`,
      okLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    removeRecord(rec.id);
    ctx.host.toMenu();
    ctx.toast('Объект оценки удалён');
  };

  // --- Стороны ------------------------------------------------------------
  s.$$('[data-resp]').forEach((sel) => sel.onchange = () => {
    rec.resp[sel.dataset.resp] = sel.value;
    ctx.toast('Ответственный обновлён', 'ok');
  });

  s.$$('[data-owner-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    rec.owners.splice(+x.dataset.ownerRm, 1);
    ctx.render();
  });

  s.$$('[data-user-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    rec.users.splice(+x.dataset.userRm, 1);
    ctx.render();
  });

  s.$$('[data-add-party]').forEach((b) => b.onclick = async () => {
    const isOwner = b.dataset.addParty === 'owner';
    const who = isOwner ? 'Собственник' : 'Пользователь';
    const v = await ctx.host.prompt({ title: who, label: 'ФИО или организация', placeholder: 'Наименование' });
    if (!v) return;
    (isOwner ? rec.owners : rec.users).push(v);
    ctx.render();
    ctx.toast(who + ' добавлен', 'ok');
  });

  // --- Документы ОЦ -------------------------------------------------------
  s.$$('[data-attach]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const t = b.dataset.attach;
    const name = await ctx.host.prompt({ title: 'Прикрепить документ', label: 'Наименование документа (' + t + ')', placeholder: t });
    if (!name) return;

    rec.docs = rec.docs || [];
    rec.docs.push({ id: nextId('d'), type: t, name, date: ctx.today, pages: null });

    ctx.render();
    ctx.toast('Документ прикреплён: ' + t, 'ok');
  });

  s.$$('[data-doc-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();

    const id = b.dataset.docDel;
    const i = (rec.docs || []).findIndex((d) => d.id === id);
    if (i >= 0) rec.docs.splice(i, 1);

    VS.openTabs.oc = (VS.openTabs.oc || []).filter((x) => x !== id);

    if (ctx.ui.viewerDoc && ctx.ui.viewerDoc.id === id) {
      ctx.ui.viewerDoc = VS.openTabs.oc.length
        ? { scope: 'oc', id: VS.openTabs.oc[VS.openTabs.oc.length - 1] }
        : null;
      if (!ctx.ui.viewerDoc) ctx.ui.viewer = null;
    }

    ctx.render();
    ctx.toast('Документ откреплён');
  });

  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });

  // --- Дерево «участок → литеры» ------------------------------------------
  //
  // Перенос литеры между узлами перетаскиванием (Л2.1). Цель переноса — узел
  // дерева (`[data-oi-drop]`): участок либо служебная группа «Без участка»
  // (пустой id = снять привязку). Перенос подтверждается модалкой: это правка
  // структуры объекта, случайным движением мыши её делать нельзя.
  s.$$('[data-drag-oi]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', row.dataset.dragOi);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      s.$$('[data-oi-drop]').forEach((n) => n.classList.remove('drop-target'));
    });
  });

  s.$$('[data-oi-drop]').forEach((node) => {
    const targetId = node.dataset.oiDrop;

    node.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      node.classList.add('drop-target');
    });
    node.addEventListener('dragleave', (e) => {
      // Уход на вложенный элемент — не уход из узла.
      if (!node.contains(e.relatedTarget)) node.classList.remove('drop-target');
    });

    node.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('drop-target');

      const oiId = e.dataTransfer.getData('text/plain');
      const oi = rec.oi.find((o) => o.id === oiId);
      if (!oi) return;
      if ((oi.landId || '') === targetId) return;   // уже здесь

      const land = targetId ? rec.oi.find((o) => o.id === targetId) : null;
      const label = oi.letter ? 'Литеру ' + oi.letter : 'ОИ «' + oi.name + '»';
      const to = land
        ? `участок «${land.name}» (${fmtEni(land.eni)})`
        : 'группу «Без участка»';

      const ok = await ctx.host.confirm({
        title: 'Перенос литеры',
        text: `Перенести ${label} в ${to}?`,
        okLabel: 'Перенести',
      });
      if (!ok) return;

      oi.landId = targetId || null;
      ctx.render();
      ctx.toast(land ? 'Перенесено в участок' : 'Привязка к участку снята', 'ok');
    });
  });

  // --- Ячейка «Фото» в перечне: одно окно вместо ряда миниатюр -------------
  s.$$('[data-photo-pop]').forEach((btn) => btn.onclick = (e) => {
    e.stopPropagation();
    const id = btn.dataset.photoPop;
    ctx.ui.photoPop = ctx.ui.photoPop === id ? null : id;
    ctx.render();
  });

  const popClose = s.$('[data-photo-pop-close]');
  if (popClose) popClose.onclick = (e) => {
    e.stopPropagation();
    ctx.ui.photoPop = null;
    ctx.render();
  };

  // Окно ставим под нажатую ячейку, а не в угол карточки: закреплённое справа
  // оно накрывало правые столбцы перечня вместе с самой ячейкой, по которой
  // кликнули. Считаем координаты в JS — сколько строк в таблице и где именно
  // ячейка, разметка знать не может. Если окно не влезает по низу, поднимаем
  // его над ячейкой.
  const popBox = s.$('[data-photo-pop-box]');
  if (popBox) {
    const cell = s.$(`[data-photo-pop="${ctx.ui.photoPop}"]`);
    const wrap = popBox.parentElement;
    if (cell && wrap) {
      const c = cell.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const box = popBox.getBoundingClientRect();
      let left = c.right - w.left - box.width;
      let top = c.bottom - w.top + 6;
      // Не вылезать за левый край карточки и за нижний край окна браузера.
      left = Math.max(8, left);
      if (c.bottom + box.height + 12 > window.innerHeight) {
        top = Math.max(8, c.top - w.top - box.height - 6);
      }
      popBox.style.right = 'auto';
      popBox.style.left = left + 'px';
      popBox.style.top = top + 'px';
    }
  }

  if (ctx.ui.photoPop) {
    s.onDocument('click', (e) => {
      if (!e.target.closest('[data-photo-pop-box]') && !e.target.closest('[data-photo-pop]')) {
        ctx.ui.photoPop = null;
        ctx.render();
      }
    });
  }

  // --- Столбцы перечня ОИ --------------------------------------------------
  // Тот же механизм, что в реестре (kernel/columns.js): перегородка меняет
  // ширины двух соседних ячеек, порядок — перетаскиванием заголовка. Ширины
  // живут переменными на контейнере дерева, поэтому таблицы всех узлов всегда
  // одной раскладки, а при перетаскивании перерисовки не нужно.
  const oiOrder = ctx.ui.oiCols || OI_COLUMNS_DEFAULT;

  // Сумма ширин по умолчанию больше, чем ширина таблицы в карточке (панель
  // справа уже реестра), поэтому раскладку надо подогнать: иначе «резиновому»
  // столбцу «Наименование» не остаётся места, он схлопывается в ноль, и
  // перегородке нечего у него забрать — растягивание не работает вовсе.
  const oiBox = s.$('[data-oi-cols-box]');
  if (oiBox) Object.assign(ctx.ui.oiColWidths, applyFit(oiBox, orderedColumns(OI_COLUMNS, oiOrder), ctx.ui.oiColWidths));

  bindColumnResize(s, {
    rootSel: '[data-oi-cols-box]',
    cols: OI_COLUMNS,
    widths: ctx.ui.oiColWidths,
    onCommit(patch) { Object.assign(ctx.ui.oiColWidths, patch); },
  });

  bindColumnReorder(s, {
    headSel: '[data-oi-cols-box] thead',
    order: oiOrder,
    onCommit(order) {
      ctx.ui.oiCols = normalizeOrder(OI_COLUMNS, order, OI_COLUMNS_DEFAULT);
      ctx.render();
    },
  });

  // --- Перечень ОИ --------------------------------------------------------
  s.$$('tr[data-open-oi]').forEach((tr) => tr.onclick = (e) => {
    // Третьего уровня в дереве нет: параметры смотрятся в карточке ОИ, поэтому
    // раскрытия строки шевроном больше не существует.
    if (e.target.closest('button') || e.target.closest('.ph-cell') || e.target.closest('.drag-grip')) return;

    const oi = rec.oi.find((o) => o.id === tr.dataset.openOi);
    ctx.ui.letterEdit = false;
    ctx.ui.viewer = { mode: (oi && oi.photos && Object.keys(oi.photos).length) ? 'photo' : 'doc' };
    ctx.ui.viewerDoc = null;
    ctx.navigate({ rest: ['oi', tr.dataset.openOi] });
  });

  // Кнопка «Открыть» в шапке узла-участка: она не строка таблицы, поэтому
  // обработчик строк её не ловит (и не должен — строка ещё и отсекает клики
  // по кнопкам). Вешаем отдельно, поведение то же.
  s.$$('button[data-open-oi]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const oi = rec.oi.find((o) => o.id === b.dataset.openOi);
    ctx.ui.letterEdit = false;
    ctx.ui.viewer = { mode: (oi && oi.photos && Object.keys(oi.photos).length) ? 'photo' : 'doc' };
    ctx.ui.viewerDoc = null;
    ctx.navigate({ rest: ['oi', b.dataset.openOi] });
  });

  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  // Фото в аккордеоне перечня и мини-превью в строках.
  s.$$('[data-add-photo]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const oi = rec.oi.find((o) => o.id === b.dataset.photoOi);
    if (!oi) return;
    const cat = b.dataset.addPhoto;
    oi.photos = oi.photos || {};
    oi.photos[cat] = (oi.photos[cat] || 0) + 1;
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено', 'ok');
  });

  s.$$('[data-open-photo]').forEach((p) => p.onclick = (e) => {
    e.stopPropagation();
    const [oiId, rest] = p.dataset.openPhoto.split('|');
    const [cat, i] = rest.split(':');
    const oi = rec.oi.find((o) => o.id === oiId);
    if (!oi) return;
    const idx = photoPages(oi).findIndex((x) => x.cat === cat && x.i === +i) + 1;
    openPhotoInPlace(ctx, oiId, idx);
  });

  bindPhotoExplorer(ctx);
}
