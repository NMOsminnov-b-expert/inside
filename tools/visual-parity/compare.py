import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
import numpy as np

OLD="/home/claude/proj"; NEW="/home/claude/work"
OUT_OLD="/home/claude/cmp/old"; OUT_NEW="/home/claude/cmp/new"; OUT_D="/home/claude/cmp/diff"
for d in (OUT_OLD,OUT_NEW,OUT_D): os.makedirs(d, exist_ok=True)

def serve(root, port):
    p = subprocess.Popen([sys.executable,"-m","http.server",str(port),"-d",root],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return p

s1=serve(OLD,8810); s2=serve(NEW,8811); time.sleep(1.3)
errs=[]

def shoot(pg, out, name):
    pg.wait_for_timeout(420)
    el = pg.query_selector('#content')
    el.screenshot(path=f"{out}/{name}.png")

try:
    with sync_playwright() as p:
        b=p.chromium.launch()

        # --- OLD ---
        po=b.new_page(viewport={"width":1600,"height":1000})
        base="http://127.0.0.1:8810/index.html"
        def go_old():
            po.goto(base); po.wait_for_selector(".card"); po.wait_for_timeout(300)
        go_old(); shoot(po,OUT_OLD,"oc-general")
        po.click('[data-tab="docs"]'); shoot(po,OUT_OLD,"oc-docs")
        po.click('[data-tab="photo"]'); shoot(po,OUT_OLD,"oc-photo")
        go_old(); po.click('.chev-btn'); shoot(po,OUT_OLD,"oc-acc")
        go_old(); po.click('tr[data-open-oi="oi-a"]'); shoot(po,OUT_OLD,"oi-building-photo")
        po.click('[data-vmode="doc"]'); shoot(po,OUT_OLD,"oi-building-doc")
        po.click('[data-vmode="compare"]'); shoot(po,OUT_OLD,"oi-building-compare")
        po.click('[data-vclose]'); shoot(po,OUT_OLD,"oi-building-plain")
        go_old(); po.click('tr[data-open-oi="oi-b"]'); po.click('[data-vclose]'); shoot(po,OUT_OLD,"oi-apartment")
        po.fill('[data-apt-storeys]','2'); po.dispatch_event('[data-apt-storeys]','change'); shoot(po,OUT_OLD,"oi-apartment-2")
        go_old(); po.click('tr[data-open-oi="oi-l"]'); po.click('[data-vclose]'); shoot(po,OUT_OLD,"oi-land")
        go_old(); po.click('#btnEditOc'); shoot(po,OUT_OLD,"oc-form")

        # --- NEW ---
        pn=b.new_page(viewport={"width":1600,"height":1000})
        pn.on("pageerror",lambda e:errs.append("PAGEERROR: "+str(e)))
        pn.on("console",lambda m:errs.append("CONSOLE: "+m.text) if m.type=="error" else None)
        root="http://127.0.0.1:8811/app.html"
        def go_new(h="#/oc/residential-house/oc-rh-1"):
            pn.goto(root+h); pn.wait_for_selector(".card", timeout=8000); pn.wait_for_timeout(420)
        go_new(); shoot(pn,OUT_NEW,"oc-general")
        pn.click('[data-tab="docs"]'); shoot(pn,OUT_NEW,"oc-docs")
        pn.click('[data-tab="photo"]'); shoot(pn,OUT_NEW,"oc-photo")
        go_new(); pn.click('.chev-btn'); shoot(pn,OUT_NEW,"oc-acc")
        go_new(); pn.click('tr[data-open-oi="oi-a"]'); shoot(pn,OUT_NEW,"oi-building-photo")
        pn.click('[data-vmode="doc"]'); shoot(pn,OUT_NEW,"oi-building-doc")
        pn.click('[data-vmode="compare"]'); shoot(pn,OUT_NEW,"oi-building-compare")
        pn.click('[data-vclose]'); shoot(pn,OUT_NEW,"oi-building-plain")
        go_new(); pn.click('tr[data-open-oi="oi-b"]'); pn.click('[data-vclose]'); shoot(pn,OUT_NEW,"oi-apartment")
        pn.fill('[data-apt-storeys]','2'); pn.dispatch_event('[data-apt-storeys]','change'); shoot(pn,OUT_NEW,"oi-apartment-2")
        go_new(); pn.click('tr[data-open-oi="oi-l"]'); pn.click('[data-vclose]'); shoot(pn,OUT_NEW,"oi-land")
        go_new(); pn.click('#btnEditOc'); shoot(pn,OUT_NEW,"oc-form")
        b.close()
finally:
    s1.terminate(); s2.terminate()

print("\n== JS errors in new build:", len(errs))
for e in dict.fromkeys(errs): print("  !",e)

print("\n%-24s %-14s %-14s %s" % ("state","old size","new size","diff px (%)"))
for f in sorted(os.listdir(OUT_OLD)):
    a=Image.open(f"{OUT_OLD}/{f}").convert("RGB")
    bp=f"{OUT_NEW}/{f}"
    if not os.path.exists(bp): print("%-24s MISSING NEW"%f); continue
    bb=Image.open(bp).convert("RGB")
    if a.size!=bb.size:
        print("%-24s %-14s %-14s size mismatch"%(f,a.size,bb.size)); continue
    d=ImageChops.difference(a,bb)
    arr=np.array(d).sum(axis=2)
    n=(arr>8).sum(); tot=arr.size
    if n: d.point(lambda v: min(255,v*6)).save(f"{OUT_D}/{f}")
    print("%-24s %-14s %-14s %d (%.3f%%)"%(f,a.size,bb.size,n,100*n/tot))
