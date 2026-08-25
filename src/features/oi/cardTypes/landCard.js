import { esc } from '../../../core/utils.js';
import { DICT } from '../../../core/dictionaries.js';
import { docsBlockInner } from '../../docs/docsTable.js';
import { photoAccordions } from '../../photos/photoBlocks.js';

const INFRA_OPTIONS = ['Подведены', 'Проходят рядом', 'На удалении', 'Отсутствуют в районе'];
const AGRICULTURAL_USE_OPTIONS = ['Орошаемая пашня', 'Богара', 'Сенокос', 'Птицефабрика', 'Кошара', 'Иное'];
const IRRIGATION_OPTIONS = ['Хорошая', 'Средняя', 'Ограничена', 'Отсутствует'];
const AREA_LOCATION_OPTIONS = ['В центре населенного пункта', 'На окраине населенного пункта'];
const ROAD_LOCATION_OPTIONS = [
  'На междугородней трассе — первая линия',
  'На междугородней трассе — вторая линия',
  'Вблизи междугородней трассы (до 300 м)',
  'На центральной трассе населенного пункта — первая линия',
  'На центральной трассе населенного пункта — вторая линия',
  'Вблизи центральной трассы населенного пункта',
  'Внутри района',
  'В глубине района',
];
const CORNER_OPTIONS = ['Угловой', 'Неугловой'];
const LAND_TYPE_OPTIONS = [
  ['nonAgricultural', 'Несельскохозяйственный'],
  ['agricultural', 'Сельскохозяйственный'],
];

function selectOptions(options, value) {
  return options.map((option) => `<option ${option === value ? 'selected' : ''}>${option}</option>`).join('');
}

function landSelect(label, key, options, value) {
  const statusAttribute = key === 'status' ? ' data-status' : '';
  return `<div class="field"><label>${label}</label><select class="select" data-land-field="${key}"${statusAttribute}>${selectOptions(options, value || '')}</select></div>`;
}

function landInput(label, key, value, type = 'text') {
  const eniAttribute = key === 'eni' ? ' data-oi-eni' : '';
  return `<div class="field"><label>${label}</label><input class="input" type="${type}" data-land-field="${key}"${eniAttribute} value="${esc(value || '')}"></div>`;
}

