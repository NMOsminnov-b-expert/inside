// Инженерные сети объекта имущества — строения и квартиры (решения
// пользователя 16.10.2026, запись графа inzhenernye-seti-v-kazhdom-oi-…).
//
// Значение поля у ОИ — по старшинству: своё значение ОИ → значение участка,
// за которым закреплена литера (oi.landId; не закреплена, а участок у ЕНИ
// есть — первый участок: «Считаем на участке») → значение по умолчанию по виду
// ОИ («уже выставленные. Их можно менять»). Хранится только своё (oi.nets):
// значения участка и по умолчанию подставляются при показе, поэтому правка
// участка сама доходит до ОИ, где значение не меняли.
//
// Перечни — те же, что у сетей участка, и те же справочники (слоты 'land'):
// правка перечня в «Справочниках» действует на оба места. Живёт рядом с
// карточкой участка — её двери пользуются все модули недвижимости.
//
// Блок свёрнут, если ОИ на участке, и открыт, если участка нет («он скрыт
// (просто свернут), если литера на участке и открыт, если без участка»).
import { esc } from '../../../../kernel/dom.js';
import { emptyOptionHTML } from '../../../../kernel/emptyOption.js';
import {
  LAND_ELECTRICITY_STATUS, LAND_WATER_STATUS, LAND_SEWERAGE_STATUS, LAND_GAS_STATUS, LAND_HEATING_STATUS,
} from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { confirmDialog } from '../../../../kernel/dialog.js';

// Поля — ключи те же, что у участка. Отопление — прежний перечень и без
// значения по умолчанию: типы отопления — постоянный вопрос
// (tipy-otopleniya-v-inzhenernyh-setyah-oi).
export const OI_NETS = [
  { key: 'electricity', label: 'Наличие электроснабжения', list: LAND_ELECTRICITY_STATUS },
  { key: 'centralWater', label: 'Наличие водоснабжения', list: LAND_WATER_STATUS },
  { key: 'sewerage', label: 'Наличие канализации', list: LAND_SEWERAGE_STATUS },
  { key: 'gasification', label: 'Наличие газификации', list: LAND_GAS_STATUS },
  { key: 'centralHeating', label: 'Наличие отопления', list: LAND_HEATING_STATUS },
];

const ON = 'Подведены';
// Значения по умолчанию по виду ОИ («У квартир… вода, канализация,
// электричество. У производственных… электричество. Административные — вода,
// свет, канализация. Жилые дома — свет, вода, канализация»). Канализация — пусто:
// у неё важен тип («с по умолчанию лучше оставить пустым»).
const DEFAULTS = {
  flat: { centralWater: ON, electricity: ON },
  house: { centralWater: ON, electricity: ON },
  civil: { centralWater: ON, electricity: ON },
  prod: { electricity: ON },
  other: {},
};
const KIND_LABEL = { flat: 'квартиры', house: 'жилого дома', civil: 'гражданского здания', prod: 'производственного', other: '' };

// Прежнее «Подведены» у канализации — до типов в перечне (16.10.2026). Решение
// пользователя: «просто очисти. Это — макет» — значение сбрасывается в пустое.
export function cleanLegacyNets(o) {
  if (!o) return;
  if (o.sewerage === 'Подведены') o.sewerage = '';
  if (o.nets && o.nets.sewerage === 'Подведены') delete o.nets.sewerage;
}

export function netsKindOf(oi) {
  if (!oi) return 'other';
  if (oi.card === 'apartment') return 'flat';
  if (oi.residential) return 'house';
  if (oi.litKind === 'prod') return 'prod';
  if (oi.litKind === 'civil') return 'civil';
  return 'other';
}

// Участок ОИ: за которым закреплён; не закреплён — первый участок записи.
export function netsLandOf(rec, oi) {
  const lands = ((rec && rec.oi) || []).filter((o) => o.card === 'land');
  if (!lands.length) return null;
  return lands.find((l) => l.id === (oi && oi.landId)) || lands[0];
}

// Значение и источник: own — своё, land — от участка, default — по умолчанию.
export function netValue(rec, oi, key) {
  const own = ((oi && oi.nets) || {})[key];
  if (own) return { value: own, src: 'own' };
  const land = netsLandOf(rec, oi);
  if (land && land[key]) return { value: land[key], src: 'land' };
  const def = (DEFAULTS[netsKindOf(oi)] || {})[key];
  if (def) return { value: def, src: 'default' };
  return { value: '', src: '' };
}

// Что было бы без своего значения — для «вернуть».
function inherited(rec, oi, key) {
  const land = netsLandOf(rec, oi);
  if (land && land[key]) return { value: land[key], src: 'land' };
  const def = (DEFAULTS[netsKindOf(oi)] || {})[key];
  return def ? { value: def, src: 'default' } : { value: '', src: '' };
}

