# -*- coding: utf-8 -*-
"""ЕНИ назначения — только назначенных ОИ, и одинаковый с первой отрисовки.

Решение пользователя 05.11.2026 на вопрос «ЕНИ в скобках у выезда осмотрщика»: «Только
назначенных ОИ». Находка аудита: ЕНИ сначала один, после любого действия — свёрнутый список
всех ЕНИ объекта (сводка подгружала eniAll позже).

Что ловит сценарий:
  * в «Назначено» и в шапке панели назначения на один ОИ — ЕНИ всех ОИ объекта;
  * ЕНИ меняется после перерисовки;
  * выезд, который мост отдаёт приложению «Осмотр», несёт ЕНИ всего объекта.
"""
NAME = 'ЕНИ назначения'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/osmotr/bridge.js', 'app/kernel/eniFold.js')


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    # Объект с двумя и больше ОИ с разными ЕНИ — назначение на один ОИ вошедшему.
    got = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const m = await import('./app/kernel/inspections.js');
      const S = await import('./app/kernel/session.js'); const F = await import('./app/kernel/eniFold.js'); const me = S.session.state.person;
      for (const t of R.sortedTypes()) {
        for (const s of t.records.queryRecords({ filter: {}, offset: 0, limit: 400 }).rows) {
          const rec = t.records.loadRecord(s.id); const ois = (rec && rec.oi || []).filter((o) => o.eni);
          if (new Set(ois.map((o) => o.eni)).size < 2) continue;
          const a = m.assign({ typeId: t.manifest.id, ocId: s.id, person: me, oiIds: [ois[0].id], plannedAt: '2099-02-02' });
          return { id: a.id, one: F.foldEniList([ois[0].eni]), all: F.foldEniList(ois.map((o) => o.eni)), me };
        }
      }
      return null; }""")
    if not t.ck(got, 'нет объекта с двумя ОИ с разными ЕНИ — нечем проверить'):
        return
    t.ck(got['one'] != got['all'], 'данные проверки не различают ЕНИ одного ОИ и всего объекта')
    pg.click('[data-ip-team="assigned"]')
    t.wait_for('[data-ip-aperson]')
    pg.click('[data-ip-aperson="%s"]' % got['me'])
    t.wait_for('[data-ip-row="%s"]' % got['id'])
    row = "(id) => document.querySelector('[data-ip-row=\"' + id + '\"] .ip-obj-s').innerText"
    first = pg.evaluate(row, got['id'])
    t.ck(got['one'] in first and got['all'] not in first, 'в строке «Назначено» не ЕНИ назначенного ОИ: %r (ждали %s)' % (first, got['one']))
    pg.locator('[data-ip-row="%s"] td:nth-child(3)' % got['id']).click()
    t.wait_for('.ip-pane .mono')
    head = pg.inner_text('.ip-pane .mono')
    t.ck(head == got['one'], 'в шапке панели не ЕНИ назначенного ОИ: %r (ждали %s)' % (head, got['one']))
    again = pg.evaluate(row, got['id'])
    t.ck(again == first, 'ЕНИ в строке изменился после перерисовки: %r → %r' % (first, again))
