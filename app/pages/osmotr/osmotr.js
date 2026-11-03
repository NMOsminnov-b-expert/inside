// Страница осмотрщиков — приложение «Осмотр» в браузере (PWA, тот же интерфейс,
// что на телефоне: Compose Multiplatform → WebAssembly). Решение пользователя
// 03.11.2026: «Тогда подтягиваем и PWA в макет. Это и будет страница
// осмотрщиков». Свой интерфейс осмотрщика макет больше не рисует: сборка
// приложения лежит в app/vendor/osmotr (tools/osmotr/sync_pwa.py) и
// показывается во всю область страницы.
//
// Прежний экран осмотрщика (#/insp, pages/inspector) не удалён: на нём держатся
// автопроверки и ссылки панели регионала; из меню он убран.
//
// Обмен с системой — мостом (bridge.js): вход по учётной записи E•state,
// назначенные объекты, отправка снятого в «Результаты осмотра». Архив
// (archiveImport.js) остаётся запасным путём.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: задание и результат — через сервер (API), а не окном макета.

import { setCrumbs, setActiveNav } from '../../shell/shell.js';
import { INSP_HREF } from '../../kernel/router.js';
import { connectBridge } from './bridge.js';

export const OSMOTR_SRC = './app/vendor/osmotr/index.html';
// Есть ли сборка и какая — пишет tools/osmotr/sync_pwa.py; файл в репозитории всегда
// (запрос к отсутствующей сборке дал бы «404» в консоли).
const OSMOTR_INFO = './app/vendor/osmotr.json';

export function mountOsmotr(host) {
  const scope = host.scope;
  document.body.dataset.page = 'osmotr';
  setActiveNav('insp-field');
  setCrumbs([{ label: 'Главная', to: '#/' }, { label: 'Осмотры (осмотрщики)', current: true }]);
  scope.setHTML('<div class="om-page"></div>');
  const page = scope.$('.om-page');
  let disconnect = null;
  // Сборки нет (папку кладёт tools/osmotr/sync_pwa.py) — сказать прямо и дать
  // прежний экран, а не показывать в рамке ответ сервера «404».
  fetch(OSMOTR_INFO, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}), () => ({}))
    .then((info) => {
      const ok = !!(info && info.present);
      if (!page.isConnected) return;
      page.innerHTML = ok
        ? `<iframe class="om-frame" src="${OSMOTR_SRC}" aria-label="Приложение «Осмотр»"
             allow="camera; geolocation; microphone; clipboard-write"></iframe>`
        : `<div class="om-none">
             <b>Приложение «Осмотр» не подключено к макету</b>
             <span>Нет сборки приложения в app/vendor/osmotr.</span>
             <a class="btn btn-ghost" href="${INSP_HREF}">Прежний экран осмотрщика</a>
           </div>`;
      // Вход, назначенные объекты, отправка снятого — через мост (bridge.js).
      const frame = page.querySelector('.om-frame');
      if (frame) disconnect = connectBridge(frame);
    });
  return { onRoute() {}, destroy() { if (disconnect) disconnect(); } };
}
