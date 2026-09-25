import { fieldsThatDisappear } from '../../../../kernel/fieldsPreview.js';
import { confirmDialog } from '../../../../kernel/dialog.js';
import { render } from './view.js';
import { bindEniField } from '../../../../kernel/eniField.js';
import { bindNumField } from '../../../../kernel/numField.js';
import { bindAnnexes } from './annexes.js';
import { RES_BUILD_CAT } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { bindYearField } from '../../../../kernel/yearField.js';
import { bindDocsColumns } from '../../parts/docs/table.js';
import { bindStruct } from '../../parts/struct/ms.js';
import { bindSpecials } from '../../parts/specials/ctrl.js';
import { buildFloors, recalcFloors, addFloorRow, removeFloorRow, renameFloorRow,
  moveFloorRow, FLOOR_CATS } from './floors.model.js';
import { updateFloorsUI, rerenderFloors, floorColOrder, floorsNote } from './floors.view.js';
import { bindHeating } from './heating.js';
import { photoPages, addPhotoFile } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace } from '../../../../kernel/viewer/state.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { nextId, nextDocId } from '../../data/store.js';
import { bindTempMode } from './tempMode.js';
import { bindAreasNote, updateAreasNote } from '../../../../kernel/areasNote.js';
import { bindColumnReorder } from '../../../../kernel/columns.js';
import { bindMsSearch } from '../../../../kernel/multiSelect.js';
import { SIGNS, PURPOSES, kindOf, signsOf, pickedOf, heightOf, heightBand, syncCapClass } from './capClass.js';
import {
  hasZones, targetOf, splitIntoZones, addZone, removeZone, zoneById, syncFromZones, zonesSum, diffText,
  distributionText, typesText, zoneClassInfo,
} from './zones.js';
import { fmtNum } from '../../../../kernel/fmt.js';
import { esc } from '../../../../kernel/dom.js';
import { capMsSummary, capMsBody } from './view.js';

