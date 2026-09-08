// Интерфейс осмотрщика: мои осмотры → задача → объект / документы / фото.
//
// Решение пользователя 08.09.2026: осмотры — это два отдельных интерфейса, и
// у осмотрщика он мобильный, отдельными экранами в этом же макете. Здесь
// сделана вторая половина — то, что видит и делает сам осмотрщик; назначение
// осмотров региональным менеджером будет отдельным экраном.
//
// Что осмотрщик может: смотреть карточку ОЦ с её ОИ (только чтение),
// открывать назначенные документы, снимать и разбирать фото, писать свою
// заметку и отмечать, что осмотр закончен. Статус «Осмотрен» ставит ЦОД — это
// тоже решение 08.09.2026, поэтому отметка здесь только сообщает ему, что
// можно проверять.
//
// Переключение разделов — нижняя панель на четыре пункта: на телефоне это
// самый быстрый способ, до неё дотягивается большой палец, и она не съедает
// экран, как выпадающее меню.
import { MENU_HREF, INSP_HREF, inspHref, go } from '../../kernel/router.js';
import { pickFile, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import {
  myTasks, loadTask, taskState, inspectorsInData, currentInspector, setInspector,
  addPhoto, removePhoto, movePhoto, photosByCat, taskDocs, PHOTO_CATS,
} from './tasks.js';
import { listHTML, taskHTML, objectHTML, docsHTML, photoHTML, lightboxHTML } from './views.js';

const SECTIONS = ['task', 'object', 'docs', 'photo'];

export function mountInspector(host) {
  const { scope } = host;
  let route = host.route;

  const ui = {
    // Открывают экран, чтобы поехать на осмотр, — поэтому по умолчанию
    // показываем то, что ждёт осмотра, а не весь список.
    onlyPending: true,
    openOi: null,
    cat: PHOTO_CATS[0],
  };

  // --- отрисовка ----------------------------------------------------------

  function render() {
    const { typeId, ocId } = route;
    const section = SECTIONS.includes(route.section) ? route.section : 'task';

    if (!typeId || !ocId) {
      // Список берём один раз целиком: из него же считаются оба счётчика в
      // переключателе, иначе «Все мои» показывало бы число ждущих осмотра.
      const all = myTasks();
      const pending = all.filter((t) => t.pending);
      scope.setHTML(listHTML({
        tasks: ui.onlyPending ? pending : all,
        total: all.length,
        pendingCount: pending.length,
        inspectors: inspectorsInData(),
        person: currentInspector(),
        onlyPending: ui.onlyPending,
        backHref: MENU_HREF,
      }));
      return;
    }

    const rec = loadTask(typeId, ocId);
    if (!rec) {
      scope.setHTML(`<div class="ins"><div class="ins-body">
        <p class="ins-empty">Объект не найден: возможно, его убрали в архив.</p>
        <a class="ins-btn ins-btn-main ins-btn-wide" href="${INSP_HREF}">К моим осмотрам</a>
      </div></div>`);
      return;
    }

    const state = taskState(typeId, ocId);
    const hrefFor = (s) => inspHref({ typeId, ocId, section: s });
    const docs = taskDocs(rec);
    const counts = { docs: docs.length, photo: state.photos.length };
    const taskHref = inspHref({ typeId, ocId });

    if (section === 'object') {
      scope.setHTML(objectHTML({ rec, openOi: ui.openOi, hrefFor, counts, backHref: taskHref }));
      return;
    }
    if (section === 'docs') {
      scope.setHTML(docsHTML({ rec, docs, hrefFor, counts, backHref: taskHref }));
      return;
    }
    if (section === 'photo') {
      scope.setHTML(photoHTML({
        rec,
        groups: photosByCat(typeId, ocId),
        total: state.photos.length,
        cat: ui.cat,
        hrefFor,
        counts,
        backHref: taskHref,
      }));
      return;
    }

    scope.setHTML(taskHTML({ rec, state, hrefFor, counts, backHref: INSP_HREF }));
  }

  // --- обработчики --------------------------------------------------------
  //
  // Вешаются ОДИН раз на корень экрана: разметка переписывается на каждой
  // отрисовке, и слушатели на самих элементах пришлось бы навешивать заново
  // (этим уже отличались заметки и состав в карточках ОИ).

  scope.on('click', '[data-only]', (e, el) => {
    ui.onlyPending = el.dataset.only === '1';
    render();
  });

  scope.on('change', '[data-view-as]', (e, el) => {
    setInspector(el.value);
    render();
  });

  scope.on('click', '[data-copy-gps]', async (e, el) => {
    const gps = el.dataset.copyGps;
    try {
      await navigator.clipboard.writeText(gps);
      host.toast('Координаты скопированы', 'ok');
    } catch (err) {
      // Буфер обмена без защищённого соединения недоступен — показываем
      // значение, чтобы его можно было переписать вручную.
      host.toast('Скопировать не удалось: ' + gps, 'warn');
    }
  });

  // Заметку пишем в состояние по ходу ввода и НЕ перерисовываем экран: иначе
  // поле теряло бы фокус и каретку на каждом символе.
  scope.on('input', '[data-own-note]', (e, el) => {
    if (route.typeId && route.ocId) taskState(route.typeId, route.ocId).note = el.value;
  });

  scope.on('click', '[data-toggle-done]', () => {
    const st = taskState(route.typeId, route.ocId);
    st.done = !st.done;
    host.toast(st.done ? 'Осмотр отмечен как завершённый' : 'Отметка снята', 'ok');
    render();
  });

  scope.on('click', '[data-oi]', (e, el) => {
    ui.openOi = ui.openOi === el.dataset.oi ? null : el.dataset.oi;
    render();
  });

  scope.on('change', '[data-cat]', (e, el) => { ui.cat = el.value; });

  scope.on('click', '[data-shoot]', async () => {
    const file = await pickFile('image/*', { capture: 'environment' });
    if (!file) return;
    if (isFileTooLarge(file)) {
      host.toast(`Снимок больше ${MAX_DOC_FILE_MB} МБ — уменьшите качество съёмки`, 'warn');
      return;
    }

    const res = addPhoto(route.typeId, route.ocId, file, ui.cat);
    if (res.error) {
      host.toast(res.error, 'warn');
      return;
    }
    render();
  });

  scope.on('change', '[data-move]', (e, el) => {
    movePhoto(route.typeId, route.ocId, el.dataset.move, el.value);
    host.toast('Снимок перенесён в «' + el.value + '»', 'ok');
    render();
  });

  scope.on('click', '[data-drop]', async (e, el) => {
    const ok = await host.confirm({
      title: 'Удалить снимок?',
      text: 'Снимок пропадёт из осмотра. Отменить будет нельзя.',
      okText: 'Удалить',
    });
    if (!ok) return;
    removePhoto(route.typeId, route.ocId, el.dataset.drop);
    render();
  });

  // Просмотр снимка — слоем поверх, без перехода: осмотрщик открывает снимок,
  // чтобы решить «переснять или нет», и должен вернуться в сетку одним
  // касанием.
  const closeLightbox = () => {
    const lb = scope.$('[data-lb]');
    if (lb) lb.remove();
  };

  scope.on('click', '[data-shot]', (e, el) => {
    const st = taskState(route.typeId, route.ocId);
    const p = st.photos.find((x) => x.id === el.dataset.shot);
    if (!p) return;
    closeLightbox();
    scope.root.insertAdjacentHTML('beforeend', lightboxHTML(p));
  });

  scope.on('click', '[data-lb-close]', closeLightbox);
  scope.onDocument('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  render();

  return {
    onRoute(next) {
      const sameTask = next.typeId === route.typeId && next.ocId === route.ocId;
      route = next;
      // Открыли другую задачу — раскрытая литера от прошлой не нужна.
      if (!sameTask) ui.openOi = null;
      render();
    },
    destroy() {
      closeLightbox();
    },
  };
}

// Экран открывается из реестра объектов: пункт «Осмотры» в боковом меню.
export { INSP_HREF, go };
