// Панель подробностей — одна на экран, справа, показывает то, с чем сейчас
// работают (просьба пользователя 12.10.2026: «при клике нужно показывать, кто
// куда и зачем ездил в выдвижной панели справа. Там панель будет
// универсальной и помогать в зависимости от элемента, с которым
// взаимодействуем»).
//
// Устройство: страница передаёт «что выбрано» — { kind, … }; панель рисует
// своё содержимое по виду и держит стопку переходов: из дня — в назначение,
// «‹ Назад» возвращает. Виды: day (выезды дня), assign (назначение),
// person (краткая карточка осмотрщика). Новые виды (расхождение,
// выявленный объект — шаг (д) ТЗ) добавляются сюда же, без новой раскладки.
// Практики: Apple HIG inspector (панель следует за выбором, содержимое — по
// виду элемента), ServiceNow contextual side bar (содержимое слева
// перестраивается, а не перекрывается).
import { esc } from '../../kernel/dom.js';
import { build } from '../../kernel/router.js';
import { plural } from '../../kernel/fmt.js';
import { eventsOf, isLive, profileOf, whatsappLink, dayReport, reportTime, activitiesOn, activityKind, activityKinds, absenceKinds, absenceOn, absenceLabel } from '../../kernel/inspections.js';
import { ENI_REGIONS } from '../../kernel/fmt.js';
import { tripsOfDay, stateLabel, isOverdue, EVENT_LABELS, objectContents } from './model.js';
import { inventoryById, progressOf } from '../../kernel/inventories.js';

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const dayTitle = (day) => `${WD[new Date(day + 'T00:00:00').getDay()]}, ${fmtDate(day)}`;
const KIND = { done: 'осмотрено', plan: 'план', late: 'просрочено' };

function shell(title, sub, body, canBack, foot = '') {
  return `<aside class="ip-pane ip-detail-pane" aria-label="Подробности">
    <header class="ip-pane-head">
      <div class="ip-dp-bar">
        ${canBack ? '<button class="btn btn-ghost btn-sm" data-ip-dp-back>‹ Назад</button>' : ''}
        <button class="btn btn-ghost btn-sm ip-dp-close" data-ip-dp-close aria-label="Закрыть подробности">Закрыть</button>
      </div>
      <h2>${title}</h2>
      ${sub ? `<p class="ip-pane-sub">${sub}</p>` : ''}
    </header>
    <div class="ip-pane-body">${body}</div>
    ${foot ? `<footer class="ip-pane-foot">${foot}</footer>` : ''}
  </aside>`;
}

// Выезды дня: по осмотрщику, если он выбран, иначе — всех.
function dayHTML(all, sel, canBack) {
  const trips = tripsOfDay(all, sel.person || '', sel.day);
  const objects = new Set(trips.map((t) => t.a.typeId + '|' + t.a.ocId)).size;
  const sub = `${sel.person ? esc(sel.person) + (trips.length ? ' · ' : '') : ''}${trips.length ? `${objects} ${plural(objects, 'объект', 'объекта', 'объектов')} · назначений ${trips.length}` : ''}`;
  const body = trips.length ? `<ul class="ip-dp-trips">${trips.map((t) => `<li class="ip-dp-trip k-${t.kind}" data-ip-dp-open="assign:${esc(t.a.id)}" tabindex="0">
      <div class="ip-dp-trip-h"><i class="k-${t.kind}">${KIND[t.kind]}</i>${sel.person ? '' : `<b>${esc(t.a.person)}</b>`}</div>
      <div class="ip-dp-trip-obj">${esc(t.s ? t.s.title : '—')}</div>
      <div class="ip-dp-trip-meta">${esc(t.s ? [t.s.typeLabel, t.s.institution].filter(Boolean).join(' · ') : '')}</div>
      <div class="ip-dp-line"><span>Что</span><span class="ip-dp-v">${t.oi.length ? esc(t.oi.join('; ')) : 'объект целиком'}</span></div>
      <div class="ip-dp-line"><span>Зачем</span><span class="ip-dp-v">${t.a.note ? esc(t.a.note) : `осмотр${(t.a.docs || []).length ? ` · документов ${(t.a.docs || []).length}` : ''}${(t.a.inventories || []).length ? ` · описей ${(t.a.inventories || []).length}` : ''}`}</span></div>
      ${t.kind === 'done' ? `<div class="ip-dp-line"><span>Итог</span><span class="ip-dp-v">снимков ${t.photos}${t.notes.length ? ` · заметок ${t.notes.length}` : ''}${t.mismatch.length ? ` · расхождений ${t.mismatch.length}` : ''}${t.found.length ? ` · выявлено ${t.found.length}` : ''}</span></div>
        ${t.notes.map((n) => `<div class="ip-dp-note">${esc(n)}</div>`).join('')}` : ''}
    </li>`).join('')}</ul>` : '<p class="ip-hint">В этот день выездов нет.</p>';
  const acts = sel.person ? activitiesHTML(sel.person, sel.day) : { list: '', form: '' };
  return shell(esc(dayTitle(sel.day)), sub, acts.list + body + acts.form, canBack,
    trips.length ? `<button class="btn btn-ghost btn-sm" data-ip-dp-history="${esc(sel.day)}">Вся история дня</button>` : '');
}

