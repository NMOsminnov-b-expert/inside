# -*- coding: utf-8 -*-
"""Введённое переживает перезагрузку страницы — по всему проекту.

Требования пользователя 09.09.2026: «те данные, что вбились, не должны
пропадать после перезагрузки», «сохранение сделай глобальным по всему проекту».
Механика — kernel/persist.js: один снимок JSON под ключом inside:data:v1,
части объявляют сами владельцы данных.

Почему на это нужен отдельный сценарий (слова пользователя — «эта штука
важна»): молчаливая потеря данных не видна ни на одном экране. Приложение
работает, засев на месте — и только человек, который вчера час вносил объект,
обнаруживает, что его нет. Поэтому здесь проверяется не наличие кода, а
поведение: правим, перезагружаем, ищем своё.

Ломкие места, за которыми сценарий следит отдельно:
  * ленивая загрузка модулей — тип ОЦ грузится при открытии своего экрана, и
    его часть снимка восстанавливается позже остальных;
  * удаление: оно тоже должно пережить перезагрузку, иначе удалённое воскресает;
  * испорченный снимок не должен ронять приложение — только вернуть засев;
  * ссылки на файлы (blob:) в снимок не попадают: после перезагрузки они ведут
    в никуда.
"""
NAME = 'сохранение данных'

TOUCHES = (
    'app/kernel/persist.js', 'app/modules/*/data/store.js',
    'app/kernel/institutions.js', 'app/kernel/dicts.js',
    'app/kernel/archiveStore.js', 'app/kernel/documentsRegistry.js',
)

KEY = 'inside:data:v1'

CIVIL = '#/oc/civil/oc-cv-1'
APART = '#/oc/apartment/oc-ap-1'

# Части снимка, без которых сохранение неполное. Имя не PARTS: так в run.py
# называется разбиение сценария на куски, и каркас начал бы звать run(t, part).
SNAPSHOT = ['records.civil', 'records.apartment', 'institutions', 'dicts']


def _save_now(t):
    """Дожать отложенную запись: сценарий не ждёт таймер вслепую."""
    t.page.evaluate("""async () => {
      const m = await import('./app/kernel/persist.js');
      m.saveNow();
    }""")


def _purpose(t, module, rec_id):
    return t.page.evaluate("""async ([mod, id]) => {
      const m = await import(`./app/modules/${mod}/records.js`);
      const r = m.allRecords().find((x) => x.id === id);
      return r ? r.purposeTP : null;
    }""", [module, rec_id])


