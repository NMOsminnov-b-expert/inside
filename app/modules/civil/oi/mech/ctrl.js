// Контроллер карточки «Механизмы и оборудование».
//
// Правило на всю карточку: пока человек печатает, карточка целиком не
// перерисовывается — полная отрисовка заменила бы поле вместе с курсором.
// Набранное пишется в данные сразу, а таблица состава над карточкой единицы
// обновляется точечно (refreshList). Полная отрисовка — только там, где меняется
// сам состав карточки: выбор в классификаторе, добавление и удаление.
import { confirmDialog } from '../../../../kernel/dialog.js';
import { bindNumField } from '../../../../kernel/numField.js';
import { bindCheckedField } from '../../../../kernel/fieldError.js';
import { addPhotoFile, photoPages } from '../../parts/photos/model.js';
import { openPhotoInPlace } from '../../parts/viewer/state.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { unitsTable, selectedUnit } from './view.js';
import {
  mechUnits, createUnit, setClass, setSub, unitTitle, dropUnitPhotos, syncMechName,
} from './model.js';

let fieldSeq = 1;

const MIN_YEAR = 1900;

function yearError(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  if (!/^\d{4}$/.test(t)) return 'Год — четыре цифры';
  const y = +t;
  const max = new Date().getFullYear();
  if (y < MIN_YEAR || y > max) return `Год от ${MIN_YEAR} до ${max}`;
  return '';
}

function qtyError(v) {
  const t = String(v || '').trim();
  if (!t) return 'Укажите количество';
  if (!/^\d+$/.test(t) || +t < 1) return 'Целое число, не меньше 1';
  return '';
}