// Работа вне выездов в этот день (ТЗ рабочего дня, раздел 4): записи —
// над выездами дня, форма добавления — под ними. Поля — по виду: командировка — область и адрес жилья,
// осмотр для партнёров — проект, объект и время.
function activitiesHTML(person, day) {
  const list = activitiesOn(person, day);
  // Отсутствие в этот день — тоже здесь: отпуск ставят с календаря, не
  // прокручивая профиль (разбор UI/UX 12.10.2026).
  const ab = absenceOn(person, day);
  const line = (a) => [a.region, a.address, a.project, a.object, a.time, a.note].filter(Boolean).map(esc).join(' · ');
  const f = (key, label, type = 'text', kinds = '') => `<div class="field" ${kinds ? `data-ip-act-for="${kinds}"` : ''}><label for="ip-act-${key}">${label}</label>
    <input class="input" id="ip-act-${key}" data-ip-act="${key}" type="${type}" ${type === 'date' ? `value="${day}"` : ''}></div>`;
  return {
    list: (ab ? `<section class="ip-sec ip-acts"><h3>Отсутствие</h3><ul class="ip-act-list ip-ab-list"><li><i class="k-away">${esc(absenceLabel(ab.kind))}</i>
        <span class="ip-ab-dates">${esc(fmtDate(ab.from))}${ab.to && ab.to !== ab.from ? ` — ${esc(fmtDate(ab.to))}` : ''}</span>
        <button class="ip-x" data-ip-ab-del="${esc(ab.id)}" aria-label="Удалить" title="Удалить">×</button>${ab.note ? `<span class="ip-ab-note">${esc(ab.note)}</span>` : ''}</li></ul></section>` : '')
      + (list.length ? `<section class="ip-sec ip-acts"><h3>Работа вне выездов</h3><ul class="ip-act-list">${list.map((a) => `<li><i class="k-act">${esc(activityKind(a.kind).label)}</i>
        <span class="ip-ab-dates">${esc(fmtDate(a.from))}${a.to && a.to !== a.from ? ` — ${esc(fmtDate(a.to))}` : ''}</span>
        <button class="ip-x" data-ip-act-del="${esc(a.id)}" aria-label="Удалить" title="Удалить">×</button>
        ${line(a) ? `<span class="ip-ab-note">${line(a)}</span>` : ''}</li>`).join('')}</ul></section>` : ''),
    form: `<section class="ip-sec ip-acts"><h3>Отметить работу вне выездов или отсутствие</h3>
    <div class="ip-act-add" data-ip-act-form>
      <div class="field"><label for="ip-act-kind">Вид</label><select class="select" id="ip-act-kind" data-ip-act="kind">
        <optgroup label="Работа вне выездов">${activityKinds().map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</optgroup>
        <optgroup label="Отсутствие">${absenceKinds().map((k) => `<option value="ab:${k.key}">${k.label}</option>`).join('')}</optgroup></select></div>
      <div class="ip-prow">${f('from', 'С', 'date')}${f('to', 'По', 'date')}</div>
      <div class="field" data-ip-act-for="trip move" hidden><label for="ip-act-region">Область</label><select class="select" id="ip-act-region" data-ip-act="region">
        <option value="">—</option>${Object.values(ENI_REGIONS).map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
      ${f('address', 'Временный адрес жилья', 'text', 'trip').replace('<div class="field" ', '<div class="field" hidden ')}
      ${f('project', 'Проект', 'text', 'partner').replace('<div class="field" ', '<div class="field" hidden ')}
      <div class="ip-prow" data-ip-act-for="partner" hidden>${f('object', 'Объект')}${f('time', 'Время', 'time')}</div>
      ${f('note', 'Примечание')}
      <div class="ip-profile-act"><span class="ip-err" data-ip-act-err role="alert"></span><button class="btn btn-ghost btn-sm" data-ip-act-add>Добавить</button></div>
    </div>
  </section>`,
  };
}