export const landCard = {
  id: 'land',
  label: 'Земельный участок',
  kind: 'land',

  render(oi) {
    const landType = oi.landType || 'nonAgricultural';
    const hasEncumbrance = oi.hasEncumbrance === true;
    const hasBuildings = oi.hasBuildings === true;

    return `<div class="oi-stack">
      <div class="card t-teal">
        <div class="card-head">
          <span class="card-idx">01</span>
          <h3>Земельный участок</h3>
        </div>

        <div class="card-pad">
          <div class="grid g-4">
            <div class="field">
              <label>Тип земельного участка</label>
              <select class="select" data-land-type>
                ${LAND_TYPE_OPTIONS.map(([value, label]) => `<option value="${value}" ${value === landType ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>
            ${landInput('ЕНИ', 'eni', oi.eni)}
            ${landInput('Назначение', 'purpose', oi.purpose)}
            ${landInput('Площадь по правоустанавливающим документам, кв.м', 'documentArea', oi.documentArea, 'number')}
            ${landInput('Площадь по факту, кв.м', 'factArea', oi.factArea, 'number')}
            ${landInput('Права на земельный участок', 'rights', oi.rights)}
            ${landInput('Форма', 'shape', oi.shape)}
            ${landSelect('Расположение в районе', 'areaLocation', AREA_LOCATION_OPTIONS, oi.areaLocation)}
            ${landInput('Особенности местоположения', 'locationFeatures', oi.locationFeatures)}
            ${landSelect('Расположение к трассе', 'roadLocation', ROAD_LOCATION_OPTIONS, oi.roadLocation)}
            ${landSelect('Угловой/Неугловой', 'corner', CORNER_OPTIONS, oi.corner)}
          </div>

          ${landType === 'nonAgricultural' ? `<div class="sec-h">Несельскохозяйственный участок</div>
          <div class="grid g-4">
            ${landInput('Застроенная площадь земельного участка, кв.м', 'builtArea', oi.builtArea, 'number')}
            ${landSelect('Наличие газификации', 'gasification', INFRA_OPTIONS, oi.gasification)}
            ${landSelect('Наличие центрального отопления', 'centralHeating', INFRA_OPTIONS, oi.centralHeating)}
            ${landSelect('Наличие центрального водоснабжения', 'centralWater', INFRA_OPTIONS, oi.centralWater)}
            ${landSelect('Наличие автономного отопления', 'autonomousHeating', INFRA_OPTIONS, oi.autonomousHeating)}
          </div>` : `<div class="sec-h">Сельскохозяйственный участок</div>
          <div class="grid g-4">
            ${landSelect('Категория и разрешенное использование', 'agriculturalUse', AGRICULTURAL_USE_OPTIONS, oi.agriculturalUse)}
            ${landSelect('Доступность полива', 'irrigation', IRRIGATION_OPTIONS, oi.irrigation)}
            ${landInput('Тип почвы', 'soilType', oi.soilType)}
            ${landInput('Балл бонитета', 'bonitetScore', oi.bonitetScore, 'number')}
            ${landInput('Каменистость', 'stoniness', oi.stoniness)}
            <div class="field"><label>Коммуникации</label><div class="inline-row">
              ${['electricity', 'waterSupply', 'sewerage', 'centralHeatingComm'].map((key) => `<label class="flag-lbl"><input type="checkbox" data-land-communication="${key}" ${oi.communications && oi.communications[key] ? 'checked' : ''}> ${({ electricity: 'Электричество', waterSupply: 'Водопровод', sewerage: 'Канализация', centralHeatingComm: 'Центральное отопление' })[key]}</label>`).join('')}
            </div></div>
          </div>`}

          <div class="grid g-4">
            <div class="field">
              <label>Наличие сервитутов и обременений</label>
              <select class="select" data-land-encumbrance>
                <option value="false" ${hasEncumbrance ? '' : 'selected'}>Нет</option>
                <option value="true" ${hasEncumbrance ? 'selected' : ''}>Есть</option>
              </select>
            </div>
            ${landInput(`Площадь сервитутов и обременений, кв.м${hasEncumbrance ? '<span class="req">*</span>' : ''}`, 'encumbranceArea', oi.encumbranceArea, 'number').replace('">', `${hasEncumbrance ? '" required' : '"'}>`)}
            <div class="field">
              <label>Наличие построек</label>
              <select class="select" data-land-buildings>
                <option value="false" ${hasBuildings ? '' : 'selected'}>Нет</option>
                <option value="true" ${hasBuildings ? 'selected' : ''}>Есть</option>
              </select>
            </div>
            ${landInput(`Тип построек${hasBuildings ? '<span class="req">*</span>' : ''}`, 'buildingsType', oi.buildingsType).replace('">', `${hasBuildings ? '" required' : '"'}>`)}
            ${landInput(`Площадь построек, кв.м${hasBuildings ? '<span class="req">*</span>' : ''}`, 'buildingsArea', oi.buildingsArea, 'number').replace('">', `${hasBuildings ? '" required' : '"'}>`)}
            ${landSelect('Статус', 'status', DICT.statusBuild, oi.status)}
          </div>

          <div class="sec-h">Планы участка</div>
          <div class="grid g-2">
            ${landInput('План участка из госакта', 'stateActPlan', oi.stateActPlan)}
            ${landInput('План участка из техпаспорта', 'technicalPassportPlan', oi.technicalPassportPlan)}
          </div>
        </div>
      </div>

      <div class="card t-slate">
        <div class="card-head">
          <span class="card-idx">02</span>
          <h3>Документы</h3>
        </div>

        <div class="card-pad">
          ${docsBlockInner(oi, oi.id)}
        </div>
      </div>

      <div class="card t-blue">
        <div class="card-head" data-card-toggle>
          <span class="card-idx">03</span>
          <h3>Фото по категориям</h3>
          <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button>
          <span class="chev">▾</span>
        </div>

        <div class="card-body-wrap"><div class="card-pad">
          ${photoAccordions(oi, true)}
        </div></div>
      </div>
    </div>`;
  },

  bind() {
    // Общие поля участка уже обрабатываются контроллером ОИ.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование земельного участка');
    }

    if (oi.hasEncumbrance && !String(oi.encumbranceArea || '').trim()) {
      errors.push('Не заполнена площадь сервитутов и обременений');
    }

    if (oi.hasBuildings && !String(oi.buildingsType || '').trim()) {
      errors.push('Не заполнен тип построек');
    }

    if (oi.hasBuildings && !String(oi.buildingsArea || '').trim()) {
      errors.push('Не заполнена площадь построек');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};