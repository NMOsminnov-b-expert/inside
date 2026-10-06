# -*- coding: utf-8 -*-
"""Карточки сотрудников: каждая копия пишет свой файл, на экране — сбор со всех.

Решение пользователя 06.10.2026: «на гит попадают и сохранённые у меня локально
карточки», «записи каждого сотрудника в отдельном файле. В системе показываем
уже сбор со всех таких записей. При этом в каждой копии макета своё название
файла, в который пишет система». Механика — kernel/persist.js и tools/serve.py.

Что ловит сценарий:
  * правка карточки на сервере макета не доходит до файла сотрудника;
  * в свежем браузере (другая копия, коллега) не видно чужих правок;
  * чужие записи без правок переписываются в свой файл — файлы раздуваются и
    спорят друг с другом;
  * из двух правок одной записи побеждает не последняя;
  * у новой записи нет метки копии — номера из разных копий совпали бы.

Сервер макета поднимается на временной папке (--data): data/local и имя файла
этой копии сценарий не трогает. Автопроверки обычно работают на одном засеве
(persist.js не читает файлы, когда браузером управляет программа), поэтому
здесь признак управления в своих вкладках снят.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

NAME = 'общие карточки сотрудников'

TOUCHES = ('app/kernel/persist.js', 'tools/serve.py', 'app/modules/*/data/store.js', 'app/modules/*/records.js')

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 5597
URL = 'http://127.0.0.1:%d/app.html' % PORT
CARD = '#/oc/civil/oc-cv-1'


def _serve(data, name):
    pr = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'serve.py'), '--port', str(PORT),
                           '--data', data, '--name', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0 = time.time()
    while time.time() - t0 < 10:
        try:
            # Мимо прокси из настроек Windows: иначе запрос на localhost уходит в него.
            urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                'http://127.0.0.1:%d/__persist' % PORT, timeout=1)
            return pr
        except OSError:
            time.sleep(0.2)
    pr.kill()
    raise RuntimeError('сервер макета не поднялся')


def _read(data, name):
    try:
        return json.load(open(os.path.join(data, name + '.json'), encoding='utf-8'))
    except (OSError, ValueError):
        return None


def _purpose(pg):
    return pg.evaluate("""async () => {
      const store = await import('./app/modules/civil/data/store.js');
      const r = store.getRecord('oc-cv-1');
      return r ? r.purposeTP : null;
    }""")


def run(t):
    browser = t.page.context.browser
    data = tempfile.mkdtemp(prefix='inside-shared-')
    errors = []
    srv = None

    def tab():
        ctx = browser.new_context(viewport={'width': 1400, 'height': 900})
        ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => false })")
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        return ctx, pg

    def edit(pg, text):
        pg.goto(URL + CARD + '/form')
        pg.wait_for_selector('#fPurpose')
        pg.fill('#fPurpose', text)
        pg.dispatch_event('#fPurpose', 'change')
        pg.locator('#btnSaveOc').click()
        pg.wait_for_selector('[data-oc-head]')
        pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")

    def wait_file(name, needle):
        t0 = time.time()
        while time.time() - t0 < 8:
            got = _read(data, name)
            if got and needle in json.dumps(got, ensure_ascii=False):
                return got
            time.sleep(0.2)
        return _read(data, name)

    try:
        # --- копия «alpha»: правка уходит в свой файл ---------------------------
        srv = _serve(data, 'alpha')
        ctx, pg = tab()
        edit(pg, 'ОБЩАЯ-АЛЬФА')
        got = wait_file('alpha', 'ОБЩАЯ-АЛЬФА')
        t.ck(got and 'oc-cv-1' in got.get('sources', {}).get('records.civil', {}),
             'правка не дошла до файла сотрудника: %s' % (got and list(got.get('sources', {}))))
        if got:
            mine = got['sources'].get('records.civil', {})
            t.ck(len(mine) == 1, 'в файл попали записи без правок: %s' % list(mine)[:10])
        tag = pg.evaluate("async () => (await import('./app/modules/civil/data/store.js')).nextId('oc-cv')")
        t.ck('alpha' in tag, 'у новой записи нет метки копии: %s' % tag)
        manifest = json.load(open(os.path.join(data, 'manifest.json'), encoding='utf-8'))
        t.ck(manifest.get('files') == ['alpha.json'], 'перечень файлов не тот: %s' % manifest)
        ctx.close()
        srv.terminate()
        srv.wait()

        # --- копия «beta», чистый браузер: видна правка alpha ------------------
        srv = _serve(data, 'beta')
        ctx, pg = tab()
        pg.goto(URL + CARD)
        pg.wait_for_selector('[data-oc-head]')
        t.ck(_purpose(pg) == 'ОБЩАЯ-АЛЬФА', 'чужая правка не видна в другой копии: %s' % _purpose(pg))
        pg.locator('[data-oc-head]').click()
        pg.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
        time.sleep(0.6)
        beta = _read(data, 'beta')
        t.ck(not beta or not beta.get('sources'), 'чужие записи без правок переписаны в свой файл: %s' % beta)

        # Правка той же записи в beta — позже, она и действует.
        edit(pg, 'ОБЩАЯ-БЕТА')
        wait_file('beta', 'ОБЩАЯ-БЕТА')
        alpha = _read(data, 'alpha')
        t.ck('ОБЩАЯ-АЛЬФА' in json.dumps(alpha, ensure_ascii=False), 'файл другого сотрудника переписан')
        ctx.close()

        ctx, pg = tab()
        pg.goto(URL + CARD)
        pg.wait_for_selector('[data-oc-head]')
        t.ck(_purpose(pg) == 'ОБЩАЯ-БЕТА', 'действует не последняя правка: %s' % _purpose(pg))
        ctx.close()
        srv.terminate()
        srv.wait()

        # --- прежний снимок браузера (версия 2) уходит в файл ------------------
        # Так в файл попадают карточки, вбитые до 06.10.2026: они лежат в
        # браузере записями целиком.
        srv = _serve(data, 'gamma')
        ctx, pg = tab()
        pg.goto(URL.replace('app.html', 'package.json'))
        pg.evaluate("""() => localStorage.setItem('inside:data:v1', JSON.stringify({ v: 2, data: {
          'records.civil': [{ id: 'oc-old-1', typeId: 'civil', type: 'Нежилое здание', category: 'Недвижимое',
            eni: '1475616819998', status: 'В заполнении', purposeTP: 'ВБИТО-РАНЬШЕ', institution: '', podved: '',
            city: 'г. Бишкек', owners: [], users: [], resp: {}, oi: [], docs: [], notes: [] }],
          'ui.shell': { collapsed: true } } }))""")
        pg.goto(URL + '#/oc/civil/oc-old-1')
        pg.wait_for_selector('[data-oc-head]')
        got = wait_file('gamma', 'ВБИТО-РАНЬШЕ')
        t.ck(got and 'oc-old-1' in got.get('sources', {}).get('records.civil', {}),
             'прежний снимок браузера не ушёл в файл сотрудника')
        t.ck(pg.locator('.app-sidebar.collapsed, #appSidebar.collapsed').count() == 1,
             'состояние экрана из прежнего снимка потерялось')
        ctx.close()
    finally:
        if srv:
            srv.terminate()
            srv.wait()
        shutil.rmtree(data, ignore_errors=True)

    t.ck(not errors, 'ошибки в консоли: %s' % errors[:3])