export function bind(ctx, oi) {
  bindAnnexes(ctx, oi);
  bindYearField(ctx, oi);
  bindDocsColumns(ctx.scope);
  bindSpecials(ctx, oi);
  const s = ctx.scope;

  // --- Площади и этажность -------------------------------------------------
  // Площади и высоты — числовые поля: на экране «1 840,50», в запись уходит
  // машинное «1840,50» (kernel/numField.js). Раньше в поле стояло сырое
  // значение из данных, и одно и то же число выглядело по-разному в поле и в
  // итоге под ним.
  s.$$('[data-area]').forEach((i) => bindNumField(i, (v) => {
    oi.areas[i.dataset.area] = v;
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
    updateAreasNote(s, areasPair());
    ctx.updatePlate();
    // Площадь по внутреннему обмеру делится между зонами — сверка следует за ней.
    if (hasZones(oi)) refreshZones();
  }));

  s.$$('[data-height]').forEach((i) => bindNumField(i, (v) => {
    oi.heights[i.dataset.height] = v;
    // Высота по внутренним замерам — признак класса: диапазон и класс
    // следуют за числом без перерисовки карточки.
    if (i.dataset.height === 'int') refreshCapClass();
  }));

  // Комментарий к площадям: авторазмер поля, запись на change и мягкое
  // предупреждение о расхождении площадей — всё в kernel/areasNote.js, чтобы
  // семь карточек не разошлись формулировками.
  const areasPair = () => ({
    a: (oi.areas || {}).pud, b: (oi.areas || {}).fact,
    labelA: 'площадь по правоустанавливающим документам', labelB: 'площадь по факту',
  });
  bindAreasNote(s, oi, areasPair);


  // Количество этажей: только цифры и разумные границы. Раньше поле принимало
  // что угодно, а любая нечисловая строка молча превращалась в 1 — этаж
  // пропадал вместе с введёнными по нему площадями.
  const fn = s.$('[data-floors-n]');
  if (fn) {
    fn.oninput = () => {
      const clean = fn.value.replace(/\D/g, '').slice(0, 3);
      if (clean !== fn.value) fn.value = clean;
    };
    fn.onchange = () => {
      const n = parseInt(fn.value, 10);
      // Пустое поле — не повод менять состав: оставляем прежнее значение.
      // А вот ноль допустим: бывает объект из одного цоколя и мансарды.
      if (fn.value.trim() === '') { fn.value = oi.floors; return; }

      oi.floors = Math.min(200, Math.max(0, n || 0));
      fn.value = oi.floors;
      buildFloors(oi);
      redrawFloors();
      ctx.updatePlate();
    };
  }

  // Слушатели развёртки вынесены в функцию: rerenderFloors заменяет разметку
  // блока целиком, и без повторной привязки чекбоксы и поля площадей остаются
  // на выброшенных узлах — то есть перестают работать после смены этажности
  // или добавления мансарды.
  const redrawFloors = () => { rerenderFloors(ctx, oi); bindFloors(); };

  // Количество надземных этажей — производное от состава развёртки: строку
  // могли добавить, убрать или перенести в другое размещение прямо в таблице.
  // Вместе с полем обновляем приписку под ним: она живёт вне блока развёртки,
  // и перерисовка блока её не задевала — после добавления строки поле уже
  // показывало новое число, а приписка рядом ещё старое.
  const syncFloorsCount = () => {
    const el = ctx.scope.$('[data-floors-n]');
    if (el) el.value = oi.floors;
    const note = ctx.scope.$('[data-floors-note]');
    if (note) note.textContent = floorsNote(oi);
    ctx.updatePlate();
  };

  function bindFloors() {
    const rd = s.$('[data-redistribute]');
    if (rd) rd.onclick = (e) => {
      e.stopPropagation();
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
      ctx.toast('Отмеченные этажи выровнены по остатку', 'ok');
    };

    s.$$('[data-floor-on]').forEach((c) => c.onchange = () => {
      oi.floorList[+c.dataset.floorOn].on = c.checked;
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
    });

    // Размещение сворачивается кликом по строке-заголовку группы. Общий
    // механизм аккордеонов модуля здесь не годится: он переключает .acc/
    // .acc-body, а блочная разметка внутри таблицы развалила бы колонки.
    // Поэтому прячем сами строки, а состояние держим там же, где у аккордеонов
    // (ctx.ui.accOpen) — чтобы свёрнутое размещение таким и осталось.
    s.$$('[data-floor-group-toggle]').forEach((head) => {
      head.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const cat = head.dataset.floorGroup;
        const open = !head.classList.contains('open');
        head.classList.toggle('open', open);
        s.$$(`[data-floor-in="${cat}"]`).forEach((row) => { row.hidden = !open; });
        ctx.ui.accOpen[head.dataset.floorGroupToggle] = open;
      };
    });

    s.$$('[data-cat-all]').forEach((c) => c.onchange = () => {
      const cat = c.dataset.catAll;
      oi.floorList.filter((f) => f.cat === cat).forEach((f) => { f.on = c.checked; });
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
    });

    // Ключ поля — «<колонка>|<индекс>»: площадей у этажа три, и каждая
    // распределяется от своего итога (см. floors.model.js).
    s.$$('[data-floor-area]').forEach((i) => bindNumField(i, (v) => {
      const [key, idx] = i.dataset.floorArea.split('|');
      oi.floorList[+idx][key] = v;
      recalcFloors(oi);
      updateFloorsUI(ctx, oi);
    }));

    s.$$('[data-floor-hext]').forEach((i) => bindNumField(i, (v) => {
      oi.floorList[+i.dataset.floorHext].hExt = v;
    }));
    s.$$('[data-floor-hint]').forEach((i) => bindNumField(i, (v) => {
      oi.floorList[+i.dataset.floorHint].hInt = v;
    }));

    // Название строки правится вручную: этажи бывают «−1», подвалов и цоколей
    // может быть несколько. Перерисовки не делаем — сбился бы курсор в поле.
    s.$$('[data-floor-name]').forEach((inp) => inp.onchange = () => {
      renameFloorRow(oi, +inp.dataset.floorName, inp.value);
    });

    // Тип у каждой мансардной строки: мансарда и полумансарда бывают в одном
    // здании, поэтому одного поля на литеру не хватает (Л5.3).
    s.$$('[data-floor-mansard]').forEach((sel) => sel.onchange = () => {
      oi.floorList[+sel.dataset.floorMansard].mansardType = sel.value;
    });

    // Строку любой категории можно добавить и убрать: состав развёртки задаёт
    // человек, а не формула. Поле «Количество этажей» после этого пересчитано
    // по надземным строкам, поэтому обновляем и его.
    s.$$('[data-add-floor]').forEach((b) => b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      addFloorRow(oi, b.dataset.addFloor);
      redrawFloors();
      syncFloorsCount();
    });

    s.$$('[data-del-floor]').forEach((b) => b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFloorRow(oi, +b.dataset.delFloor);
      redrawFloors();
      syncFloorsCount();
    });

    bindFloorDrag();

    // Порядок столбцов меняется перетаскиванием шапки — тем же механизмом, что
    // в реестре (kernel/columns.js), чтобы поведение в проекте было одно.
    // Порядок живёт в настройках карточки и переживает перезагрузку.
    bindColumnReorder(s, {
      headSel: '.fl-tbl thead',
      order: floorColOrder(ctx),
      onCommit: (next) => {
        ctx.ui.floorCols = next;
        redrawFloors();
      },
    });

  }

  // Перенос строки развёртки в другое размещение: этаж — в подвалы или в
  // мансарды и обратно. Тянут за ручку, а не за строку целиком: строка почти
  // сплошь состоит из полей ввода, и draggable на ней отнимал бы у них
  // выделение текста мышью.
  //
  // Что тащим, помним в ui, а не в локальной переменной: обработчики
  // перевешиваются на каждой перерисовке блока, а бросок случается уже после
  // неё — локальную переменную новый обработчик увидел бы пустой.
  function bindFloorDrag() {
    const clearMarks = () => {
      s.$$('[data-floor-drop]').forEach((n) => n.classList.remove('fl-drop'));
      s.$$('[data-floor-row]').forEach((n) => n.classList.remove('fl-dragging'));
      clearInsert();
    };

    // Куда встанет строка: линию рисуем ровно между теми строками, между
    // которыми она окажется, — «подсветить весь раздел» человеку не говорило
    // ничего, кроме того, что раздел подходящий (замечание пользователя
    // 14.09.2026).
    const clearInsert = () => {
      s.$$('.fl-ins-before, .fl-ins-after').forEach((n) => {
        n.classList.remove('fl-ins-before');
        n.classList.remove('fl-ins-after');
      });
    };

    // Метка «вставить перед этой строкой». Храним объект строки, а не номер:
    // номера поедут, как только строку вынут из списка.
    const markInsert = (row, after) => {
      clearInsert();
      if (!row) return;
      row.classList.add(after ? 'fl-ins-after' : 'fl-ins-before');
    };

    // Ближайшая к курсору граница между строками внутри размещения.
    const insertPoint = (box, y) => {
      const rows = [...box.querySelectorAll('[data-floor-row]')]
        .filter((r) => !r.hidden && !r.classList.contains('fl-dragging'));
      for (const r of rows) {
        const b = r.getBoundingClientRect();
        if (y < b.top + b.height / 2) return { el: r, after: false, index: +r.dataset.floorRow };
      }
      const last = rows[rows.length - 1];
      return { el: last || box.querySelector('.fl-grp'), after: true, index: null };
    };

    s.$$('[data-floor-grip]').forEach((grip) => {
      const idx = +grip.dataset.floorGrip;
      const row = grip.closest('[data-floor-row]');

      grip.addEventListener('dragstart', (e) => {
        ctx.ui.dragFloor = { oiId: oi.id, index: idx };
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
        if (row) row.classList.add('fl-dragging');
      });

      grip.addEventListener('dragend', () => {
        ctx.ui.dragFloor = null;
        clearMarks();
      });
    });

    s.$$('[data-floor-drop]').forEach((box) => {
      const cat = box.dataset.floorDrop;

      // Своё размещение тоже принимает строку: внутри него её переставляют
      // на другое место.
      const mine = () => {
        const d = ctx.ui.dragFloor;
        if (!d || d.oiId !== oi.id) return null;
        return (oi.floorList || [])[d.index] ? d : null;
      };

      box.addEventListener('dragover', (e) => {
        if (!mine()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        box.classList.add('fl-drop');

        const point = insertPoint(box, e.clientY);
        markInsert(point.el, point.after);
        ctx.ui.dragFloorAt = { cat, index: point.index };
      });

      box.addEventListener('dragleave', (e) => {
        // Уход внутрь собственных потомков — не уход из раздела.
        if (box.contains(e.relatedTarget)) return;
        box.classList.remove('fl-drop');
        clearInsert();
      });

      box.addEventListener('drop', (e) => {
        const d = mine();
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        clearMarks();

        const name = (oi.floorList[d.index] || {}).name || 'строка';
        const to = FLOOR_CATS.find((c) => c.key === cat);
        // Строка встаёт ровно туда, где была нарисована линия.
        const at = ctx.ui.dragFloorAt;
        const before = at && at.cat === cat && at.index !== null
          ? oi.floorList[at.index] : null;
        const sameCat = (oi.floorList[d.index] || {}).cat === cat;
        if (!moveFloorRow(oi, d.index, cat, before)) return;
        ctx.ui.dragFloor = null;
        ctx.ui.dragFloorAt = null;

        // Раздел, куда перенесли, раскрываем: иначе строка уезжает в свёрнутый
        // блок, и перенос выглядит как пропажа.
        ctx.ui.accOpen['fl|' + oi.id + '|' + cat] = true;

        redrawFloors();
        syncFloorsCount();
        ctx.toast(sameCat
          ? `«${name}» — порядок изменён`
          : `«${name}» → ${to ? to.label.toLowerCase() : cat}`, 'ok');
      });
    });
  }

  bindFloors();

  // --- Общие параметры ----------------------------------------------------
  // Перерисовка обязательна: от расположения зависит список категорий
  // жилого строения (обособленный бывает только у отдельностоящего).
  const bt = s.$('[data-buildtype]');
  if (bt) bt.onchange = () => {
    oi.buildType = bt.value;
    // Категория ПОДСТАВЛЯЕТСЯ под новое расположение, но остаётся доступной для
    // правки вручную: список полный, особые случаи бывают (уточнение
    // пользователя 28.08.2026).
    const detached = oi.buildType === 'Отдельностоящее';
    if (detached && oi.resCat !== 'Обособленный') oi.resCat = 'Обособленный';
    if (!detached && oi.resCat === 'Обособленный') {
      oi.resCat = opt('building', 'buildCat', RES_BUILD_CAT).find((o) => o !== 'Обособленный') || '';
    }
    ctx.updatePlate();
    ctx.render();
  };

  // Входная группа — простой выбор, на состав карточки не влияет.
  const ent = s.$('[data-entrance]');
  if (ent) ent.onchange = () => { oi.entrance = ent.value; };

  // Права на строение: справочник плюс ручной ввод варианта «Иное».
  const rightsSel = s.$('[data-bld-rights]');
  if (rightsSel) rightsSel.onchange = () => {
    oi.rights = rightsSel.value;
    const other = s.$('[data-bld-rights-other]');
    if (other) {
      other.style.display = oi.rights === 'Иное' ? '' : 'none';
      if (oi.rights !== 'Иное') { other.value = ''; oi.rightsOther = ''; }
    }
  };

  const rightsOther = s.$('[data-bld-rights-other]');
  if (rightsOther) rightsOther.onchange = () => { oi.rightsOther = rightsOther.value; };

  // ТЗ §9.6: от категории зависит состав ОСТАЛЬНЫХ полей карточки, поэтому
  // перед сменой показываем, что скроется. Значения при этом сохраняются в
  // записи и вернутся, если категорию поставить обратно — об этом в диалоге
  // сказано прямо, иначе человек не решится нажать.
  const warnCategory = (next, apply) => {
    const lost = fieldsThatDisappear(render, ctx, oi, next);
    if (!lost.length) { apply(); return; }

    confirmDialog({
      title: 'Сменить назначение по тех паспорту?',
      text: 'При этом назначении поля ниже не показываются. Значения '
        + 'сохранятся и вернутся, если поставить назначение обратно.',
      list: lost,
      okLabel: 'Сменить назначение',
    }).then((ok) => { if (ok) apply(); });
  };


  // --- Площади и стоимость аренды (строки заводит пользователь) -----------
  oi.rentAreas = oi.rentAreas || [];

  s.$$('[data-rent-label]').forEach((i) => i.onchange = () => {
    const row = oi.rentAreas.find((r) => r.id === i.dataset.rentLabel);
    if (row) row.label = i.value;
  });

  // Числовые поля таблицы аренды — с разрядами и маской по ходу ввода, как в
  // развёртке: соседние блоки одной карточки не должны показывать одно и то же
  // число по-разному (требование пользователя 11.09.2026).
  s.$$('[data-rent-cell]').forEach((i) => bindNumField(i, (v) => {
    const [col, id] = i.dataset.rentCell.split('|');
    const row = oi.rentAreas.find((r) => r.id === id);
    if (row) row[col] = v;
  }));

  const ra = s.$('[data-rent-add]');
  if (ra) ra.onclick = (e) => {
    e.stopPropagation();
    oi.rentAreas.push({ id: nextId('ra'), label: '', total: '', useful: '', rentable: '', rentValue: '' });
    ctx.render();
  };

  s.$$('[data-rent-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const i = oi.rentAreas.findIndex((r) => r.id === b.dataset.rentDel);
    if (i >= 0) oi.rentAreas.splice(i, 1);
    ctx.render();
  });

  bindTempMode(ctx, oi);


  // Тип строения: справочник плюс ручной ввод варианта «Прочее».
  const skSel = s.$('[data-structure-kind]');
  if (skSel) skSel.onchange = () => {
    oi.structureKind = skSel.value;
    const other = s.$('[data-structure-kind-other]');
    if (other) {
      other.style.display = oi.structureKind === 'Прочее' ? '' : 'none';
      if (oi.structureKind !== 'Прочее') { other.value = ''; oi.structureKindOther = ''; }
    }
  };

  const skOther = s.$('[data-structure-kind-other]');
  if (skOther) skOther.onchange = () => { oi.structureKindOther = skOther.value; };

  const cc = s.$('[data-catclass]');
  if (cc) cc.onchange = () => {
    // Значение снимаем СРАЗУ в переменную. Диалог подтверждения асинхронный, а
    // строка ниже возвращает полю прежнее значение сейчас же — обработчик,
    // читавший cc.value уже после ответа, применял старое значение, и смена
    // назначения не срабатывала вовсе (найдено 05.09.2026).
    const next = cc.value;
    warnCategory({ catClass: next }, () => { oi.catClass = next; ctx.render(); });
    // Пока человек не ответил, поле показывает прежнее значение: иначе при
    // отказе в нём осталось бы то, что он не выбрал.
    cc.value = oi.catClass || '';
  };

  const rc = s.$('[data-rescat]');
  // Перерисовка обязательна: от категории зависит состав «Расположения
  // строения» — «Отдельностоящее» доступно только обособленным (Л2.5).
  if (rc) rc.onchange = () => { oi.resCat = rc.value; ctx.render(); };

  // Перерисовка обязательна: от статуса зависит видимость «Типа строения»
  // (он есть только у вспомогательных).
  s.$$('[data-status]').forEach((sel) => sel.onchange = () => {
    oi.status = sel.value;
    ctx.updatePlate();
    ctx.render();
  });

  const nm = s.$('[data-oi-name]');
  if (nm) nm.onchange = () => { oi.name = nm.value; ctx.updatePlate(); };

  // Адрес литеры: улица с домом свои у каждого ОИ, город с районом — общие для
  // записи. Собранный адрес записи держится в rec.address, поэтому после правки
  // его пересобираем — иначе шапка, реестр и поиск показывали бы старое
  // (kernel/address.js, заметки команды 05.09.2026).
  // Координаты: проверка формата (kernel/gps.js) через общий механизм полей с
  // проверкой — перепутанные широта и долгота молча дают точку не в том месте.
  // ЕНИ правится в шапке карточки (плашке): он одинаково нужен и в общих
  // параметрах, и при вводе любых значений, а место в форме занимал зря.
  // Из поля приходит маска — в данные кладём цифры (kernel/fmt.js).
  // Код ЕНИ: маска и проверка длины в самом поле (kernel/eniField.js). В данные
  // попадает только корректный код — неверный остаётся в поле подсвеченным,
  // чтобы его исправили, а не потеряли.
  bindEniField(s.$('[data-head-eni]') || s.$('[data-land-eni]'), (digits) => {
    oi.eni = digits;
    ctx.updatePlate();
  });

  // --- Конструктивный состав ----------------------------------------------
  bindStruct(ctx, oi);

  // --- Износ конструктивных элементов --------------------------------------