// Назначение — сводка: кто, когда, что, документы, события; правка — в
// «Назначениях» (кнопка), здесь только чтение: панель помогает понять, а не
// заменяет рабочее место.
function assignHTML(all, a, canBack) {
  const s = all.get(a.typeId + '|' + a.ocId);
  const c = objectContents(a.typeId, a.ocId);
  const oi = a.oiIds && a.oiIds.length && c ? c.oi.filter((o) => a.oiIds.includes(o.id)).map((o) => o.label) : ['объект целиком'];
  const evs = eventsOf({}).filter((e) => e.assignId === a.id).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const body = `
    <section class="ip-sec"><h3>Назначение</h3>
      <div class="ip-dp-line"><span>Осмотрщик</span><span class="ip-dp-v">${esc(a.person)}</span></div>
      <div class="ip-dp-line"><span>План</span><span class="ip-dp-v"><b class="${isOverdue(a) ? 'ip-late' : ''}">${esc(fmtDate(a.plannedAt) || '—')}</b></span></div>
      <div class="ip-dp-line"><span>Назначил</span><span class="ip-dp-v">${esc(a.by || '—')}, ${esc(fmtDate(a.at))}</span></div>
      ${a.note ? `<div class="ip-dp-line"><span>Комментарий</span><span class="ip-dp-v">${esc(a.note)}</span></div>` : ''}
    </section>
    <section class="ip-sec"><h3>Объекты имущества</h3>${oi.map((l) => `<p class="ip-line">${esc(l)}</p>`).join('')}</section>
    ${(a.inventories || []).length ? `<section class="ip-sec"><h3>Описи</h3>${(a.inventories || []).map((id) => {
    const inv = inventoryById(id);
    const pr = progressOf(id);
    if (!inv || !pr) return '';
    // Ход описи (Б5): счёт общий для всех выездов по описи (Б3).
    return `<p class="ip-line"><b>${esc(inv.title)}</b><br>осмотрено <b>${pr.seen + pr.missing}</b> из ${pr.total}${pr.missing ? ` · не найдено ${pr.missing}` : ''}${pr.broken ? ` · нерабочих ${pr.broken}` : ''}${pr.repair ? ` · в ремонте ${pr.repair}` : ''}${pr.extra ? ` · нет в описи ${pr.extra}` : ''}</p>`;
  }).join('')}</section>` : ''}
    <section class="ip-sec"><h3>События</h3>
      <ul class="ip-evs">${evs.map((e) => `<li><time>${esc(fmtDate(e.at))} ${esc(new Date(e.at).toTimeString().slice(0, 5))}</time>
        <span>${esc(EVENT_LABELS[e.kind] || e.kind)}${e.count ? `: ${e.count}` : ''}${e.text ? `: ${esc(e.text)}` : ''}${e.field ? `: ${esc(e.field)}` : ''}</span></li>`).join('')}</ul>
    </section>`;
  const sub = `${esc(s ? [s.typeLabel, s.institution].filter(Boolean).join(' · ') : '')} · <span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a.state))}</span>
    · <a href="${esc(build({ typeId: a.typeId, ocId: a.ocId }))}">карточка</a>`;
  return shell(esc(s ? s.title : '—'), sub, body, canBack,
    isLive(a) ? `<button class="btn btn-primary btn-sm" data-ip-dp-edit="${esc(a.id)}">Изменить в «Назначено»</button>` : '');
}

