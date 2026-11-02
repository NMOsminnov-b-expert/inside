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

export function inspectionTabHTML(typeId, rec) {
  return impl ? impl.render(typeId, rec) : '<div class="empty">Результаты осмотра недоступны.</div>';
}
