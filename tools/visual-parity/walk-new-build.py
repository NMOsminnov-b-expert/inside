import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
OUT="/home/claude/walk"; os.makedirs(OUT, exist_ok=True)
srv=subprocess.Popen([sys.executable,"-m","http.server","8822","-d","/home/claude/work"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.2)
errs=[]
BASE="http://127.0.0.1:8822/app.html"

CASES = [
  ("rh",  "#/oc/residential-house/oc-rh-1", ['tr[data-open-oi="oi-a"]','tr[data-open-oi="oi-b"]','tr[data-open-oi="oi-l"]']),
  ("ap",  "#/oc/apartment/oc-ap-1",         ['tr[data-open-oi="oi-ap1-a"]']),
  ("cv",  "#/oc/civil/oc-cv-1",             ['tr[data-open-oi="oi-cv1-a"]','tr[data-open-oi="oi-cv1-l"]','tr[data-open-oi="oi-cv1-m1"]','tr[data-open-oi="oi-cv1-m2"]']),
  ("pr",  "#/oc/production/oc-pr-1",        ['tr[data-open-oi="oi-pr1-a"]','tr[data-open-oi="oi-pr1-m2"]']),
  ("lp",  "#/oc/land-plot/oc-lp-1",         ['tr[data-open-oi="oi-lp1-l1"]','tr[data-open-oi="oi-lp1-l2"]']),
]
try:
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(viewport={"width":1600,"height":1000})
        pg.on("pageerror",lambda e:errs.append("PAGEERROR: "+str(e)))
        pg.on("console",lambda m:errs.append("CONSOLE: "+m.text) if m.type=="error" else None)

        pg.goto(BASE); pg.wait_for_timeout(900)
        pg.screenshot(path=f"{OUT}/menu.png",full_page=True)

        for tag, hash_, rows in CASES:
            pg.goto(BASE+hash_); pg.wait_for_selector(".card",timeout=8000); pg.wait_for_timeout(500)
            pg.screenshot(path=f"{OUT}/{tag}-oc.png",full_page=True)
            for i,sel in enumerate(rows):
                pg.goto(BASE+hash_); pg.wait_for_selector(".card"); pg.wait_for_timeout(350)
                if pg.locator(sel).count()==0:
                    errs.append(f"MISSING ROW {tag} {sel}"); continue
                pg.click(sel); pg.wait_for_timeout(500)
                pg.screenshot(path=f"{OUT}/{tag}-oi{i}.png",full_page=True)
            # форма ОЦ
            pg.goto(BASE+hash_); pg.wait_for_selector(".card"); pg.wait_for_timeout(300)
            pg.click('#btnEditOc'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/{tag}-form.png",full_page=True)
            # вкладки
            pg.goto(BASE+hash_); pg.wait_for_selector(".card"); pg.wait_for_timeout(300)
            pg.click('[data-tab="docs"]'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/{tag}-docs.png",full_page=True)
            pg.click('[data-tab="photo"]'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/{tag}-photo.png",full_page=True)

        # мастер движимого в civil
        pg.goto(BASE+"#/oc/civil/oc-cv-1"); pg.wait_for_selector(".card"); pg.wait_for_timeout(350)
        pg.click('#ddAddOi [data-dd-toggle]'); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{OUT}/cv-addmenu.png",full_page=True)
        pg.click('[data-add-oi="Механизмы и производственное оборудование"]'); pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}/cv-mech-mono.png",full_page=True)
        pg.click('[data-mech-mode="complex"]'); pg.wait_for_timeout(300)
        pg.click('[data-mech-add]'); pg.wait_for_timeout(300)
        pg.click('[data-mech-add]'); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/cv-mech-complex.png",full_page=True)
        pg.click('[data-mech-save]'); pg.wait_for_timeout(600)
        pg.screenshot(path=f"{OUT}/cv-mech-created.png",full_page=True)

        # заметки, сайдбар, поиск фото, фильтры меню
        pg.goto(BASE+"#/oc/residential-house/oc-rh-1"); pg.wait_for_selector(".card"); pg.wait_for_timeout(350)
        pg.click('[data-notes-toggle]'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/rh-notes.png",full_page=True)
        pg.click('[data-note-add="oc"]'); pg.wait_for_timeout(300)
        pg.click('[data-sidebar-toggle]'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/rh-collapsed.png",full_page=True)
        pg.goto(BASE); pg.wait_for_timeout(600)
        pg.fill('[data-q]','ош'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/menu-search.png",full_page=True)
        pg.fill('[data-q]',''); pg.wait_for_timeout(300)
        pg.click('[data-view="table"]'); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/menu-table.png",full_page=True)
        b.close()
finally:
    srv.terminate()
print("errors:",len(errs))
for e in dict.fromkeys(errs): print("  !",e)