export function bind(ctx, oi) {
  const s = ctx.scope;
  const unit = selectedUnit(ctx, oi);

  const select = (id) => {
    ctx.ui.mechSel = { ...(ctx.ui.mechSel || {}), [oi.id]: id };
  };

  // Отрисовка асинхронная: карточка подгружается лениво. Всё, что после неё
  // работает с разметкой (фокус, прокрутка), должно её дождаться — иначе
  // фокус ставится на элемент, которого уже нет.
  const rerender = () => {
    syncMechName(oi);
    return ctx.render();
  };

  // --- Перечень единиц -----------------------------------------------------

  // Таблица перерисовывается целиком, но это отдельный блок: поле, в котором
  // стоит курсор, живёт в карточке единицы ниже и не задевается.
  const refreshList = () => {
    syncMechName(oi);
    const wrap = s.$('.mu-table-wrap');
    if (wrap) {
      wrap.outerHTML = unitsTable(ctx, oi, selectedUnit(ctx, oi));
      bindList();
    }
    const title = s.$('.mu-title');
    if (title && unit) title.textContent = unitTitle(unit);
    ctx.updatePlate();
  };

  function bindList() {
    s.$$('[data-mu-pick]').forEach((tr) => {
      tr.onclick = (e) => {
        if (e.target.closest('button')) return;
        select(tr.dataset.muPick);
        ctx.render();
      };
      // С клавиатуры строка выбирается так же, как щелчком: Enter или пробел.
      tr.onkeydown = async (e) => {
        if (e.target !== tr || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        select(tr.dataset.muPick);
        await ctx.render();
        const again = s.$(`[data-mu-pick="${tr.dataset.muPick}"]`);
        if (again) again.focus();
      };
    });

    s.$$('[data-mu-del]').forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      const list = mechUnits(oi);
      const u = list.find((x) => x.id === b.dataset.muDel);
      if (!u) return;

      // Удаление единицы уносит её параметры и фото — спрашиваем. Последняя
      // единица не удаляется, а очищается: ОИ без состава не бывает, убрать
      // объект целиком можно в перечне ОИ записи.
      const last = list.length === 1;
      const ok = await confirmDialog({
        title: last ? 'Очистить единицу' : 'Убрать единицу',
        text: last
          ? `«${unitTitle(u)}» — единственная единица в составе. Её сведения и фото будут очищены.`
          : `Убрать «${unitTitle(u)}» из состава? Её сведения и фото будут удалены.`,
        okLabel: last ? 'Очистить' : 'Убрать',
        danger: true,
      });
      if (!ok) return;

      dropUnitPhotos(oi, u);
      const at = list.indexOf(u);
      if (last) {
        list.splice(0, 1, createUnit());
        select(list[0].id);
      } else {
        list.splice(at, 1);
        select(list[Math.min(at, list.length - 1)].id);
      }
      rerender();
      ctx.toast(last ? 'Единица очищена' : 'Единица убрана', 'ok');
    });
  }
  bindList();

  const add = s.$('[data-mu-add]');
  if (add) add.onclick = async (e) => {
    e.stopPropagation();
    const u = createUnit();
    mechUnits(oi).push(u);
    select(u.id);
    await rerender();
    // Новая единица начинается с классификации — туда и ставим фокус. Фокус —
    // на видимую кнопку списка: нативный <select> скрыт (kernel/dropdown.js),
    // и фокус на нём с клавиатуры не виден и не открывает список.
    const cls = s.$('[data-mu-cls]');
    const q = s.$('#q-mech-unit');
    if (q) q.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const btn = cls && cls.parentElement ? cls.parentElement.querySelector('[data-pick-btn]') : null;
    (btn || cls)?.focus();
  };

  // Название списка — производная подпись ОИ меняется по ходу набора,
  // карточка при этом не перерисовывается.
  const group = s.$('[data-mu-group]');
  if (group) group.oninput = () => {
    oi.groupName = group.value.trim();
    syncMechName(oi);
    ctx.updatePlate();
  };

  s.$$('[data-mu-step]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const list = mechUnits(oi);
    const at = list.indexOf(unit) + +b.dataset.muStep;
    if (at < 0 || at >= list.length) return;
    select(list[at].id);
    ctx.render();
  });

  if (!unit) return;
  select(unit.id);

  // --- Классификация --------------------------------------------------------

  const cls = s.$('[data-mu-cls]');
  if (cls) cls.onchange = () => { setClass(unit, cls.value); rerender(); };

  const sub = s.$('[data-mu-sub]');
  if (sub) sub.onchange = () => { setSub(unit, sub.value); rerender(); };

  const type = s.$('[data-mu-type]');
  if (type) type.onchange = () => { unit.type = type.value; rerender(); };

  // --- Общие сведения -------------------------------------------------------

  const name = s.$('[data-mu-name]');
  if (name) name.oninput = () => { unit.name = name.value; refreshList(); };

  const inv = s.$('[data-mu-inv]');
  if (inv) inv.oninput = () => { unit.inv = inv.value; };

  const country = s.$('[data-mu-country]');
  if (country) country.oninput = () => { unit.country = country.value; };

  const year = s.$('[data-mu-year]');
  bindCheckedField(year, yearError, (v) => { unit.year = v; refreshList(); });

  const maker = s.$('[data-mu-maker]');
  if (maker) maker.oninput = () => { unit.maker = maker.value; };

  const qty = s.$('[data-mu-qty]');
  bindCheckedField(qty, qtyError, (v) => { unit.qty = String(+v); refreshList(); });

  bindNumField(s.$('[data-mu-cost]'), (v) => { unit.cost = v; refreshList(); });

  // --- Параметры ------------------------------------------------------------

  // Поля категории (data/mechFields.js). Все виды значений пишутся одинаково —
  // по ключу поля; единица измерения лежит отдельным ключом «<ключ>@unit», это
  // разные сведения: «400» и «кВА».
  //
  // Списки и даты пишутся по change, текст и числа — по ходу набора: список
  // меняется целиком, а в текст можно вписать что угодно и передумать.
  const write = (key, value) => {
    unit.params = unit.params || {};
    if (value) unit.params[key] = value;
    else delete unit.params[key];
  };

  s.$$('[data-mu-f]').forEach((el) => {
    const key = el.dataset.muF;
    const set = () => write(key, el.value);
    if (el.tagName === 'SELECT' || el.type === 'date') el.onchange = set;
    else el.oninput = set;
  });

  s.$$('[data-mu-unit]').forEach((el) => {
    el.onchange = () => write(el.dataset.muUnit + '@unit', el.value);
  });

  // --- Комментарий ----------------------------------------------------------
  // Поле растёт по тексту: прокрутка внутри маленького окошка прячет
  // написанное, а комментарий как раз и читают целиком.
  const comment = s.$('[data-mu-comment]');
  if (comment) {
    const grow = () => {
      comment.style.height = 'auto';
      comment.style.height = comment.scrollHeight + 2 + 'px';
    };
    comment.oninput = () => { unit.comment = comment.value; grow(); };
    grow();
  }

  // --- Свои поля ------------------------------------------------------------

  const fieldOf = (id) => (unit.extra || []).find((f) => f.id === id);

  s.$$('[data-mu-xlabel]').forEach((inp) => inp.oninput = () => {
    const f = fieldOf(inp.dataset.muXlabel);
    if (f) f.label = inp.value;
  });
  s.$$('[data-mu-xvalue]').forEach((inp) => inp.oninput = () => {
    const f = fieldOf(inp.dataset.muXvalue);
    if (f) f.value = inp.value;
  });
  s.$$('[data-mu-xdel]').forEach((b) => b.onclick = () => {
    unit.extra = (unit.extra || []).filter((f) => f.id !== b.dataset.muXdel);
    ctx.render();
  });

  const xadd = s.$('[data-mu-xadd]');
  if (xadd) xadd.onclick = async () => {
    const f = { id: `mf-${Date.now().toString(36)}-${fieldSeq++}`, label: '', value: '' };
    unit.extra = [...(unit.extra || []), f];
    await ctx.render();
    const inp = s.$(`[data-mu-xlabel="${f.id}"]`);
    if (inp) inp.focus();
  };

  // --- Фото -----------------------------------------------------------------

  const padd = s.$('[data-mu-photo-add]');
  if (padd) padd.onclick = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    if (isFileTooLarge(file)) {
      ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn');
      return;
    }
    addPhotoFile(oi, unit.id, await attachedFileFrom(file));
    ctx.render();
    ctx.toast('Фото загружено: ' + file.name, 'ok');
  };

  // Фото открывается в общем просмотрщике — с лентой, зумом и поворотом, как
  // у литер. Номер страницы — сквозной по всем снимкам ОИ.
  s.$$('[data-mu-photo]').forEach((b) => b.onclick = () => {
    const i = +b.dataset.muPhoto;
    const at = photoPages(oi).findIndex((p) => p.cat === unit.id && p.i === i);
    openPhotoInPlace(ctx, oi.id, at + 1);
  });
}
