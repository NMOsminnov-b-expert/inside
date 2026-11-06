// Вкладка «Результаты осмотра» карточки ОЦ (ответы пользователя 30.10.2026
// «Вкладка в карточке + срез» и 02.11.2026 «Снять запрет для вкладки» —
// исключение из правила kartochki-oc-poka-ne-trogat: только пункт вкладки и
// показ результатов, только чтение).
//
// Ядро не знает видов ОИ, а подписи полей осмотра знает экран осмотрщика
// (pages/inspector/form.js) — он и рисует содержимое, регистрируясь здесь при
// загрузке (pages/inspector/results.js; страницы грузит kernel/boot.js до
// первой карточки). Модули карточек обращаются только сюда. Своих импортов у
// файла нет: модули → ядро → назначения → реестр → модули дало бы кольцо.
let impl = null;

export function setInspectionTab(fns) { impl = fns; }

// Есть ли что показывать: назначения на осмотр или введённое на осмотре.
export const hasInspection = (typeId, ocId) => !!(impl && impl.has(typeId, ocId));

export const INSPECTION_TAB = { key: 'inspection', label: 'Результаты осмотра' };

// Подпись под текущим шагом шкалы ОЦ — где осмотр внутри шага (решение пользователя 06.11.2026
// «Шаг — по приёмке ЦОД»: «В работе» и «закончен» шаги не двигают — подписью под шагом).
export const inspectionStepNote = (typeId, rec) => (impl && impl.stepNote ? impl.stepNote(typeId, rec) : '');

// Поле «Осмотрщик» блока ответственных — по назначениям регионала, только чтение (решение
// пользователя 06.11.2026 «Только назначения»: ЦОД осмотрщика руками не задаёт; двое — оба, с ОИ).
export function inspectorsFieldHTML(rec) {
  const list = impl && impl.inspectors ? impl.inspectors(rec) : [];
  const safe = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Только чтение — не поле ввода: по строке на осмотрщика, длинный перечень ОИ переносится, а не обрезается.
  return `<div class="field"><label id="resp-insp-l">${list.length > 1 ? 'Осмотрщики' : 'Осмотрщик'}</label>
    <div class="input resp-insp" role="group" aria-labelledby="resp-insp-l" data-resp-insp title="Назначает региональный менеджер в разделе «Осмотры»">
      ${list.length ? list.map((x) => `<span>${safe(x)}</span>`).join('') : '<span class="resp-insp-none">не назначен</span>'}</div></div>`;
}

export function inspectionTabHTML(typeId, rec) {
  return impl ? impl.render(typeId, rec) : '<div class="empty">Результаты осмотра недоступны.</div>';
}

// Просмотрщик карточки на вкладке — тот же, что на остальных вкладках ОЦ и ОИ
// («Фото · Документы · Сравнение»; пользователь 02.11.2026: «Просмотрщик у нас
// уже существует со всеми его режимами. Так же нужны и документы со
// сравнением»). Снимки в нём — снимки осмотра выбранного во вкладке: держатель
// того же вида, что у ОИ (photos — {категория: число}, photoFiles — файлы), с
// пометкой inspectionPhotos (просмотрщик читает его сам и не даёт переносить,
// kernel/viewer/deps.js, photo.js). Просмотрщику отдаётся наследник контекста
// карточки с этим держателем вместо ctx.oi: сам ctx.oi на вкладке не меняется
// (по нему карточка строит крошки и обработчики литер).
export function inspectionViewerCtx(ctx) {
  if (!impl || !impl.holder || ctx.tab !== 'inspection' || !ctx.rec || !hasInspection(ctx.manifest.id, ctx.rec.id)) return ctx;
  const holder = impl.holder(ctx.manifest.id, ctx.rec);
  return Object.create(ctx, { oi: { value: holder, enumerable: true } });
}

// При входе на вкладку просмотрщик открывается на снимках осмотра («Фото»);
// дальше режим — как выберет человек. ui — состояние карточки модуля.
export function syncInspectionViewer(ui, onTab) {
  if (onTab && !ui.inspViewer && !ui.viewerClosed) ui.viewer = { mode: 'photo' };
  ui.inspViewer = !!onTab;
}
