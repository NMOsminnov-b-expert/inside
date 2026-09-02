import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../parts/docs/model.js';
import { bindDocsColumns } from '../parts/docs/table.js';
import { bindColumnResize, bindColumnReorder, normalizeOrder, applyFit, orderedColumns } from '../../../kernel/columns.js';
import { OI_COLUMNS, OI_COLUMNS_DEFAULT } from './oiTable.view.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { bindAuditTab } from '../audit/ctrl.js';
import { DOC_TYPES } from '../data/dictionaries.js';
import { oiTypeByLabel } from '../data/rules.js';
import { nextLetter, nextId, nextEni, removeRecord, nextDocId } from '../data/store.js';
import { openDocViewer, openPhotoInPlace, VS } from '../parts/viewer/state.js';
import { photoPages, addPhotoFile } from '../parts/photos/model.js';
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

  if (ctx.tab === 'audit') bindAuditTab(ctx);

  // --- Вкладки ------------------------------------------------------------
  s.$$('[data-tab]').forEach((b) => b.onclick = () => {
    const tab = b.dataset.tab;

    // Закрыт крестиком — вкладки его не возвращают: открыть можно только
    // закладкой «Документы» (как блок заметок).
    if (ctx.ui.viewerClosed) {
      ctx.ui.viewer = null;
      ctx.navigate({ rest: [], query: tab === 'general' ? {} : { tab } });
      return;
    }

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
  // Что именно тащим, помним отдельно от dataTransfer: браузер в некоторых
  // случаях отдаёт его пустым при drop, и перенос молча не срабатывал.
  // Хранится в ui, а не в локальной переменной: документный слушатель ниже
  // вешается ОДИН раз, а контроллер перепривязывается на каждой отрисовке —
  // локальную переменную он бы видел устаревшей.

  s.$$('[data-drag-oi]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      ctx.ui.dragOiId = row.dataset.dragOi;
      e.dataTransfer.setData('text/plain', row.dataset.dragOi);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      ctx.ui.dragOiId = null;
      row.classList.remove('dragging');
      s.$$('[data-oi-drop]').forEach((n) => n.classList.remove('drop-target'));
      hideHint();
    });
  });

  // Куда попал бросок. Цель — только тот узел, НАД КОТОРЫМ курсор находится
  // на самом деле; всё остальное считается откреплением. Раньше промежутки
  // между узлами отходили ближайшему участку сверху, и открепить литеру можно
  // было, лишь попав в полосу под последним узлом — она бывает высотой в
  // десяток пикселей. Теперь «мимо участка» значит «открепить», где бы это
  // «мимо» ни случилось.
  const nodeAt = (y) => {
    const list = s.$$('[data-oi-drop]');
    let hit = null;
    list.forEach((n) => {
      const r = n.getBoundingClientRect();
      // Допуск в 2px — на границу узла: попасть точно в пиксель края нельзя,
      // а вот промахнуться мимо участка на пару пикселей легко.
      if (y >= r.top - 2 && y <= r.bottom + 2) hit = n;
    });
    return hit;
  };

  // Подсказка на время перетаскивания: что случится, если отпустить сейчас.
  // Без неё правило «бросай куда угодно — открепится» невидимо: человек не
  // знает, попал он в участок или уже мимо.
  const hintBox = () => {
    let el = document.querySelector('[data-oi-drag-hint]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'oi-drag-hint';
      el.setAttribute('data-oi-drag-hint', '');
      document.body.appendChild(el);
    }
    return el;
  };

  const showHint = (node) => {
    const oi = ctx.rec.oi.find((o) => o.id === ctx.ui.dragOiId);
    if (!oi) return;
    const el = hintBox();

    if (node) {
      const id = node.dataset.oiDrop;
      const land = id ? ctx.rec.oi.find((o) => o.id === id) : null;
      el.textContent = land
        ? `Отпустите — литера привяжется к участку «${land.name}»`
        : 'Отпустите — литера останется без участка';
      el.classList.toggle('unlink', !land);
    } else {
      el.textContent = oi.landId
        ? 'Отпустите здесь — литера открепится от участка'
        : 'Литера и так без участка — перетащите её на участок, чтобы привязать';
      el.classList.toggle('unlink', !!oi.landId);
    }
    el.classList.add('on');
  };

  const hideHint = () => {
    const el = document.querySelector('[data-oi-drag-hint]');
    if (el) el.classList.remove('on');
  };

  const applyDrop = async (targetId, isUnlink) => {
    const oi = ctx.rec.oi.find((o) => o.id === ctx.ui.dragOiId);
    if (!oi) return;
    if (!isUnlink && (oi.landId || '') === targetId) return;
    if (isUnlink && !oi.landId) return;

    const label = oi.letter ? 'Литеру ' + oi.letter : 'ОИ «' + oi.name + '»';
    const land = targetId ? rec.oi.find((o) => o.id === targetId) : null;

    const ok = await ctx.host.confirm(isUnlink
      ? { title: 'Открепить литеру', okLabel: 'Открепить',
          text: `Открепить ${label} от участка? Она уйдёт в группу «Без участка».` }
      : { title: 'Перенос литеры', okLabel: 'Перенести',
          text: `Перенести ${label} в ${land ? `участок «${land.name}» (${fmtEni(land.eni)})` : 'группу «Без участка»'}?` });
    if (!ok) return;

    oi.landId = isUnlink ? null : (targetId || null);
    ctx.render();
    ctx.toast(oi.landId ? 'Перенесено в участок' : 'Привязка к участку снята', 'ok');
  };

  ctx.ui.applyOiDrop = applyDrop;
  // Документные слушатели вешаются один раз, а контроллер перепривязывается на
  // каждой отрисовке — поэтому подсказка передаётся через ui, как и applyOiDrop.
  ctx.ui.showOiDragHint = showHint;
  ctx.ui.hideOiDragHint = hideHint;

  const tree = s.$('[data-oi-cols-box]');
  if (tree) {
    tree.addEventListener('dragover', (e) => {
      if (!ctx.ui.dragOiId) return;
      e.preventDefault();
      const n = nodeAt(e.clientY);
      s.$$('[data-oi-drop]').forEach((x) => x.classList.toggle('drop-target', x === n));
      tree.classList.toggle('drop-unlink', !n);
      showHint(n);
    });
    tree.addEventListener('dragleave', (e) => {
      if (!tree.contains(e.relatedTarget)) {
        s.$$('[data-oi-drop]').forEach((x) => x.classList.remove('drop-target'));
        tree.classList.remove('drop-unlink');
      }
    });
    tree.addEventListener('drop', async (e) => {
      e.preventDefault();
      const n = nodeAt(e.clientY);
      s.$$('[data-oi-drop]').forEach((x) => x.classList.remove('drop-target'));
      tree.classList.remove('drop-unlink');
      hideHint();
      await applyDrop(n ? n.dataset.oiDrop : '', !n);
    });
  }

  // Бросок ВНЕ перечня ОИ — тоже открепление: тащить литеру некуда, кроме как
  // «убрать отсюда», и заставлять целиться в узкую полосу под узлами незачем.
  // Вешается один раз на скоуп: контроллер перепривязывается на каждой
  // отрисовке, а документные слушатели снимаются только при уходе с экрана.
  if (!s.root.dataset.dragUnlinkBound) {
    s.root.dataset.dragUnlinkBound = '1';

    s.onDocument('dragover', (e) => {
      if (!ctx.ui.dragOiId || e.target.closest('[data-oi-cols-box]')) return;
      e.preventDefault();
      // Ушли из перечня — ни один участок больше не цель.
      s.$$('[data-oi-drop]').forEach((x) => x.classList.remove('drop-target'));
      const box = s.$('[data-oi-cols-box]');
      if (box) box.classList.remove('drop-unlink');
      if (ctx.ui.showOiDragHint) ctx.ui.showOiDragHint(null);
    });

    s.onDocument('drop', async (e) => {
      if (!ctx.ui.dragOiId || e.target.closest('[data-oi-cols-box]')) return;
      e.preventDefault();
      if (ctx.ui.hideOiDragHint) ctx.ui.hideOiDragHint();
      await ctx.ui.applyOiDrop('', true);
    });

    // Перетаскивание может закончиться и без drop (нажали Esc, ушли за окно) —
    // подсказку в этом случае тоже надо убрать.
    s.onDocument('dragend', () => {
      if (ctx.ui.hideOiDragHint) ctx.ui.hideOiDragHint();
    });
  }

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
  const fitOiCols = () => {
    if (!oiBox) return;
    // Мерить надо место, где реально лежит таблица, а не контейнер дерева:
    // у узла есть свои поля и рамка, и таблица, подогнанная под внешний
    // контейнер, вылезала за него на их толщину.
    const tbl = oiBox.querySelector('table');
    const host = tbl ? tbl.parentElement : oiBox;
    const reserve = Math.max(0, oiBox.clientWidth - host.clientWidth);
    applyFit(oiBox, orderedColumns(OI_COLUMNS, oiOrder), ctx.ui.oiColWidths, reserve);
  };
  fitOiCols();

  // Ширина перечня меняется не только с окном: открытый просмотрщик забирает
  // половину экрана, и таблица становится уже без всякой перерисовки. Поэтому
  // следим за самим блоком. Подгонка меняет только переменные ширины на
  // контейнере, ширину блока не трогает — зацикливания не будет.
  if (oiBox && typeof ResizeObserver === 'function') {
    if (ctx.ui.oiColsObserver) ctx.ui.oiColsObserver.disconnect();
    const ro = new ResizeObserver(() => fitOiCols());
    ro.observe(oiBox);
    ctx.ui.oiColsObserver = ro;
  }

  bindDocsColumns(s);

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

  // Фото в аккордеоне перечня и мини-превью в строках. Теперь это РЕАЛЬНАЯ
  // загрузка файла (как у документов), а не просто инкремент счётчика: файл
  // кладётся в oi.photoFiles, счётчик увеличивает addPhotoFile.
  s.$$('[data-add-photo]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const oi = rec.oi.find((o) => o.id === b.dataset.photoOi);
    if (!oi) return;
    const cat = b.dataset.addPhoto;

    const file = await pickFile('image/*');
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }

    addPhotoFile(oi, cat, await attachedFileFrom(file));
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено: ' + file.name, 'ok');
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