// Краткая карточка осмотрщика — из сводной таблицы.
function personHTML(p, canBack) {
  const prof = profileOf(p.name);
  const tel = (prof.phone || '').replace(/[^\d+]/g, '');
  const body = `
    ${p.fired ? '<p class="ip-hint">Уволен.</p>' : p.away ? `<p class="ip-hint">Сейчас: ${esc(p.away.label.toLowerCase())} до ${esc(fmtDate(p.away.to))}.</p>` : ''}
    <section class="ip-sec"><h3>Загрузка</h3>
      <div class="ip-dp-line"><span>В работе</span><span class="ip-dp-v"><b>${p.live}</b></span></div>
      <div class="ip-dp-line"><span>Просрочено</span><span class="ip-dp-v"><b class="${p.late ? 'ip-late' : ''}">${p.late}</b></span></div>
      <div class="ip-dp-line"><span>Свободно</span><span class="ip-dp-v"><b>${p.free}</b> ${plural(p.free, 'день', 'дня', 'дней')} из 10</span></div>
      <div class="ip-dp-line"><span>За 30 дней</span><span class="ip-dp-v"><b>${p.done}</b> ${plural(p.done, 'назначение', 'назначения', 'назначений')}</span></div>
    </section>
    <section class="ip-sec"><h3>Контакты</h3>
      <div class="ip-dp-line"><span>Телефон</span><span class="ip-dp-v">${prof.phone ? `<a href="tel:${esc(tel)}">${esc(prof.phone)}</a>` : '<span class="ip-muted">не указан</span>'}</span></div>
      <div class="ip-dp-line"><span>WhatsApp</span><span class="ip-dp-v">${whatsappLink(p.name) ? `<a href="${esc(whatsappLink(p.name))}" target="_blank" rel="noopener">написать</a>` : '<span class="ip-muted">нет номера</span>'}</span></div>
      <div class="ip-dp-line"><span>Почта</span><span class="ip-dp-v">${prof.email ? `<a href="mailto:${esc(prof.email)}">${esc(prof.email)}</a>` : '<span class="ip-muted">не указана</span>'}</span></div>
      <div class="ip-dp-line"><span>Области</span><span class="ip-dp-v">${esc(p.regions.join(', ') || '—')}${p.derived && p.regions.length ? ' <span class="ip-muted">(по объектам)</span>' : ''}</span></div>
    </section>`;
  return shell(esc(p.name), '', body, canBack,
    `<button class="btn btn-ghost btn-sm" data-ip-person="${esc(p.name)}">Открыть карточку</button>
     <button class="btn btn-primary btn-sm" data-ip-assign-to="${esc(p.name)}">Назначить объекты</button>`);
}

