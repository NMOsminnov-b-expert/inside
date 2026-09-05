// Вспомогательные постройки участка (ТЗ docs/tz/30-uchastok-pravki.md §8,
// состав полей уточнён пользователем 04.09.2026).
//
// Поля строки: постройка (из справочника), площадь, состояние, класс.
// «Материал» убран — он ничего не решал в оценке вспомогательной постройки,
// а класс (капитальная или нет) решает: капитальная стоит на фундаменте и
// учитывается иначе.
//
// Зачем отдельно от «Наличия построек» в блоке 02: то поле отвечает на вопрос
// «есть ли на участке застройка вообще», а здесь перечисляется, что именно
// стоит. Капитальные строения по-прежнему заводятся отдельными объектами
// имущества (литерами): здесь только вспомогательное.
//
// Перечень построек зависит от типа участка — сельхозу подходят амбар и
// кошара, несельхозу баня и беседка. Сделано разделами справочника: раздел и
// есть «флаг применимости», о котором говорил пользователь. Так сохраняется
// правило «один справочник — одно поле», а править перечень можно в разделе
// «Справочники», не заходя в код.
//
// Разметка повторяет список площадей ядра (kernel/areaList.js): те же классы
// .al/.al-tbl, та же кнопка добавления и крестик удаления. Свой файл, а не
// переиспользование, потому что колонок здесь четыре, а общий список рассчитан
// на «наименование + площадь», и расширять его ради одного места — значит
// рисковать лоджиями и террасами во всех пяти модулях.
import { esc } from '../../../../kernel/dom.js';
import { emptyOptionHTML } from '../../../../kernel/emptyOption.js';
import { devNote } from '../../../../kernel/devNote.js';
import { num, fmtNum } from '../../../../kernel/fmt.js';
import { AUX_BUILDING_GROUPS, AUX_CONDITION, AUX_CLASS } from '../../data/dictionaries.js';
import { opt, optGroups } from '../../data/opts.js';

const AUX_NOTE = 'Здесь только вспомогательные постройки. Капитальные строения '
  + 'заводятся отдельными объектами имущества (литерами). Отдельная карточка '
  + 'вспомогательной литеры как ОИ — задача на будущее, пока её нет.';

let seq = 1;

export function auxBuildings(oi) {
  const v = oi && oi.auxBuildings;
  return Array.isArray(v) ? v : [];
}

const areaSum = (oi) => auxBuildings(oi).reduce((s, x) => s + num(x.area), 0);

// Какие постройки предлагать: раздел справочника по типу участка. Если раздела
// нет (справочник переписали), показываем все значения — лучше лишнее, чем
// пустой список, в котором нечего выбрать.
function kindOptions(oi) {
  const groups = optGroups('land', 'auxBuildingKind', AUX_BUILDING_GROUPS) || [];
  const key = oi.landType === 'Несельскохозяйственный' ? 'nonAgri' : 'agri';
  const group = groups.find((g) => g.key === key);
  if (group) return group.values || group.options || [];
  return groups.reduce((all, g) => all.concat(g.values || g.options || []), []);
}

function selectCell(attr, id, values, value) {
  return `<td><select class="select" data-${attr}="${esc(id)}">
    ${emptyOptionHTML(values)}
    ${values.map((v) => `<option ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}
  </select></td>`;
}

export function auxBuildingsHTML(ctx, oi) {
  const items = auxBuildings(oi);
  const open = !ctx.ui.accOpen || ctx.ui.accOpen['aux|land'] !== false;

  const kinds = kindOptions(oi);
  const conditions = opt('land', 'auxCondition', AUX_CONDITION);
  const classes = opt('land', 'auxClass', AUX_CLASS);

  const rows = items.map((it, i) => `<tr>
    <td class="al-n">${i + 1}</td>
    ${selectCell('aux-kind', it.id, kinds, it.kind)}
    <td><input class="input" data-aux-area="${esc(it.id)}" value="${esc(it.area || '')}"
      inputmode="decimal" placeholder="м²"></td>
    ${selectCell('aux-condition', it.id, conditions, it.condition)}
    ${selectCell('aux-class', it.id, classes, it.klass)}
    <td class="al-act"><button class="btn btn-danger btn-sm" data-aux-del="${esc(it.id)}" title="Убрать постройку">×</button></td>
  </tr>`).join('');

  return `<div class="al acc ${open ? 'open' : ''}" data-aux-block>
    <div class="sec-h acc-head" data-acc-toggle="aux|land"
      style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span class="al-head-left" style="display:flex;align-items:center;gap:8px;min-width:0">
        <span class="chev">▾</span>Вспомогательные постройки${devNote(AUX_NOTE)}
        <span class="pill-mini ${items.length ? 'pill-pend' : ''}">${items.length}</span>
        <span class="al-sum">Σ ${fmtNum(areaSum(oi))} м²</span>
      </span>
      <button class="btn btn-ghost btn-sm" data-aux-add>+ Постройка</button>
    </div>
    <div class="acc-body">${items.length ? `<table class="tbl al-tbl">
      <colgroup><col style="width:34px"><col><col style="width:110px"><col style="width:22%"><col style="width:18%"><col style="width:44px"></colgroup>
      <thead><tr><th>№</th><th>Постройка</th><th>Площадь, м²</th><th>Состояние</th><th>Класс</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="al-empty">Не добавлено. Капитальные строения заводятся отдельными объектами имущества.</div>'}</div>
  </div>`;
}

// Слушатели прямые, а не делегированные на скоуп: карточка перепривязывается на
// каждой отрисовке, и делегированные накапливались бы (этим уже отличились
// заметки, конструктивный состав и отопление).
export function bindAuxBuildings(ctx, oi) {
  const box = ctx.scope.$('[data-aux-block]');
  if (!box) return;

  const find = (id) => auxBuildings(oi).find((x) => x.id === id);

  [['aux-kind', 'kind'], ['aux-condition', 'condition'], ['aux-class', 'klass']]
    .forEach(([attr, key]) => {
      box.querySelectorAll(`[data-${attr}]`).forEach((sel) => {
        sel.onchange = () => {
          const it = find(sel.dataset[attr.replace(/-(\w)/g, (m, c) => c.toUpperCase())]);
          if (it) it[key] = sel.value;
        };
      });
    });

  // Сумма пересчитывается по ходу набора, но перерисовки нет — иначе сбивался
  // бы курсор в поле.
  box.querySelectorAll('[data-aux-area]').forEach((inp) => {
    inp.oninput = () => {
      const it = find(inp.dataset.auxArea);
      if (!it) return;
      it.area = inp.value;
      const sum = box.querySelector('.al-sum');
      if (sum) sum.textContent = `Σ ${fmtNum(areaSum(oi))} м²`;
    };
  });

  const add = box.querySelector('[data-aux-add]');
  if (add) add.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();          // иначе клик свернёт сам раздел
    oi.auxBuildings = auxBuildings(oi).concat({
      id: 'aux-' + (seq++), kind: '', area: '', condition: '', klass: '',
    });
    ctx.render();
  };

  box.querySelectorAll('[data-aux-del]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      oi.auxBuildings = auxBuildings(oi).filter((x) => x.id !== btn.dataset.auxDel);
      ctx.render();
    };
  });
}
