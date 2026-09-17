import { esc } from '../../kernel/dom.js';
import { msDropBodyHTML } from '../../kernel/multiSelect.js';
import { vehicleViewerHTML } from './viewer.js';

const TYPES = [
  ['passenger', 'Легковое'], ['cargo', 'Грузовое'], ['special', 'Спецтехника'], ['trailer', 'Прицепы и полуприцепы'],
];
const GEARBOX = ['МКПП', 'АКПП', 'Вариатор'];
const FUEL = ['Бензин', 'Дизель', 'Газ', 'Электро', 'Гибрид'];
const CARGO_TYPES = ['Бортовой', 'Тентованный', 'Фургон', 'Изотермический', 'Рефрижератор', 'Самосвал', 'Седельный тягач', 'Автовоз', 'Контейнеровоз', 'Цистерна', 'Длинномер', 'Манипулятор', 'Бетоносмеситель', 'Бетононасос', 'Мусоровоз', 'Снегоуборщик', 'Скотовоз', 'Зерновоз', 'Трал'];
const SPECIAL_TYPES = ['Погрузчик', 'Экскаватор', 'Бульдозер', 'Грейдер', 'Фронтальный погрузчик', 'Вилочный погрузчик', 'Трактор', 'Автокран', 'Каток', 'Самосвал', 'Трал', 'Мусоровоз', 'Поливомоечная', 'Манипулятор', 'Автовышка', 'Пожарная', 'Лестница', 'Автоцистерна', 'Бензовоз', 'Водовоз', 'Бетоносмеситель'];
const TRAILER_TYPES = ['Прицеп', 'Полуприцеп'];
const BODY_TYPES = ['Тент', 'Платформа', 'Рефрижератор', 'Самосвал', 'Бортовой', 'Цельный фургон', 'Цистерна', 'Животновоз', 'Автовоз', 'Иное'];

function selectField(label, key, values, rec, extra = '') {
  return `<div class="field"><label>${label}</label><select class="select" data-vehicle-field="${key}" ${extra}><option value="">Не выбрано</option>${values.map((value) => `<option value="${esc(value)}" ${rec.vehicle[key] === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>`;
}
function inputField(label, key, rec, type = 'text') {
  return `<div class="field"><label>${label}</label><input class="input" type="${type}" data-vehicle-field="${key}" value="${esc(rec.vehicle[key] || '')}"></div>`;
}
function multiSelect(label, key, values, rec) {
  const selected = rec.vehicle[key] || [];
  const summary = selected.length ? selected.join(', ') : 'Не выбрано';
  return `<div class="field sp-all" data-vehicle-ms="${key}"><label>${label}</label><div class="ms"><div class="ms-control" data-ms-toggle title="Открыть список"><span class="ms-summary" title="${esc(summary)}">${esc(summary)}</span><span class="chev">▾</span></div><div class="ms-drop" hidden>${msDropBodyHTML({ options: values, selected, optAttr: `vehicle-${key}` })}</div></div></div>`;
}
function specificFields(rec) {
  const type = rec.vehicle.type;
  if (!type) return `<div class="vehicle-note">Выберите тип ТС, чтобы заполнить специальные параметры.</div>`;
  if (type === 'passenger') return `<div class="grid g-4 g-roomy">${inputField('Объем двигателя, куб. см', 'engine', rec, 'number')}${selectField('Тип КПП', 'gearbox', GEARBOX, rec)}${multiSelect('Тип топлива с завода', 'fuel', FUEL, rec)}${inputField('Тип кузова', 'body', rec)}${selectField('Расположение руля', 'steering', ['Справа', 'Слева'], rec)}${inputField('Прочие особенности', 'features', rec)}</div>`;
  if (type === 'cargo') return `<div class="grid g-4 g-roomy">${selectField('Тип', 'specialType', CARGO_TYPES, rec)}${inputField('Объем двигателя, куб. см', 'engine', rec, 'number')}${inputField('Грузоподъемность', 'loadCapacity', rec)}${selectField('Тип КПП', 'gearbox', GEARBOX, rec)}${multiSelect('Тип топлива с завода', 'fuel', FUEL, rec)}${selectField('Расположение руля', 'steering', ['Справа', 'Слева'], rec)}${inputField('Прочие особенности', 'features', rec)}</div>`;
  if (type === 'special') return `<div class="grid g-4 g-roomy">${selectField('Тип', 'specialType', SPECIAL_TYPES, rec)}${inputField('Грузоподъемность', 'loadCapacity', rec)}${inputField('Объем двигателя, куб. см', 'engine', rec, 'number')}${selectField('Тип КПП', 'gearbox', GEARBOX, rec)}${multiSelect('Тип топлива с завода', 'fuel', FUEL, rec)}${selectField('Расположение руля', 'steering', ['Справа', 'Слева'], rec)}${inputField('Особенности', 'features', rec)}</div>`;
  return `<div class="grid g-4 g-roomy">${selectField('Тип', 'specialType', TRAILER_TYPES, rec)}${selectField('Тип кузова', 'body', BODY_TYPES, rec)}${rec.vehicle.body === 'Иное' ? inputField('Укажите тип кузова', 'otherBody', rec) : ''}${inputField('Грузоподъемность', 'loadCapacity', rec)}${inputField('Количество осей', 'axles', rec, 'number')}${inputField('Прочие особенности', 'features', rec)}</div>`;
}

function formHTML(rec) {
  const vehicleType = `<div class="field"><label>Тип ТС</label><select class="select" data-vehicle-field="type"><option value="">Не выбрано</option>${TYPES.map(([value, label]) => `<option value="${value}" ${rec.vehicle.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
  return `<div class="vehicle-form"><div class="vehicle-actions"><button class="back-btn" data-vehicle-back>← К объектам оценки</button><span class="pill pill-gray">Создание ОЦ</span><button class="btn btn-primary" data-vehicle-save>Сохранить</button></div>
    <div class="card t-blue"><div class="card-head"><span class="card-idx">01</span><h3>Общие параметры транспортного средства</h3></div><div class="card-pad"><div class="grid g-4 g-roomy">
      ${vehicleType}
      ${inputField('Марка', 'brand', rec)}${inputField('Модель', 'model', rec)}${inputField('Госномер', 'plate', rec)}${inputField('Год выпуска', 'year', rec, 'number')}${inputField('Цвет', 'color', rec)}${inputField('VIN-код', 'vin', rec)}<div class="field sp-all"><label>Особые отметки</label><textarea class="input" data-vehicle-field="notes">${esc(rec.vehicle.notes || '')}</textarea></div>
    </div></div></div>
    <div class="card t-teal"><div class="card-head"><span class="card-idx">02</span><h3>Параметры выбранного типа</h3></div><div class="card-pad">${specificFields(rec)}</div></div></div>`;
}

export function viewVehicle(ctx) {
  return `<div class="view-head"><span class="pill pill-gray">${esc(ctx.rec.vehicle.brand || 'Транспортное средство')} · ${esc(ctx.rec.vehicle.model || 'новая карточка')}</span><span class="muted">${esc(ctx.rec.vehicle.plate || 'Госномер не указан')}</span></div><div class="split vehicle-split">${vehicleViewerHTML(ctx)}<div class="vsplit"></div><div class="grow">${formHTML(ctx.rec)}</div></div>`;
}
