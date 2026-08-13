import { esc } from '../../../core/utils.js';
import {
  DICT,
  APARTMENT_SERIES,
  APARTMENT_LOCATIONS,
  APARTMENT_RIGHTS,
} from '../../../core/dictionaries.js';
import {
  letterControl,
  renderRealtyStructCard,
  renderOiDocsCard,
  renderOiPhotosCard,
} from './realtySections.js';

export const realtyApartmentCard = {
  id: 'realty_apartment',
  label: 'Квартира',
  kind: 'realty',

  render(oi) {
    const f = oi.flags || {};
    const isMl = (oi.origin || 'manual') === 'ml';
    const areas = oi.areas || {};
    const apt = oi.apartment || {};

    return `<div class="oi-stack">
      <div class="card t-blue" id="q-gen">
        <div class="card-head" data-card-toggle>
          <span class="card-idx">01</span>
          <h3>Общие параметры квартиры</h3>
          <span class="hint">${esc(oi.name)}</span>
          <span class="chev">▾</span>
        </div>
        <div class="card-body-wrap"><div class="card-pad">
          <div class="inline-row" style="margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div class="field" style="flex:0 0 auto;">
              <label>Литера</label>
              ${letterControl(oi)}
            </div>
            <div class="field" style="flex:1 1 180px;">
              <label>Наименование</label>
              <input class="input" style="width:100%;" data-oi-name value="${esc(oi.name)}">
            </div>
            <div class="field" style="flex:0 0 150px;">
              <label>Статус</label>
              <select class="select" style="width:100%;" data-status>
                ${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
              </select>
            </div>
            <div class="field" style="flex:0 0 160px;">
              <label>ЕНИ код</label>
              <input class="eni-corner" style="width:100%;" data-oi-eni value="${esc(oi.eni)}" title="ЕНИ-код">
            </div>
          </div>

          <div class="inline-row" style="margin-bottom:10px">
            <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
            ${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
          </div>

          <div class="grid g-4">
            <div class="field">
              <label>Год постройки</label>
              <input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric">
            </div>
            <div class="field">
              <label>Этаж расположения</label>
              <input class="input" data-apt-floor value="${esc(apt.floor || '')}" inputmode="numeric">
            </div>
            <div class="field">
              <label>Количество этажей в квартире</label>
              <input class="input" data-apt-storeys value="${esc(apt.storeys || '')}"
                     inputmode="numeric" min="1" max="30" placeholder="до 30">
            </div>
            <div class="field">
              <label>Количество комнат</label>
              <input class="input" data-apt-rooms value="${esc(apt.rooms || '')}" inputmode="numeric">
            </div>
          </div>

          <div class="grid g-2" style="margin-top:10px">
            <div class="field">
              <label>Серия</label>
              <div class="dd dd-combo" data-series-dd>
                <div class="dd-combo-input-wrap">
                  <input class="input" data-apt-series value="${esc(apt.series || '')}"
                         placeholder="Введите или выберите серию" autocomplete="off">
                  <button type="button" class="dd-combo-toggle" data-series-toggle
                          title="Показать варианты">▾</button>
                </div>
                <div class="dd-menu dd-menu-series" data-series-menu>
                  ${APARTMENT_SERIES.map((s) => `<button type="button" data-series-opt="${esc(s)}">${esc(s)}</button>`).join('')}
                </div>
              </div>
            </div>
            <div class="field">
              <label>Положение на этаже</label>
              <div class="inline-row">
                <select class="select" data-apt-location style="flex:1 1 160px;">
                  <option value="">Не выбрано</option>
                  ${APARTMENT_LOCATIONS.map((l) => `<option ${l === apt.location ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
                <input class="input" data-apt-location-other
                       placeholder="Укажите положение"
                       value="${esc(apt.locationOther || '')}"
                       maxlength="50"
                       style="flex:1 1 160px; ${apt.location === 'Прочее' ? '' : 'display:none;'}">
              </div>
            </div>
          </div>

          <div class="grid g-2" style="margin-top:10px">
            <div class="field">
              <label>Права на строение</label>
              <div class="inline-row">
                <select class="select" data-apt-rights style="flex:1 1 200px;">
                  <option value="">Не выбрано</option>
                  ${APARTMENT_RIGHTS.map((r) => `<option ${r === apt.rights ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
                <input class="input" data-apt-rights-other
                       placeholder="Укажите право"
                       value="${esc(apt.rightsOther || '')}"
                       maxlength="100"
                       style="flex:1 1 200px; ${apt.rights === 'Иное' ? '' : 'display:none;'}">
              </div>
            </div>
          </div>
        </div></div>
      </div>

      <div class="card t-blue" id="q-areas">
        <div class="card-head" data-card-toggle>
          <span class="card-idx">02</span>
          <h3>Площади квартиры</h3>
          <span class="chev">▾</span>
        </div>
        <div class="card-body-wrap"><div class="card-pad">
          <div class="grid g-4">
            <div class="field">
              <label>Общая площадь, м²</label>
              <input class="input" data-area="tp" value="${esc(areas.tp || '')}">
            </div>
            <div class="field">
              <label>Жилая площадь, м²</label>
              <input class="input" data-area="living" value="${esc(areas.living || '')}">
            </div>
            <div class="field">
              <label>Площадь по ПУД, м²</label>
              <input class="input" data-area="pud" value="${esc(areas.pud || '')}">
            </div>
            <div class="field">
              <label>Площадь по факту, м²</label>
              <input class="input" data-area="fact" value="${esc(areas.fact || '')}">
            </div>
          </div>

          <div class="sec-h" style="margin-top:14px">Лоджии и балконы</div>
          <div class="grid g-4">
            <div class="field">
              <label>Кол-во лоджий</label>
              <input class="input" data-apt-loggia-count
                     value="${esc(apt.loggiaCount || '')}"
                     inputmode="numeric" min="0" max="10" placeholder="до 10">
            </div>
            <div class="field">
              <label>Кол-во балконов / террас</label>
              <input class="input" data-apt-balcony-count
                     value="${esc(apt.balconyCount || '')}"
                     inputmode="numeric" min="0" max="10" placeholder="до 10">
            </div>
            <div class="field">
              <label>Площадь застройки лоджий, м²</label>
              <input class="input" data-apt-loggia-area
                     value="${esc(apt.loggiaBuildArea || '')}"
                     inputmode="decimal" min="0" max="500" placeholder="до 500">
            </div>
            <div class="field">
              <label>Площадь застройки балконов / террас, м²</label>
              <input class="input" data-apt-balcony-area
                     value="${esc(apt.balconyBuildArea || '')}"
                     inputmode="decimal" min="0" max="500" placeholder="до 500">
            </div>
          </div>
        </div></div>
      </div>

      ${renderRealtyStructCard(oi)}
      ${renderOiDocsCard(oi)}
      ${renderOiPhotosCard(oi)}
    </div>`;
  },

  bind(oi) {
    const ensureApartment = () => {
      if (!oi.apartment) oi.apartment = {};
      return oi.apartment;
    };

    const bindField = (selector, key) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.onchange = () => {
        ensureApartment()[key] = el.value;
      };
    };

    bindField('[data-apt-floor]', 'floor');
    bindField('[data-apt-storeys]', 'storeys');
    bindField('[data-apt-rooms]', 'rooms');
    bindField('[data-apt-series]', 'series');
    bindField('[data-apt-loggia-count]', 'loggiaCount');
    bindField('[data-apt-balcony-count]', 'balconyCount');
    bindField('[data-apt-loggia-area]', 'loggiaBuildArea');
    bindField('[data-apt-balcony-area]', 'balconyBuildArea');

    const locationSelect = document.querySelector('[data-apt-location]');
    if (locationSelect) {
      locationSelect.onchange = () => {
        const apt = ensureApartment();
        apt.location = locationSelect.value;
        const otherInput = document.querySelector('[data-apt-location-other]');
        if (otherInput) {
          otherInput.style.display = apt.location === 'Прочее' ? '' : 'none';
          if (apt.location !== 'Прочее') {
            otherInput.value = '';
            apt.locationOther = '';
          }
        }
      };
    }

    const locationOther = document.querySelector('[data-apt-location-other]');
    if (locationOther) {
      locationOther.onchange = () => {
        ensureApartment().locationOther = locationOther.value;
      };
    }

    const rightsSelect = document.querySelector('[data-apt-rights]');
    if (rightsSelect) {
      rightsSelect.onchange = () => {
        const apt = ensureApartment();
        apt.rights = rightsSelect.value;
        const otherInput = document.querySelector('[data-apt-rights-other]');
        if (otherInput) {
          otherInput.style.display = apt.rights === 'Иное' ? '' : 'none';
          if (apt.rights !== 'Иное') {
            otherInput.value = '';
            apt.rightsOther = '';
          }
        }
      };
    }

    const rightsOther = document.querySelector('[data-apt-rights-other]');
    if (rightsOther) {
      rightsOther.onchange = () => {
        ensureApartment().rightsOther = rightsOther.value;
      };
    }

    bindSeriesDropdown();
  },

  validate(oi) {
    const errors = [];
    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование квартиры');
    }
    const apt = oi.apartment || {};
    const checkRange = (value, min, max, label) => {
      if (value === '' || value === undefined || value === null) return;
      const n = Number(value);
      if (isNaN(n) || n < min || n > max) {
        errors.push(`${label}: допустимое значение от ${min} до ${max}`);
      }
    };
    checkRange(apt.storeys, 1, 30, 'Этажность квартиры');
    checkRange(apt.loggiaCount, 0, 10, 'Кол-во лоджий');
    checkRange(apt.balconyCount, 0, 10, 'Кол-во балконов/террас');
    checkRange(apt.loggiaBuildArea, 0, 500, 'Площадь застройки лоджий');
    checkRange(apt.balconyBuildArea, 0, 500, 'Площадь застройки балконов/террас');
    return { valid: errors.length === 0, errors };
  },
};

function bindSeriesDropdown() {
  const dd = document.querySelector('[data-series-dd]');
  const menu = document.querySelector('[data-series-menu]');
  const toggle = document.querySelector('[data-series-toggle]');
  const input = document.querySelector('[data-apt-series]');
  if (!dd || !menu || !input) return;

  const filterOptions = () => {
    const val = (input.value || '').toLowerCase().trim();
    menu.querySelectorAll('[data-series-opt]').forEach((btn) => {
      const optVal = (btn.dataset.seriesOpt || '').toLowerCase();
      btn.style.display = (!val || optVal.includes(val)) ? '' : 'none';
    });
  };

  const openMenu = () => {
    document.querySelectorAll('.dd.open').forEach((d) => {
      if (d !== dd) d.classList.remove('open');
    });
    dd.classList.add('open');
    filterOptions();
  };

  const closeMenu = () => {
    dd.classList.remove('open');
  };

  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dd.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
        input.focus();
      }
    });
  }

  input.addEventListener('focus', openMenu);
  input.addEventListener('input', () => {
    if (!dd.classList.contains('open')) {
      openMenu();
    } else {
      filterOptions();
    }
  });

  menu.querySelectorAll('[data-series-opt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = btn.dataset.seriesOpt || '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu();
    });
  });
}