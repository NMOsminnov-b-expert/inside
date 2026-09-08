// Интерфейс осмотрщика: мои осмотры → задача → объект / документы / фото,
// и осмотр каждого объекта имущества отдельно.
//
// Решение пользователя 08.09.2026: осмотры — это два отдельных интерфейса, и
// у осмотрщика он мобильный, отдельными экранами в этом же макете, но сами
// экраны адаптивные. Здесь сделана вторая половина — то, что видит и делает
// сам осмотрщик; назначение осмотров региональным менеджером будет отдельным
// экраном.
//
// Что осмотрщик может: смотреть карточку ОЦ с её ОИ (только чтение), открывать
// назначенные документы, снимать и разбирать фото с привязкой к объекту
// имущества, заполнять поля осмотра по каждому ОИ, писать заметку и отмечать,
// что осмотр закончен. Статус «Осмотрен» ставит ЦОД — поэтому отметка здесь
// только сообщает ему, что можно проверять.
//
// Поля осмотра строятся из описания (form.js) конструктором ядра
// (kernel/fieldSchema.js) — в этом файле нет ни одной подписи поля.
import { MENU_HREF, INSP_HREF, inspHref } from '../../kernel/router.js';
import { pickFile, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { bindFields, filledCount } from '../../kernel/fieldSchema.js';
import {
  myTasks, loadTask, taskState, assetValues, inspectorsInData, currentInspector,
  setInspector, addPhoto, removePhoto, movePhoto, photoById, photoGroups,
  taskDocs, oiOptions, PHOTO_CATS,
} from './tasks.js';
import { ALL_FIELDS } from './form.js';
import {
  listHTML, taskHTML, objectHTML, assetHTML, docsHTML, photoHTML, lightboxHTML,
} from './views.js';

const SECTIONS = ['task', 'object', 'docs', 'photo'];

export function mountInspector(host) {
  const { scope } = host;
  let route = host.route;

  const ui = {
    // Открывают экран, чтобы поехать на осмотр, — поэтому по умолчанию
    // показываем то, что ждёт осмотра, а не весь список.
    onlyPending: true,
    openOi: null,
    // К чему привязать следующий снимок. Пустое — возьмём первый ОИ записи.
    photoOi: '',
    cat: PHOTO_CATS[0],
  };

  const rec = () => loadTask(route.typeId, route.ocId);

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

    const r = rec();
    if (!r) {
      scope.setHTML(`<div class="ins"><div class="ins-body">
        <p class="ins-empty">Объект не найден: возможно, его убрали в архив.</p>
        <a class="ins-btn ins-btn-main ins-btn-wide" href="${INSP_HREF}">К моим осмотрам</a>
      </div></div>`);
      return;
    }

    const state = taskState(typeId, ocId);
    const docs = taskDocs(r);
    const hrefFor = (s) => inspHref({ typeId, ocId, section: s });
    const counts = { docs: docs.length, photo: state.photos.length };
    const taskHref = inspHref({ typeId, ocId });
    const oiList = oiOptions(r);

    // Осмотр одного объекта имущества — подраздел «Объекта»: раздел в панели
    // остаётся тот же, а «назад» ведёт к перечню, а не к задаче.
    if (section === 'object' && route.oiId) {
      const oi = (r.oi || []).find((o) => o.id === route.oiId);
      if (oi) {
        scope.setHTML(assetHTML({
          rec: r,
          oi,
          values: assetValues(typeId, ocId, oi.id),
          hrefFor,
          counts,
          backHref: inspHref({ typeId, ocId, section: 'object' }),
        }));
        return;
      }
    }

    if (section === 'object') {
      scope.setHTML(objectHTML({
        rec: r,
        openOi: ui.openOi,
        hrefFor,
        assetHref: (oiId) => inspHref({ typeId, ocId, section: 'object', oiId }),
        // Число заполненных полей у ОИ — по нему видно, что осмотр начат.
        filledFor: (oiId) => filledCount(ALL_FIELDS, assetValues(typeId, ocId, oiId)),
        counts,
        backHref: taskHref,
      }));
      return;
    }

    if (section === 'docs') {
      scope.setHTML(docsHTML({ rec: r, docs, hrefFor, counts, backHref: taskHref }));
      return;
    }

    if (section === 'photo') {
      const oiId = ui.photoOi || (oiList[0] ? oiList[0].id : '');
      scope.setHTML(photoHTML({
        groups: photoGroups(r, typeId, ocId),
        total: state.photos.length,
        oiId,
        cat: ui.cat,
        oiList,
        hrefFor,
        counts,
        backHref: taskHref,
      }));
      return;
    }

    scope.setHTML(taskHTML({ rec: r, state, hrefFor, counts, backHref: INSP_HREF }));
  }

  // --- поля осмотра -------------------------------------------------------
  //
  // Значения пишет конструктор ядра; экран только решает, перерисовываться ли.
  // На выборе чипа — да: от него зависят счётчики обязательного. На вводе
  // текста — нет, иначе поле теряло бы фокус на каждом символе.
  bindFields(scope, {
    // Функцией, а не объектом: раздел меняется, и значения должны браться на
    // момент события, а не на момент монтажа экрана.
    values: () => assetValues(route.typeId, route.ocId, route.oiId),
    fields: ALL_FIELDS,
    onChange: (field, value, opts) => {
      if (!opts || !opts.typing) render();
    },
  });

  scope.on('input', '[data-asset-note]', (e, el) => {
    assetValues(route.typeId, route.ocId, route.oiId).note = el.value;
  });

  // --- обработчики экранов ------------------------------------------------
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

  // Заметку пишем в состояние по ходу ввода и НЕ перерисовываем экран.
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

  // --- фото ---------------------------------------------------------------

  scope.on('change', '[data-oi-pick]', (e, el) => { ui.photoOi = el.value; });
  scope.on('change', '[data-cat]', (e, el) => { ui.cat = el.value; });

  scope.on('click', '[data-shoot]', async () => {
    const r = rec();
    const oiList = oiOptions(r || {});
    const oiId = ui.photoOi || (oiList[0] ? oiList[0].id : '');
    if (!oiId) {
      host.toast('Не к чему привязать снимок: в объекте нет ОИ', 'warn');
      return;
    }

    const file = await pickFile('image/*', { capture: 'environment' });
    if (!file) return;
    if (isFileTooLarge(file)) {
      host.toast(`Снимок больше ${MAX_DOC_FILE_MB} МБ — уменьшите качество съёмки`, 'warn');
      return;
    }

    const res = addPhoto(route.typeId, route.ocId, file, { oiId, cat: ui.cat });
    if (res.error) {
      host.toast(res.error, 'warn');
      return;
    }
    render();
  });

  scope.on('change', '[data-move]', (e, el) => {
    movePhoto(route.typeId, route.ocId, el.dataset.move, { cat: el.value });
    host.toast('Снимок перенесён в «' + el.value + '»', 'ok');
    closeLightbox();
    render();
  });

  scope.on('change', '[data-move-oi]', (e, el) => {
    movePhoto(route.typeId, route.ocId, el.dataset.moveOi, { oiId: el.value });
    host.toast('Снимок привязан к другому объекту', 'ok');
    closeLightbox();
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
    closeLightbox();
    render();
  });

  // Просмотр снимка — слоем поверх, без перехода: осмотрщик открывает снимок,
  // чтобы решить «переснять или нет», и должен вернуться в сетку одним
  // касанием. Здесь же перенос и удаление — в сетке для них нет ширины.
  function closeLightbox() {
    const lb = scope.$('[data-lb]');
    if (lb) lb.remove();
  }

  scope.on('click', '[data-shot]', (e, el) => {
    const p = photoById(route.typeId, route.ocId, el.dataset.shot);
    if (!p) return;
    closeLightbox();
    scope.root.insertAdjacentHTML('beforeend', lightboxHTML(p, oiOptions(rec() || {})));
  });

  scope.on('click', '[data-lb-close]', closeLightbox);
  scope.onDocument('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  render();

  return {
    onRoute(next) {
      const sameTask = next.typeId === route.typeId && next.ocId === route.ocId;
      route = next;
      // Открыли другую задачу — раскрытый ОИ от прошлой не нужен.
      if (!sameTask) {
        ui.openOi = null;
        ui.photoOi = '';
      }
      render();
    },
    destroy() {
      closeLightbox();
    },
  };
}