def run(t):
    pg = t.page

    # --- 1. правка записи переживает перезагрузку --------------------------
    t.open(CIVIL + '/form', wait='#fPurpose')
    pg.fill('#fPurpose', 'СОХРАНЕНО-ЦИВИЛ')
    pg.dispatch_event('#fPurpose', 'change')
    pg.locator('#btnSaveOc').click()
    t.wait_for('[data-oc-head]')
    _save_now(t)

    pg.reload()
    t.wait_for('[data-oc-head]')
    t.ck(_purpose(t, 'civil', 'oc-cv-1') == 'СОХРАНЕНО-ЦИВИЛ',
         'правка записи не пережила перезагрузку')

    # --- 2. другой тип ОЦ: модуль грузится лениво --------------------------
    #
    # Его часть снимка восстанавливается позже остальных — в тот момент, когда
    # модуль впервые понадобился. Если восстановление привязать к старту
    # приложения, эта правка потеряется.
    t.open(APART + '/form', wait='#fPurpose')
    pg.fill('#fPurpose', 'СОХРАНЕНО-КВАРТИРА')
    pg.dispatch_event('#fPurpose', 'change')
    pg.locator('#btnSaveOc').click()
    t.wait_for('[data-oc-head]')
    _save_now(t)

    pg.reload()
    t.wait_for('[data-oc-head]')
    t.ck(_purpose(t, 'apartment', 'oc-ap-1') == 'СОХРАНЕНО-КВАРТИРА',
         'правка в другом типе ОЦ не пережила перезагрузку')

    # Первая правка при этом никуда не делась: части снимка не затирают друг
    # друга.
    t.ck(_purpose(t, 'civil', 'oc-cv-1') == 'СОХРАНЕНО-ЦИВИЛ',
         'сохранение одного типа ОЦ затёрло данные другого')

    # --- 3. состав снимка --------------------------------------------------
    snap = pg.evaluate("""() => {
      const raw = localStorage.getItem('%s');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { версия: parsed.v, части: Object.keys(parsed.data || {}) };
    }""" % KEY)

    t.ck(snap, 'снимок не сохранён вовсе')
    if snap:
        for part in SNAPSHOT:
            t.ck(part in snap['части'], 'в снимке нет части «%s»: %s' % (part, snap['части']))

    # --- 4. новая запись и удаление ----------------------------------------
    made = pg.evaluate("""async () => {
      const m = await import('./app/modules/civil/records.js');
      const store = await import('./app/modules/civil/data/store.js');
      const rec = { id: 'oc-test-persist', typeId: 'civil', type: 'Гражданское здание',
                    category: 'Недвижимое', eni: '1475616819999', status: 'В заполнении',
                    purposeTP: 'НОВАЯ-ЗАПИСЬ', institution: '', podved: '', city: 'г. Бишкек',
                    owners: [], users: [], resp: {}, oi: [], docs: [], notes: [] };
      store.addRecord(rec);
      const before = m.allRecords().length;
      return before;
    }""")
    t.ck(made > 0, 'не удалось завести запись для проверки')
    _save_now(t)

    pg.reload()
    t.wait_for('[data-oc-head]')
    t.ck(_purpose(t, 'civil', 'oc-test-persist') == 'НОВАЯ-ЗАПИСЬ',
         'заведённая запись не пережила перезагрузку')

    pg.evaluate("""async () => {
      const store = await import('./app/modules/civil/data/store.js');
      store.removeRecord('oc-test-persist');
    }""")
    _save_now(t)

    pg.reload()
    t.wait_for('[data-oc-head]')
    t.ck(_purpose(t, 'civil', 'oc-test-persist') is None,
         'удалённая запись вернулась после перезагрузки')

    # --- 5. учреждения ------------------------------------------------------
    pg.evaluate("""async () => {
      const inst = await import('./app/kernel/institutions.js');
      const root = inst.allNodes().find((n) => !n.parentId);
      inst.createNode(root.id, { name: 'ПРОВЕРКА СОХРАНЕНИЯ' });
    }""")
    _save_now(t)

    pg.reload()
    t.wait_for('[data-oc-head]')
    has_inst = pg.evaluate("""async () => {
      const inst = await import('./app/kernel/institutions.js');
      return inst.allNodes().some((n) => n.name === 'ПРОВЕРКА СОХРАНЕНИЯ');
    }""")
    t.ck(has_inst, 'заведённое учреждение не пережило перезагрузку')

    # --- 6. справочники -----------------------------------------------------
    # addItem принимает сам справочник, а не его id, и правит только
    # непользовательские перечни: системные трогать нельзя.
    added = pg.evaluate("""async () => {
      const d = await import('./app/kernel/dicts.js');
      const dict = d.allDicts().find((x) => !x.system);
      if (!dict) return false;
      return !!d.addItem(dict, 'ПРОВЕРКА-ЗНАЧЕНИЕ');
    }""")
    if t.ck(added, 'не удалось добавить значение в справочник'):
        _save_now(t)
        pg.reload()
        t.wait_for('[data-oc-head]')
        kept = pg.evaluate("""async () => {
          const d = await import('./app/kernel/dicts.js');
          return d.allDicts().some((x) => (x.items || [])
            .some((i) => i.value === 'ПРОВЕРКА-ЗНАЧЕНИЕ'));
        }""")
        t.ck(kept, 'добавленное значение справочника не пережило перезагрузку')

    # --- 7. испорченный снимок не роняет приложение -------------------------
    #
    # Снимок правят руками и он переживает смену формата — приложение обязано
    # подняться на засеве, а не встать с ошибкой.
    pg.evaluate("() => localStorage.setItem('%s', '{ это не json')" % KEY)
    pg.reload()
    t.wait_for('[data-oc-head]')
    t.ck(pg.locator('[data-oc-head]').count() == 1,
         'испорченный снимок уронил карточку — приложение должно подняться на засеве')

    # Консольное предупреждение о нечитаемом снимке — ожидаемое, не провал:
    # каркас считает ошибками только console.error, а тут console.warn.

    # --- 8. ссылки на файлы в снимок не попадают ----------------------------
    blob_saved = pg.evaluate("""async () => {
      const store = await import('./app/modules/civil/data/store.js');
      const m = await import('./app/kernel/persist.js');
      const rec = store.records[0];
      rec.docs = rec.docs || [];
      rec.docs.push({ id: 'doc-blob-test', type: 'Прочее', name: 'Файл',
                      file: { name: 'f.pdf', dataUrl: 'blob:http://x/y' } });
      m.saveNow();
      const raw = localStorage.getItem('%s') || '';
      return raw.includes('blob:http://x/y');
    }""" % KEY)
    t.ck(not blob_saved,
         'ссылка на файл (blob:) попала в снимок — после перезагрузки она ведёт в никуда')
