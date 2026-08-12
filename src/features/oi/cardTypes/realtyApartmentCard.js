import { esc } from '../../../core/utils.js';
import { DICT, APARTMENT_SERIES, APARTMENT_LOCATIONS } from '../../../core/dictionaries.js';
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
          <div class="grid g-3">
            <div class="field">
              <label>Год постройки</label>
              <input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric">
            </div>
            <div class="field">
              <label>Этаж расположения</label>
              <input class="input" data-apartment-floor value="${esc(oi.apartmentFloor || '')}">
            </div>
            <div class="field">
              <label>Количество комнат</label>
              <input class="input" data-apartment-rooms value="${esc(oi.rooms || '')}">
            </div>
          </div>
          <div class="grid g-2" style="margin-top:10px">
            <div class="field">
              <label>Серия</label>
              <div class="dd dd-combo" data-series-dd>
                <div class="dd-combo-input-wrap">
                  <input class="input" data-apt-series value="${esc(apt.series || '')}" placeholder="Введите или выберите серию" autocomplete="off">
                  <button type="button" class="dd-combo-toggle" data-series-toggle title="Показать варианты">▾</button>
                </div>
                <div class="dd-menu dd-menu-series" data-series-menu>
                  ${APARTMENT_SERIES.map((series) => `<button type="button" data-series-opt="${esc(series)}">${esc(series)}</button>`).join('')}
                </div>
              </div>
            </div>
            <div class="field">
              <label>Расположение</label>
              <div class="inline-row">
                <select class="select" data-apt-location style="flex:1 1 160px;">
                  <option value="">Не выбрано</option>
                  ${APARTMENT_LOCATIONS.map((location) => `<option ${location === apt.location ? 'selected' : ''}>${location}</option>`).join('')}
                </select>
                <input
                  class="input"
                  data-apt-location-other
                  placeholder="Укажите положение"
                  value="${esc(apt.locationOther || '')}"
                  style="flex:1 1 160px; ${apt.location === 'Прочее' ? '' : 'display:none;'}"
                >
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
        </div></div>
      </div>
      ${renderRealtyStructCard(oi)}
      ${renderOiDocsCard(oi)}
      ${renderOiPhotosCard(oi)}
    </div>`;
  },
  bind(oi) {
    const floorInput = document.querySelector('[data-apartment-floor]');
    if (floorInput) {
      floorInput.onchange = () => {
        oi.apartmentFloor = floorInput.value;
      };
    }
    const roomsInput = document.querySelector('[data-apartment-rooms]');
    if (roomsInput) {
      roomsInput.onchange = () => {
        oi.rooms = roomsInput.value;
      };
    }
    const seriesInput = document.querySelector('[data-apt-series]');
    if (seriesInput) {
      seriesInput.onchange = () => {
        if (!oi.apartment) oi.apartment = {};
        oi.apartment.series = seriesInput.value;
      };
    }
    bindSeriesDropdown();
  },
  validate(oi) {
    const errors = [];
    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование квартиры');
    }
    return {
      valid: errors.length === 0,
      errors,
    };
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