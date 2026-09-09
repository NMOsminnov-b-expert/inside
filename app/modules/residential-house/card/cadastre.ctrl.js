// Адрес из портала Кадастра по коду ЕНИ — блок 02 «Местоположение».
//
// Подстановка идёт ТОЛЬКО по нажатию кнопки. Автоматическая, по вводу кода, не
// давала убрать адрес вовсе: сотрёшь поля, тронешь код — и они заполнены снова
// (замечание пользователя 09.09.2026).
//
// Обработчик один на форму правки и форму создания: пары таких копий в проекте
// уже расходились, и правка доходила только до одной из них.
//
// Сам запрос — kernel/cadastre.js, там же обходы CORS и тексты ошибок.
import { addressByEni } from '../../../kernel/cadastre.js';
import { syncOcAddress, parseAddress } from '../../../kernel/address.js';
import { eniCodesOf, formatEniText } from '../../../kernel/eniField.js';

// Поля блока «Местоположение»: куда раскладывается разобранный адрес. Карта
// общая для разбора вставленной строки и для ответа Кадастра — иначе одно из
// двух со временем отстаёт.
export const ADDR_PARTS = {
  region: '#fRegion',
  district: '#fDistrict',
  city: '#fCity',
  micro: '#fMicro',
  street: '#fStreet',
  house: '#fHouse',
  flat: '#fFlat',
};

export function bindCadastre(ctx, rec) {
  const s = ctx.scope;
  const btn = s.$('#btnCadastre');
  if (!btn) return;

  const eniField = s.$('#fEni');
  const codeBox = s.$('#cadCode');
  const msgBox = s.$('#cadMsg');

  const say = (text, kind) => {
    if (!msgBox) return;
    msgBox.textContent = text || '';
    msgBox.className = 'src-msg' + (kind ? ' ' + kind : '');
  };

  // Кодов у записи бывает несколько, а Кадастр отвечает по одному — берём
  // первый, тот же, что уходит в архив и документы.
  const codeOf = () => eniCodesOf((eniField || {}).value || '')[0] || '';

  // Код виден до нажатия: человек проверяет, по чему пойдёт запрос, а не гадает
  // после. Кнопка без кода выключена — незачем звать портал впустую.
  const refresh = () => {
    const code = codeOf();
    if (codeBox) codeBox.textContent = code ? formatEniText(code) : 'код ЕНИ не введён';
    btn.disabled = !code;
    btn.title = code
      ? `Запросить адрес по коду ${formatEniText(code)}`
      : 'Сначала введите код ЕНИ в блоке «Основные параметры»';
  };

  if (eniField) eniField.addEventListener('input', refresh);
  refresh();

  btn.onclick = async () => {
    const code = codeOf();
    if (!code) return;

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Запрашиваю…';
    say('идёт запрос к порталу…');

    const res = await addressByEni(code);

    btn.textContent = label;
    refresh();

    if (!res.address) {
      // Ответ показываем в самой строке, а не только всплывающим сообщением:
      // причина отказа длинная (перезапустить Live Server, поднять прокси), и
      // всплывашка успевает исчезнуть раньше, чем её дочитают.
      say(res.error || 'адрес не найден', 'err');
      ctx.toast(res.error || 'Адрес не найден', 'warn');
      return;
    }

    // Заполняем и пустые поля, и заполненные: человек сам нажал кнопку, значит
    // ждёт адрес из Кадастра, а не смесь со своим.
    const parsed = parseAddress(res.address);
    Object.entries(ADDR_PARTS).forEach(([key, sel]) => {
      const el = s.$(sel);
      if (!el || !parsed[key]) return;
      el.value = parsed[key];
      rec[key] = parsed[key];
    });

    syncOcAddress(rec);
    const box = s.$('[data-addr-sum]');
    if (box) box.value = rec.address;
    if (ctx.updatePlate) ctx.updatePlate();

    say(res.address, 'ok');
    ctx.toast('Адрес заполнен из Кадастра', 'ok');
  };
}