const srcText = (rec, oi, src) => {
  if (src === 'land') {
    const land = netsLandOf(rec, oi);
    return `от участка${land && land.name && land.name !== 'Земельный участок' ? ' «' + land.name + '»' : ''}`;
  }
  if (src === 'default') return `по умолчанию для ${KIND_LABEL[netsKindOf(oi)] || 'вида'}`;
  return '';
};

export function oiNetsCard(ctx, oi, idx) {
  const rec = ctx.rec;
  cleanLegacyNets(oi);
  cleanLegacyNets(netsLandOf(rec, oi));
  const onLand = !!netsLandOf(rec, oi);
  return `<div class="card t-blue" id="q-nets">
<div class="card-head" data-card-toggle data-card-key="${onLand ? 'oi-nets-land' : 'oi-nets-free'}" data-card-default="${onLand ? 'closed' : 'open'}">
<span class="card-idx">${String(idx).padStart(2, '0')}</span>
<h3>Инженерные сети</h3>
<span class="hint">${onLand ? 'от участка — свои значения меняются здесь' : 'участка нет — сети указываются у объекта'}</span>
<span class="card-chev">▾</span>
</div>
<div class="card-body-wrap"><div class="card-pad"><div class="grid g-3">
${OI_NETS.map((f) => {
    const v = netValue(rec, oi, f.key);
    const list = opt('land', f.key, f.list);
    const back = v.src === 'own' ? inherited(rec, oi, f.key) : null;
    return `<div class="field oi-net ${v.src === 'own' ? 'own' : ''}">
  <label>${esc(f.label)}</label>
  <select class="select" data-oi-net="${f.key}">${emptyOptionHTML()}${[...new Set([...list, ...(v.value && !list.includes(v.value) ? [v.value] : [])])]
    .map((o) => `<option ${o === v.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
  <span class="oi-net-src">${v.src === 'own'
    ? `своё${back && back.value ? ` · <button type="button" class="oi-net-back" data-oi-net-back="${f.key}" title="Вернуть значение ${esc(srcText(rec, oi, back.src))}">вернуть ${esc(srcText(rec, oi, back.src))}: ${esc(back.value)}</button>` : ''}`
    : esc(srcText(rec, oi, v.src))}</span>
</div>`;
  }).join('')}
</div></div></div>
</div>`;
}

// Поменяли сеть у участка. ОИ без своего значения подхватят его сами (значение
// участка подставляется при показе); у ОИ со своим значением — спрашиваем
// («Если имеешь ввиду те, где уже меняли значения, то спрашиваем само собой»).
export async function landNetChanged(rec, land, key, value) {
  const f = OI_NETS.find((x) => x.key === key);
  if (!f || !rec) return;
  const own = (rec.oi || []).filter((o) => (o.card === 'building' || o.card === 'apartment')
    && netsLandOf(rec, o) === land && (o.nets || {})[key] && o.nets[key] !== value);
  if (!own.length) return;
  const ok = await confirmDialog({
    title: 'Заменить свои значения у объектов?',
    text: `«${f.label}» у участка теперь «${value || 'Не выбрано'}». У этих объектов на участке значение своё — заменить его значением участка?`,
    list: own.map((o) => `${o.name || o.letter || 'Объект'}: ${o.nets[key]}`),
    note: 'Без замены у них останется своё значение.',
    okLabel: 'Заменить',
  });
  if (!ok) return;
  own.forEach((o) => { delete o.nets[key]; });
}

// Выбор — своё значение; «Не выбрано» или значение, равное унаследованному, —
// своё снимается (значение снова идёт от участка или по умолчанию). Правка
// уходит в запись через onChange (сохранение и лог действий модуля).
export function bindOiNets(scope, oi, { rec, onChange = () => {}, rerender = () => {} } = {}) {
  scope.$$('[data-oi-net]').forEach((sel) => {
    sel.onchange = () => {
      const key = sel.dataset.oiNet;
      const was = (oi.nets || {})[key] || '';
      const inh = inherited(rec, oi, key).value;
      oi.nets = oi.nets || {};
      if (!sel.value || sel.value === inh) delete oi.nets[key];
      else oi.nets[key] = sel.value;
      onChange(key, was, oi.nets[key] || '');
      rerender();
    };
  });
  scope.$$('[data-oi-net-back]').forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.oiNetBack;
      const was = (oi.nets || {})[key] || '';
      if (oi.nets) delete oi.nets[key];
      onChange(key, was, '');
      rerender();
    };
  });
}
