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
import { inventoryById, progressOf, partLabel } from '../../kernel/inventories.js';
import { peekResults } from '../../kernel/inspectionResults.js';
import { ownOis, mechProgress, oiLabel as taskOiLabel } from '../inspection/tasks.js';

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
function dayParts(all, sel) {
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
  return { sub, body, acts, trips: trips.length, objects };
}
function dayHTML(all, sel, canBack) {
  const { sub, body, acts, trips } = dayParts(all, sel);
  return shell(esc(dayTitle(sel.day)), sub, acts.list + body + acts.form, canBack,
    trips ? `<button class="btn btn-ghost btn-sm" data-ip-dp-history="${esc((sel.person ? sel.person + '|' : '') + sel.day)}">Вся история дня</button>` : '');
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
    const part = (a.invParts || {})[id];
    return `<p class="ip-line"><b>${esc(inv.title)}</b>${part ? ` <span class="ip-sub">— ${esc(partLabel(part))}</span>` : ''}<br>осмотрено <b>${pr.seen + pr.missing}</b> из ${pr.total}${pr.missing ? ` · не найдено ${pr.missing}` : ''}${pr.broken ? ` · нерабочих ${pr.broken}` : ''}${pr.repair ? ` · в ремонте ${pr.repair}` : ''}${pr.extra ? ` · нет в описи ${pr.extra}` : ''}${pr.conflicts ? ` · <b class="ip-late">разные отметки ${pr.conflicts}</b>` : ''}
      <br><button type="button" class="btn btn-ghost btn-sm" data-ip-inv-report="${esc(id)}">Отчёт по описи (xlsx)</button></p>`;
  }).join('')}</section>` : ''}
    ${mechHTML(a, c)}
    <section class="ip-sec"><h3>События</h3>
      <ul class="ip-evs">${evs.map((e) => `<li><time>${esc(fmtDate(e.at))} ${esc(new Date(e.at).toTimeString().slice(0, 5))}</time>
        <span>${esc(EVENT_LABELS[e.kind] || e.kind)}${e.count ? `: ${e.count}` : ''}${e.text ? `: ${esc(e.text)}` : ''}${e.field ? `: ${esc(e.field)}` : ''}</span></li>`).join('')}</ul>
    </section>`;
  const sub = `${esc(s ? [s.typeLabel, s.institution].filter(Boolean).join(' · ') : '')} · <span class="ip-state st-${esc(a.state)}">${esc(stateLabel(a))}</span>
    · <a href="${esc(build({ typeId: a.typeId, ocId: a.ocId }))}">карточка</a>`;
  return shell(esc(s ? s.title : '—'), sub, body, canBack,
    isLive(a) ? `<button class="btn btn-primary btn-sm" data-ip-dp-edit="${esc(a.id)}">Изменить в «Назначено»</button>` : '');
}