// Состояние жилого дома: три отдельных поля (блок «Состояние»).
  s.$$('[data-condition]').forEach((sel) => sel.onchange = () => {
    oi[sel.dataset.condition] = sel.value;
  });

  s.$$('[data-wear]').forEach((sel) => sel.onchange = () => {
    oi.wear = oi.wear || {};
    oi.wear[sel.dataset.wear] = sel.value;
  });

  // --- Доп параметры (производственное строение) ---------------------------
  // Высота — число, как площади: с разрядами и маской по ходу ввода.
  const phe = s.$('[data-prod-height]');
  if (phe) bindNumField(phe, (v) => { oi.prodHeight = v; });

  // --- Вид литеры и класс капитальности -----------------------------------
  // Вид меняет состав карточки (признаки, доп. параметры) — перерисовка.
  // Заполненное у прежнего вида остаётся в записи (решение пользователя
  // 23.09.2026); что скроется — показываем перед сменой, как было со сменой
  // назначения (ТЗ §9.6): иначе заполненный блок пропадал бы молча.
  s.$$('[data-lit-kind]').forEach((b) => b.onclick = () => {
    const next = b.dataset.litKind;
    const t = targetOf(oi, b);
    if (kindOf(t) === next) return;
    // Тип зоны меняет только её признаки: заполненное остаётся в зоне.
    if (t !== oi) {
      t.litKind = next;
      if (t.purposeFact && !(PURPOSES[next] || []).includes(t.purposeFact)) t.purposeFact = '';
      syncFromZones(oi);
      ctx.render();
      return;
    }
    const apply = () => {
      oi.litKind = next;
      if (oi.purposeFact && !(PURPOSES[next] || []).includes(oi.purposeFact)) oi.purposeFact = '';
      syncCapClass(oi);
      ctx.render();
    };
    const lost = fieldsThatDisappear(render, ctx, oi, { litKind: next });
    if (!lost.length) { apply(); return; }
    confirmDialog({
      title: 'Сменить тип объекта имущества?',
      text: 'При этом типе поля ниже не показываются. Значения сохранятся и вернутся, если вернуть тип.',
      list: lost,
      okLabel: 'Сменить тип',
    }).then((ok) => { if (ok) apply(); });
  });

  s.$$('[data-purpose-fact]').forEach((pf) => pf.onchange = () => {
    targetOf(oi, pf).purposeFact = pf.value;
    syncFromZones(oi);
    ctx.updatePlate && ctx.updatePlate();
  });

  // Класс — поле без ввода: пересчитывается сразу, как поменялся признак.
  // У литеры из зон — класс каждой зоны, сверка площадей и площади по классам
  // в блоке 01; всё на месте, без перерисовки карточки (иначе закрывался бы
  // открытый список признаков).
  function refreshZones() {
    syncFromZones(oi);
    s.$$('[data-zone]').forEach((box) => {
      const z = zoneById(oi, box.dataset.zone);
      if (!z) return;
      const c = zoneClassInfo(z);
      const cls = box.querySelector('[data-zone-class]');
      if (cls) {
        cls.textContent = c.text;
        cls.title = c.title;
        cls.classList.toggle('muted', !c.ok);
      }
      const hb = box.querySelector('[data-cap-height]');
      const sign = (SIGNS[kindOf(z)] || []).find((x) => x.height);
      if (hb && sign) {
        const band = heightBand(sign, heightOf(z));
        hb.textContent = band ? band[2] : 'Нет высоты по внутр. замерам зоны';
        hb.classList.toggle('muted', !band);
      }
    });
    const st = zonesSum(oi);
    const sum = s.$('[data-zones-sum]');
    if (sum) sum.textContent = `${fmtNum(st.sum)} из ${fmtNum(st.total)} м²`;
    const diff = s.$('[data-zones-diff]');
    if (diff) {
      diff.textContent = st.total ? diffText(st.diff) : 'нет площади по внутреннему обмеру';
      diff.classList.toggle('ok', st.ok);
      diff.classList.toggle('warn', !st.ok);
    }
    const dist = distributionText(oi);
    const d = s.$('[data-zones-dist]');
    if (d) d.innerHTML = `<span class="zn-dist-l">По классам:</span> ${esc(dist)}`;
    const box = s.$('[data-cap-class]');
    if (box) box.textContent = dist;
    const kv = s.$('[data-lit-kind-view]');
    if (kv) kv.textContent = typesText(oi);
  }

  function refreshCapClass() {
    if (hasZones(oi)) { refreshZones(); return; }
    const c = syncCapClass(oi);
    const box = s.$('[data-cap-class]');
    if (box) {
      box.textContent = c.label || (c.missing.length ? `Не хватает: ${c.missing.join(', ')}` : '—');
      box.classList.toggle('muted', !c.label);
    }
    const hb = s.$('[data-cap-height]');
    const sign = (SIGNS[kindOf(oi)] || []).find((x) => x.height);
    if (hb && sign) {
      const band = heightBand(sign, heightOf(oi));
      hb.textContent = band ? band[2] : 'Нет высоты по внутренним замерам';
      hb.classList.toggle('muted', !band);
    }
  }

  s.$$('[data-cap-sign]').forEach((el) => el.onchange = () => {
    const sg = signsOf(targetOf(oi, el));
    if (el.value) sg[el.dataset.capSign] = el.value; else delete sg[el.dataset.capSign];
    refreshCapClass();
  });

  // Признаки с несколькими вариантами — выпадающий мультивыбор, как у
  // материалов конструктива; выбор перерисовывает только сводку и список.
  s.$$('[data-cap-ms]').forEach((box) => {
    const key = box.dataset.capMs;
    const t = targetOf(oi, box);
    const sign = (SIGNS[kindOf(t)] || []).find((x) => x.key === key);
    const control = box.querySelector('[data-ms-control]');
    const drop = box.querySelector('.ms-drop');
    if (!sign || !control || !drop) return;
    const bindOpts = () => {
      bindMsSearch(drop);
      drop.querySelectorAll('[data-cap-opt]').forEach((cb) => cb.onchange = () => {
        const value = cb.dataset.capOpt.slice(key.length + 1);
        const order = sign.options.map((o) => o[0]);
        const list = pickedOf(t, key).filter((v) => v !== value);
        if (cb.checked) list.push(value);
        list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        signsOf(t)[key] = list;
        control.innerHTML = capMsSummary(list);
        drop.innerHTML = capMsBody(sign, list);
        bindOpts();
        refreshCapClass();
      });
    };
    bindOpts();
  });

  // --- Зоны литеры (zones.js) ----------------------------------------------
  const split = s.$('[data-zone-split]');
  if (split) split.onclick = () => { splitIntoZones(oi); ctx.render(); };
  const add = s.$('[data-zone-add]');
  if (add) add.onclick = () => {
    addZone(oi);
    ctx.render();
    const names = s.$$('[data-zone-name]');
    if (names.length) names[names.length - 1].focus();
  };
  s.$$('[data-zone]').forEach((box) => {
    const z = zoneById(oi, box.dataset.zone);
    if (!z) return;
    const name = box.querySelector('[data-zone-name]');
    if (name) name.oninput = () => { z.name = name.value; };
    // Числа — тем же полем, что площади и высоты литеры: разряды, запятая,
    // выражения вроде «620-300» (kernel/numField.js).
    bindNumField(box.querySelector('[data-zone-area]'), (v) => { z.area = v; refreshZones(); });
    bindNumField(box.querySelector('[data-zone-height]'), (v) => {
      z.heights = { ...(z.heights || {}), int: v };
      refreshZones();
    });
    const del = box.querySelector('[data-zone-del]');
    if (del) del.onclick = () => {
      const filled = z.litKind || z.area || Object.keys(z.capSigns || {}).length;
      const go = () => { removeZone(oi, z.id); ctx.render(); };
      if (!filled) { go(); return; }
      confirmDialog({
        title: 'Убрать зону?',
        text: `«${z.name || 'Зона'}» — тип, площадь и признаки зоны будут удалены.`
          + (s.$$('[data-zone]').length === 2 ? ' Останется одна зона — литера снова станет цельной.' : ''),
        okLabel: 'Убрать',
        danger: true,
      }).then((ok) => { if (ok) go(); });
    };
  });

  // --- Отопление ----------------------------------------------------------
  s.$$('[data-ms-toggle]').forEach((c) => c.onclick = (e) => {
    e.stopPropagation();
    const drop = c.parentElement.querySelector('.ms-drop');
    s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    s.$$('.ms-control').forEach((mc) => { if (mc !== c) mc.classList.remove('open'); });
    drop.hidden = !drop.hidden;
    c.classList.toggle('open', !drop.hidden);
    ctx.ui.heatOpen = !drop.hidden;
  });

  bindHeating(ctx, oi);

  // Закрытие списков по клику вне них. Вешается ОДИН раз на скоуп: контроллер
  // перепривязывается на каждой отрисовке, а документные слушатели снимаются
  // только при уходе с экрана — иначе они копились бы всю сессию.
  if (!s.root.dataset.msOutsideBound) {
    s.root.dataset.msOutsideBound = '1';
    s.onDocument('click', (e) => {
    if (!e.target.closest('.ms')) {
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      ctx.ui.heatOpen = false;
    }
    });
  }

  // Фото в аккордеоне перечня и мини-превью в строках. Теперь это РЕАЛЬНАЯ
  // загрузка файла (как у документов), а не просто инкремент счётчика: файл
  // кладётся в oi.photoFiles, счётчик увеличивает addPhotoFile.
  s.$$('[data-add-photo]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const oi = ctx.rec.oi.find((o) => o.id === b.dataset.photoOi);
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
    const [, rest] = p.dataset.openPhoto.split('|');
    const [cat, i] = rest.split(':');
    const idx = photoPages(oi).findIndex((x) => x.cat === cat && x.i === +i) + 1;
    openPhotoInPlace(ctx, oi.id, idx);
  });

  s.$$('[data-open-pviewer]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    ctx.ui.viewer = { mode: 'photo' };
    ctx.render();
  });

  // --- Документы ----------------------------------------------------------
  s.$$('[data-open-movdoc]').forEach((tr) => tr.onclick = () => {
    const [scope, id] = tr.dataset.openMovdoc.split('|');
    openDocViewer(ctx, scope, id);
  });

  const am = s.$('[data-add-movdoc]');
  if (am) am.onclick = async () => {
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }
    oi.docs = oi.docs || [];
    const doc = { id: nextDocId(ctx.rec), type: 'ПУД', name: file.name, date: ctx.today, file: await attachedFileFrom(file) };
    oi.docs.push(doc);
    openDocViewer(ctx, oi.id, doc.id);
    ctx.toast('Документ добавлен', 'ok');
  };

  // --- Литера -------------------------------------------------------------
  const elBtn = s.$('[data-edit-letter]');
  if (elBtn) elBtn.onclick = () => {
    ctx.ui.letterEdit = true;
    ctx.render();
    const i = ctx.scope.$('[data-letter-input]');
    if (i) { i.focus(); i.select(); }
  };

  const ls = s.$('[data-letter-save]');
  if (ls) ls.onclick = () => {
    const inp = s.$('[data-letter-input]');
    const v = (inp ? inp.value : '').trim();
    if (!v || v === oi.letter) { ctx.ui.letterEdit = false; ctx.render(); return; }
    // Одинаковые литеры разрешены (решение пользователя 11.09.2026). Запрет
    // мешал: в записи встречаются повторы — бараки, строения из разных
    // техпаспортов. Литера не ключ, объекты различаются идентификаторами.
    oi.letter = v;
    ctx.ui.letterEdit = false;
    ctx.render();
    ctx.toast('Литера переименована', 'ok');
  };

  const lc = s.$('[data-letter-cancel]');
  if (lc) lc.onclick = () => { ctx.ui.letterEdit = false; ctx.render(); };

  // --- Удаление и сохранение ---------------------------------------------
  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    ctx.ui.letterEdit = false;
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
