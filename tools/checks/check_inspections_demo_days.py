# -*- coding: utf-8 -*-
"""
Демо осмотров правдоподобно (пользователь 17.11.2026: «причеши демо данные для осмотров. Что бы не получалось,
что на человека на день назначено 20 обьектов в 3-х областях. Все делаем логичным»).

Что ловит сценарий:
  * у осмотрщика на день больше выездов, чем он успеет (больше DAY_MAX объектов);
  * день осмотрщика — в нескольких зонах (Бишкек с Чуйской областью — одна зона, прочие области — каждая своя);
  * прошлые выезды не закончены, будущие — закончены; выезд на выходной;
  * назначение выдано позже дня выезда; отчёт дня называет не те объекты.
"""
NAME = 'демо осмотров: день осмотрщика'

TOUCHES = ('app/kernel/inspectionsDemo.js', 'app/kernel/inspections.js')

DAY_MAX = 4

STATS = """async () => {
  const k = await import('./app/kernel/inspections.js'); const f = await import('./app/kernel/fmt.js');
  const m = await import('./app/pages/inspections/model.js');
  const all = m.summaries(); const out = { days: [], weekend: [], state: [] };
  const today = new Date(); const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t0 = iso(today);
  const by = new Map();
  k.allAssignments().filter((a) => a.demo && a.plannedAt).forEach((a) => {
    const key = a.person + '|' + a.plannedAt; if (!by.has(key)) by.set(key, []); by.get(key).push(a);
    const wd = new Date(a.plannedAt + 'T00:00:00').getDay(); if (wd === 0 || wd === 6) out.weekend.push(key);
    if (a.plannedAt < t0 && a.state !== 'done' && !a.removed && a.state !== 'assigned') out.state.push('прошлый не закончен ' + a.id);
    if (a.plannedAt > t0 && a.state === 'done') out.state.push('будущий закончен ' + a.id);
    if (a.at && iso(new Date(a.at)) > a.plannedAt) out.state.push('выдано позже выезда ' + a.id);
  });
  for (const [key, list] of by) {
    const objs = new Set(list.map((a) => a.typeId + '|' + a.ocId));
    const zone = (g) => (g === 'Бишкек' || g === 'Чуй' ? 'Бишкек и Чуй' : g);
    const regs = new Set([...objs].map((x) => zone(f.eniRegion((all.get(x) || {}).eni || '')) || '?'));
    out.days.push({ key, n: objs.size, regs: [...regs] });
  }
  const byId = new Map(k.allAssignments().map((a) => [a.id, a]));
  out.reports = k.reportsBetween('0000', '9999').filter((r) => r.demo && r.kind === 'evening')
    .flatMap((r) => (r.done || []).filter((id) => { const a = byId.get(id); return !a || a.plannedAt !== r.date || a.person !== r.person; }).map((id) => r.person + '|' + r.date + ' ' + id));
  return out; }"""


def run(t):
    pg = t.page
    t.open('#/inspections', wait='body')
    t.wait_until("async () => (await import('./app/kernel/inspections.js')).allAssignments().length > 0")
    s = pg.evaluate(STATS)
    many = [d for d in s['days'] if d['n'] > DAY_MAX]
    t.ck(not many, 'больше %d объектов в день: %s' % (DAY_MAX, sorted(((d['key'], d['n']) for d in many), key=lambda x: -x[1])[:8]))
    multi = [d for d in s['days'] if len([r for r in d['regs'] if r != '?']) > 1]
    t.ck(not multi, 'день в нескольких областях: %s' % [(d['key'], d['regs']) for d in multi][:8])
    t.ck(not s['weekend'], 'выезды на выходные: %s' % s['weekend'][:8])
    t.ck(not s['state'], 'состояние не по дате: %s' % s['state'][:8])
    t.ck(not s['reports'], 'вечерний отчёт называет выезды другого дня: %s' % s['reports'][:8])
    print('дней: %d, объектов в день макс. %d' % (len(s['days']), max([d['n'] for d in s['days']] or [0])))
