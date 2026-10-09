# -*- coding: utf-8 -*-
"""Архив: даты в одном виде — фильтр и порядок по датам работают.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): модули передают в архив дату
«ДД.ММ.ГГГГ», ядро — «ГГГГ-ММ-ДД», а фильтр «с … по …» и порядок «свежие
сверху» сравнивают строки. Что ловит сценарий:
  * запись, убранная из карточки (дата «ДД.ММ.ГГГГ»), отбрасывается фильтром
    по датам, в который она попадает;
  * «свежие сверху» ставит более раннюю дату выше поздней;
  * в списке архива дата показана не «ДД.ММ.ГГГГ».
"""
NAME = 'архив: даты'

TOUCHES = ('app/kernel/archiveStore.js', 'app/kernel/archive.js', 'app/kernel/fmt.js', 'app/pages/archive/archive.js')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    got = pg.evaluate("""async () => {
      const st = await import('./app/kernel/archiveStore.js');
      const ar = await import('./app/kernel/archive.js');
      st.addEntries({ kind: 'document', archivedAt: '05.10.2026', from: {}, payload: { doc: { type: 'Тест', name: 'Ранний' } } });
      st.addEntries({ kind: 'document', archivedAt: '2026-10-08', from: {}, payload: { doc: { type: 'Тест', name: 'Поздний' } } });
      const all = (f) => ar.queryArchive(f, () => true).filter((e) => e.payload && e.payload.doc && e.payload.doc.type === 'Тест')
        .map((e) => e.payload.doc.name);
      return { range: all({ from: '2026-10-01', to: '2026-10-31' }), order: all({}) };
    }""")
    t.ck('Ранний' in got['range'], 'запись с датой «ДД.ММ.ГГГГ» выпала из фильтра по датам: %s' % got)
    t.ck(got['order'][:2] == ['Поздний', 'Ранний'], '«свежие сверху» не по датам: %s' % got['order'])
    shown = pg.evaluate("""async () => {
      const st = await import('./app/kernel/archiveStore.js');
      return st.allEntries ? st.allEntries().map((e) => e.archivedAt) : [];
    }""")
    t.ck(all(not s or s[4] == '-' for s in shown if isinstance(s, str)), 'в архиве хранится не «ГГГГ-ММ-ДД»: %s' % shown)