// Механизмы назначения — по описи (решение 04.11.2026 «Истина - опись»):
// ход по отметкам единиц из результатов осмотра, общий для всех выездов.
function mechHTML(a, c) {
  if (!c || !c.rec) return '';
  const r = peekResults(a.typeId, a.ocId);
  const ois = ownOis(c.rec).filter((o) => o.card === 'mech' && (!a.oiIds || !a.oiIds.length || a.oiIds.includes(o.id)));
  if (!ois.length) return '';
  return `<section class="ip-sec"><h3>Механизмы по описи</h3>${ois.map((o) => {
    const pr = mechProgress(o, r && r.assets && r.assets[o.id]);
    return `<p class="ip-line"><b>${esc(taskOiLabel(o))}</b><br>осмотрено <b>${pr.seen + pr.missing}</b> из ${pr.total}${pr.missing ? ` · не найдено ${pr.missing}` : ''}${pr.broken ? ` · нерабочих ${pr.broken}` : ''}${pr.repair ? ` · в ремонте ${pr.repair}` : ''}${pr.done ? ' · <b>осмотрены все</b>' : ''}</p>`;
  }).join('')}</section>`;
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
function reportParts(all, sel, assignments) {
  const d = dayReport(sel.name, sel.date);
  // Передвижение за день — цепочка отрезков «Авто» и «Такси» (17.11.2026): у авто — одометр в начале и в конце со
  // снимками и единицей машины (км, мили, ч), у такси — причина.
  const odoVal = (v, unit) => (v === null || v === undefined || v === '' ? '—' : `<b class="ip-num">${esc(Number(v).toLocaleString('ru-RU'))} ${esc(unit || 'км')}</b>`);
  const shot = (src, v) => (src ? `<a class="ip-odo" href="${esc(src)}" target="_blank" rel="noopener" title="Снимок одометра — открыть"><img src="${esc(src)}" alt="Снимок одометра: ${esc(v ?? '')}"></a>` : '');
  const legHTML = (l, i) => {
    const what = l.mode === 'taxi' ? `такси${l.reason ? ` <span class="ip-muted">— ${esc(l.reason)}</span>` : ''}`
      : l.noOdo ? 'авто <span class="ip-muted">— одометра нет</span>'
        : `авто: ${odoVal(l.from, l.unit)} → ${odoVal(l.to, l.unit)}`;
    // Утренний снимок — в утреннем отчёте; здесь — остальные.
    const pics = l.mode === 'car' && !l.noOdo ? `${i ? shot(l.fromPhoto, l.from) : ''}${shot(l.toPhoto, l.to)}` : '';
    return `<div class="ip-dp-line"><span>${i ? `После пересадки ${i}` : 'С утра'}</span><span class="ip-dp-v">${what}</span></div>${pics ? `<div class="ip-odo-pair">${pics}</div>` : ''}`;
  };
  const when = (r, lateText) => `${esc(reportTime(r.at))}${lateText ? ` <span class="ip-rmark warn">${lateText}</span>` : ''}${r.editedAt ? ` <span class="ip-muted">· изменён ${esc(reportTime(r.editedAt))}</span>` : ''}`;
  const missing = (miss) => `<p class="ip-hint">${miss ? '<span class="ip-rmark off">не сдан</span>' : d.work ? 'Ещё не сдан.' : esc(d.reason || 'Не рабочий день.')}</p>`;
  const m = d.morning;
  const e = d.evening;
  const doneList = e ? (e.done || []).map((id) => assignments.find((a) => a.id === id)).filter(Boolean) : [];
  const body = `
    <section class="ip-sec"><h3>Утренний отчёт</h3>
      ${m ? `<div class="ip-dp-line"><span>Сдан</span><span class="ip-dp-v">${when(m, d.late ? `позже ${esc(d.lateFrom)}` : '')}</span></div>
        <div class="ip-dp-line"><span>Куда</span><span class="ip-dp-v">${(m.places || []).length ? `<ul class="ip-dp-list">${m.places.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '—'}</span></div>
        ${m.mode === 'taxi'
          ? `<div class="ip-dp-line"><span>Передвижение</span><span class="ip-dp-v">такси${m.taxiReason ? ` <span class="ip-muted">— ${esc(m.taxiReason)}</span>` : ''}</span></div>`
          : `<div class="ip-dp-line"><span>Одометр</span><span class="ip-dp-v">${m.noOdometer || !m.odometer ? '<span class="ip-muted">одометра нет</span>' : odoVal(m.odometer, m.unit)}</span></div>${shot(m.photo, m.odometer)}`}` : missing(d.missingMorning)}
    </section>
    <section class="ip-sec"><h3>Вечерний отчёт</h3>
      ${e ? `<div class="ip-dp-line"><span>Сдан</span><span class="ip-dp-v">${when(e, d.eveningLate ? `сдан ${esc(fmtDate(e.at))}` : '')}</span></div>
        <div class="ip-dp-line"><span>Осмотрено</span><span class="ip-dp-v">${doneList.length ? `<ul class="ip-dp-list">${doneList.map((a) => { const s = all.get(a.typeId + '|' + a.ocId); return `<li><a href="#" data-ip-dp-open="assign:${esc(a.id)}">${esc(s ? s.title : a.ocId)}</a></li>`; }).join('')}</ul>` : '—'}</span></div>
        ${(e.partial || []).length ? `<div class="ip-dp-line"><span>Осмотрено частично</span><span class="ip-dp-v"><ul class="ip-dp-list">${e.partial.map((x) => { const a = assignments.find((y) => y.id === x.assignId); const s = a ? all.get(a.typeId + '|' + a.ocId) : null; return `<li>${esc(s ? s.title : '—')}${x.reason ? ` <span class="ip-muted">— ${esc(x.reason)}</span>` : ''}</li>`; }).join('')}</ul></span></div>` : ''}
        ${d.legs.length ? `<h4 class="ip-dp-sub">Передвижение${d.transfers ? ` · пересадок ${d.transfers}` : ''}</h4>${d.legs.map(legHTML).join('')}` : ''}
        ${d.kmBy !== 'odometer' && (e.route || []).length ? `<div class="ip-dp-line"><span>Маршрут</span><span class="ip-dp-v">${esc(e.route.join(' → '))}</span></div>` : ''}
        ${e.note ? `<div class="ip-dp-line"><span>Комментарий</span><span class="ip-dp-v">${esc(e.note)}</span></div>` : ''}` : missing(d.missingEvening)}
    </section>
    <section class="ip-sec"><h3>Пробег и бензин</h3>
      <div class="ip-dp-line"><span>Пробег</span><span class="ip-dp-v">${d.km === null ? '—' : `<b class="ip-num">${d.km} км</b> <span class="ip-muted">${d.kmBy === 'odometer' ? `по одометру${d.transfers ? `, пересадок ${d.transfers}` : ''}` : d.kmBy === 'taxi' ? 'весь день на такси, по маршруту' : 'по маршруту'}</span>`}</span></div>
      ${d.hours !== null ? `<div class="ip-dp-line"><span>Моточасы</span><span class="ip-dp-v"><b class="ip-num">${esc(String(d.hours).replace('.', ','))} ч</b></span></div>` : ''}
      <div class="ip-dp-line"><span>По дорогам (OSM)</span><span class="ip-dp-v" data-ip-osm-km="${esc(d.person + '|' + d.date)}"><span class="ip-muted">считается…</span></span></div>
      <div class="ip-dp-line"><span>Литры</span><span class="ip-dp-v">${d.litres === null ? (d.kmBy === 'taxi' ? '<span class="ip-muted">весь день на такси — не считаются</span>' : d.km !== null ? '<span class="ip-muted">расход авто не указан</span>' : '—') : `<b class="ip-num">${d.litres.toLocaleString('ru-RU')} л</b> <span class="ip-muted">${d.km} × ${d.consumption} / 100</span>`}</span></div>
      <div class="ip-dp-line"><span>Авто</span><span class="ip-dp-v">${esc(d.car || '—')}${d.fuel ? ` · ${esc(d.fuel)}` : ''}</span></div>
    </section>`;
  return body;
}
function reportHTML(all, sel, assignments, canBack) {
  return shell('Отчёты за день', `${esc(sel.name)} · ${esc(dayTitle(sel.date))}`, reportParts(all, sel, assignments), canBack,
    `<button class="btn btn-ghost btn-sm" data-ip-person="${esc(sel.name)}">Карточка осмотрщика</button>`);
}

// День осмотрщика (ТЗ экрана регионалов 17.11.2026, этап 3): выезды, работа вне выездов, утренний и вечерний
// отчёты, передвижение и пробег — одной панелью по клетке сетки «осмотрщик × день» (раньше — четыре вкладки:
// «Выезды», «Маршрут», «Отчёты», «Загрузка»). sel: { name, date, plan — область плана дня, off — почему не работает }.
function pdayHTML(all, sel, assignments, canBack) {
  const day = dayParts(all, { person: sel.name, day: sel.date });
  const key = esc(sel.name + '|' + sel.date);
  const sub = [esc(dayTitle(sel.date)), sel.plan ? `план: ${esc(sel.plan)}` : '', sel.off ? `<span class="ip-late">${esc(sel.off)}</span>` : '',
    day.trips ? `${day.objects} ${plural(day.objects, 'объект', 'объекта', 'объектов')}` : ''].filter(Boolean).join(' · ');
  const acts = `<div class="ip-dp-acts">
      ${sel.off ? '' : `<button type="button" class="btn btn-primary btn-sm" data-ip-load-assign="${key}">Назначить на этот день</button>`}
      <button type="button" class="btn btn-ghost btn-sm" data-ip-load-route="${key}">Маршрут дня</button>
      <button type="button" class="btn btn-ghost btn-sm" data-ip-dp-history="${key}">История дня</button></div>`;
  const body = `${acts}
    <section class="ip-sec"><h3>Выезды</h3>${day.acts.list}${day.body}${day.acts.form}</section>
    ${reportParts(all, sel, assignments)}`;
  return shell(esc(sel.name), sub, body, canBack,
    `<button class="btn btn-ghost btn-sm" data-ip-person="${esc(sel.name)}">Карточка осмотрщика</button>`);
}

// stack — стопка выборов, последний — показываемый.
export function detailHTML(all, people, assignments, stack) {
  const sel = stack[stack.length - 1];
  if (!sel) return '';
  const canBack = stack.length > 1;
  if (sel.kind === 'day') return dayHTML(all, sel, canBack);
  if (sel.kind === 'report') return reportHTML(all, sel, assignments, canBack);
  if (sel.kind === 'pday') return pdayHTML(all, sel, assignments, canBack);
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