// Отчёты осмотрщика за день (ТЗ рабочего дня, раздел 3): утренний — куда и
// одометр со снимком; вечерний — что осмотрено, одометр или маршрут;
// пробег и литры с расчётом.
function reportHTML(all, sel, assignments, canBack) {
  const d = dayReport(sel.name, sel.date);
  const odo = (r) => (r.noOdometer || !r.odometer
    ? '<span class="ip-muted">одометра нет</span>'
    : `<b class="ip-num">${esc(Number(r.odometer).toLocaleString('ru-RU'))} км</b>`);
  const photo = (r) => (r.photo ? `<a class="ip-odo" href="${esc(r.photo)}" target="_blank" rel="noopener" title="Снимок одометра — открыть"><img src="${esc(r.photo)}" alt="Снимок одометра: ${esc(r.odometer || '')}"></a>` : '');
  const when = (r, lateText) => `${esc(reportTime(r.at))}${lateText ? ` <span class="ip-rmark warn">${lateText}</span>` : ''}${r.editedAt ? ` <span class="ip-muted">· изменён ${esc(reportTime(r.editedAt))}</span>` : ''}`;
  const missing = (miss) => `<p class="ip-hint">${miss ? '<span class="ip-rmark off">не сдан</span>' : d.work ? 'Ещё не сдан.' : esc(d.reason || 'Не рабочий день.')}</p>`;
  const m = d.morning;
  const e = d.evening;
  const doneList = e ? (e.done || []).map((id) => assignments.find((a) => a.id === id)).filter(Boolean) : [];
  const body = `
    <section class="ip-sec"><h3>Утренний отчёт</h3>
      ${m ? `<div class="ip-dp-line"><span>Сдан</span><span class="ip-dp-v">${when(m, d.late ? `позже ${esc(d.lateFrom)}` : '')}</span></div>
        <div class="ip-dp-line"><span>Куда</span><span class="ip-dp-v">${(m.places || []).length ? `<ul class="ip-dp-list">${m.places.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '—'}</span></div>
        <div class="ip-dp-line"><span>Одометр</span><span class="ip-dp-v">${odo(m)}</span></div>${photo(m)}` : missing(d.missingMorning)}
    </section>
    <section class="ip-sec"><h3>Вечерний отчёт</h3>
      ${e ? `<div class="ip-dp-line"><span>Сдан</span><span class="ip-dp-v">${when(e, d.eveningLate ? `сдан ${esc(fmtDate(e.at))}` : '')}</span></div>
        <div class="ip-dp-line"><span>Осмотрено</span><span class="ip-dp-v">${doneList.length ? `<ul class="ip-dp-list">${doneList.map((a) => { const s = all.get(a.typeId + '|' + a.ocId); return `<li><a href="#" data-ip-dp-open="assign:${esc(a.id)}">${esc(s ? s.title : a.ocId)}</a></li>`; }).join('')}</ul>` : '—'}</span></div>
        ${e.noOdometer || !e.odometer
          ? `<div class="ip-dp-line"><span>Маршрут</span><span class="ip-dp-v">${(e.route || []).length ? esc(e.route.join(' → ')) : '—'}</span></div>`
          : `<div class="ip-dp-line"><span>Одометр</span><span class="ip-dp-v">${odo(e)}</span></div>${photo(e)}`}
        ${e.note ? `<div class="ip-dp-line"><span>Комментарий</span><span class="ip-dp-v">${esc(e.note)}</span></div>` : ''}` : missing(d.missingEvening)}
    </section>
    <section class="ip-sec"><h3>Пробег и бензин</h3>
      <div class="ip-dp-line"><span>Пробег</span><span class="ip-dp-v">${d.km === null ? '—' : `<b class="ip-num">${d.km} км</b> <span class="ip-muted">${d.kmBy === 'route' ? 'по маршруту' : 'по одометру'}</span>`}</span></div>
      <div class="ip-dp-line"><span>Литры</span><span class="ip-dp-v">${d.litres === null ? (d.km !== null ? '<span class="ip-muted">расход авто не указан</span>' : '—') : `<b class="ip-num">${d.litres.toLocaleString('ru-RU')} л</b> <span class="ip-muted">${d.km} × ${d.consumption} / 100</span>`}</span></div>
      <div class="ip-dp-line"><span>Авто</span><span class="ip-dp-v">${esc(d.car || '—')}${d.fuel ? ` · ${esc(d.fuel)}` : ''}</span></div>
    </section>`;
  return shell('Отчёты за день', `${esc(sel.name)} · ${esc(dayTitle(sel.date))}`, body, canBack,
    `<button class="btn btn-ghost btn-sm" data-ip-person="${esc(sel.name)}">Карточка осмотрщика</button>`);
}

// stack — стопка выборов, последний — показываемый.
export function detailHTML(all, people, assignments, stack) {
  const sel = stack[stack.length - 1];
  if (!sel) return '';
  const canBack = stack.length > 1;
  if (sel.kind === 'day') return dayHTML(all, sel, canBack);
  if (sel.kind === 'report') return reportHTML(all, sel, assignments, canBack);
  if (sel.kind === 'assign') {
    const a = assignments.find((x) => x.id === sel.id);
    return a ? assignHTML(all, a, canBack) : '';
  }
  if (sel.kind === 'person') {
    const p = people.find((x) => x.name === sel.name);
    return p ? personHTML(p, canBack) : '';
  }
  return '';
}
