namespace Razmetka.Export;

// Страница экспорта — один HTML-файл, открывается любым браузером без
// интернета. Практика razmetka-dokumentov-stranica-eksporta-masshtab-razvorota-
// na-meste (Google Maps, Mapbox — совместное управление жестами):
//   * каждый разворот — свой просмотрщик: Ctrl (⌘) + колесо — масштаб у
//     курсора (масштаб браузера над разворотом не меняется), обычное колесо
//     листает страницу, перетаскивание — сдвиг, двойной щелчок — приблизить
//     или вписать; два пальца — сдвиг и масштаб; «На весь экран»;
//   * стрелки, номера, заметки и подсказки двигаются вместе с картинкой;
//   * щелчок по стрелке, номеру или строке таблицы — подсказка; под
//     разворотом — таблица связей текстом;
//   * оформление — как программа, светлое и тёмное по настройке системы;
//     оглавление подсвечивает разворот на экране; печать — разворот на лист.
static class Template
{
    public const string Html = """
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
:root{--ground:#F3F4F6;--panel:#FAFAFB;--card:#fff;--line:#E3E5E9;--line2:#CDD1D8;--ink:#1B1F24;--muted:#5E6672;--faint:#8C939E;
  --hover:#EEF0F3;--accent:#0067C0;--soft:#E6F0FA;--paper:#E8EAEE;--warn:#FFF4CE;--shadow:0 1px 2px rgba(20,30,40,.06),0 6px 20px rgba(20,30,40,.07)}
@media (prefers-color-scheme:dark){:root{--ground:#1B1C1F;--panel:#232428;--card:#2C2E33;--line:#393B41;--line2:#4B4E55;--ink:#ECEEF1;--muted:#A7ADB6;
  --faint:#7D838D;--hover:#33353B;--accent:#3B8EEA;--soft:#1D3550;--paper:#16171A;--warn:#4A3B1F;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.3)}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:12px}
body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.5 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
.layout{display:grid;grid-template-columns:292px minmax(0,1fr);min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:20px 14px 32px;background:var(--panel);border-right:1px solid var(--line)}
nav h1{font-size:17px;line-height:1.3;margin:0 4px 14px;text-wrap:balance}
.search{width:100%;font:inherit;padding:7px 10px;border:1px solid var(--line2);border-radius:4px;background:var(--card);color:var(--ink)}
.search:focus{outline:2px solid var(--accent);outline-offset:-1px}
#found{font-size:12px;color:var(--muted);min-height:18px;margin:4px 4px 10px}
.legend{list-style:none;margin:0 4px 14px;padding:0;font-size:12px;color:var(--muted)}
.legend:empty{display:none}
.legend li{display:flex;align-items:center;gap:8px;margin:2px 0}
nav ol{list-style:none;margin:0;padding:0}
.toc-ch{margin:0 0 12px}
.toc-ch>span{display:block;font-weight:600;font-size:13px;margin:0 6px 4px}
.toc-ch a{display:grid;grid-template-columns:22px 1fr;column-gap:4px;padding:5px 8px;border-radius:4px;color:var(--ink);text-decoration:none}
.toc-ch a .n{color:var(--faint);font-size:12px;padding-top:1px}
.toc-ch a small{grid-column:2;color:var(--muted);font-size:12px}
.toc-ch a:hover{background:var(--hover)}
.toc-ch a.on{background:var(--soft);box-shadow:inset 3px 0 0 var(--accent)}
main{padding:22px 28px 80px;min-width:0}
.chapter>h2{font-size:20px;margin:6px 0 14px;text-wrap:balance;display:flex;align-items:baseline;gap:10px}
.chip{font-size:11px;font-weight:600;color:var(--muted);background:var(--hover);border-radius:10px;padding:1px 8px}
.chapter+.chapter{margin-top:36px}
.fig{background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);margin:0 0 24px;overflow:hidden}
.fig header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:12px 14px 10px}
.fig h3{font-size:16px;margin:0}
.fig h3 .n{color:var(--faint);font-weight:600;margin-right:6px}
.fig .meta{color:var(--muted);font-size:13px}
.tools{margin-left:auto;display:flex;align-items:center;gap:4px}
.tools .z{min-width:62px;text-align:center;font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
button{font:600 12px "Segoe UI Variable Text","Segoe UI",sans-serif;padding:5px 10px;border:1px solid var(--line2);border-radius:4px;background:var(--card);color:var(--ink);cursor:pointer}
button:hover{background:var(--hover)}
button:focus-visible,.stage:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.stage{position:relative;overflow:hidden;background:var(--paper);touch-action:pan-y;user-select:none;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.stage.zoomed{cursor:grab}
.stage.drag{cursor:grabbing}
.cam{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.cam img{display:block}
.cam svg{position:absolute;left:0;top:0}
.hit{fill:none;stroke:transparent;stroke-width:26;pointer-events:stroke;cursor:pointer}
.hitc{fill:transparent;cursor:pointer}
.halo{fill:none;stroke-width:12;stroke-linejoin:round;opacity:0;transition:opacity .12s;pointer-events:none}
.lk:hover .halo,.lk.on .halo{opacity:.35}
.pin{position:absolute;width:24px;height:24px;border-radius:50%;background:#F4B92F;color:#fff;font-weight:800;font-size:13px;
  display:flex;align-items:center;justify-content:center;border:2px solid #fff;cursor:help;transform:translate(-50%,-50%) scale(calc(1 / var(--z,1)));transform-origin:center}
.hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .25s}
.hint span{background:rgba(20,24,30,.78);color:#fff;border-radius:6px;padding:8px 14px;font-weight:600}
.hint.show{opacity:1}
.pop{position:absolute;z-index:3;max-width:380px;background:var(--card);color:var(--ink);border:2px solid var(--c);border-radius:8px;padding:9px 11px;
  box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:13px}
.pop .hd{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.pop .num{background:var(--c);color:#fff;font-weight:700;border-radius:11px;padding:0 8px}
.pop .sp{flex:1}
.pop .x{border:0;padding:0 4px;font-size:15px;background:none}
.pop .lbl{font-size:11px;font-weight:600;color:var(--faint)}
.pop p{margin:1px 0 7px}
.pop .bar{display:flex;flex-wrap:wrap;gap:6px}
.pop a{color:var(--accent)}
table.links{width:100%;border-collapse:collapse;font-size:13px}
.links th{text-align:left;font-size:12px;color:var(--muted);font-weight:600;padding:8px 12px;border-bottom:1px solid var(--line)}
.links td{padding:7px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.links tr:last-child td{border-bottom:0}
.links td.num{width:52px}
.links td.num span{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:24px;border-radius:12px;
  background:var(--c);color:#fff;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums;padding:0 6px}
.links td.cm{color:var(--muted);width:24%}
.links tbody tr{cursor:pointer}
.links tbody tr:hover td,.links tr.on td{background:var(--soft)}
.links tr.hit-search td{background:var(--warn)}
.links tr.flash td{animation:fl 1.2s}
@keyframes fl{0%{background:#FFE08A}100%{background:transparent}}
.toc-ch>span{cursor:pointer;display:flex!important;align-items:center;gap:6px}
.toc-ch>span::before{content:"";width:0;height:0;border:4px solid transparent;border-top-color:var(--muted);margin-top:4px;transition:transform .15s}
.toc-ch.shut>span::before{transform:rotate(-90deg);margin-top:0}
.toc-ch.shut>ol{display:none}
.toc-ch li.hide{display:none}
.pager{position:fixed;right:18px;bottom:18px;z-index:5;display:flex;align-items:center;gap:2px;background:var(--card);border:1px solid var(--line);
  border-radius:8px;padding:4px;box-shadow:0 6px 24px rgba(0,0,0,.18)}
.pager button{border:0;background:none;padding:6px 10px;font-size:14px}
.pager button:hover{background:var(--hover)}
.pager .where{max-width:360px;padding:0 8px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.pager .where b{font-variant-numeric:tabular-nums}
.keys{position:fixed;inset:0;z-index:20;background:rgba(10,14,18,.45);display:none;align-items:center;justify-content:center}
.keys.open{display:flex}
.keys .card{background:var(--card);color:var(--ink);border-radius:8px;padding:18px 22px;min-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.keys h2{font-size:16px;margin:0 0 10px}
.keys dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:13px}
.keys dt{text-align:right}
kbd{font:600 11px "Segoe UI",sans-serif;border:1px solid var(--line2);border-bottom-width:2px;border-radius:4px;padding:0 5px;background:var(--card);color:var(--muted)}
.pop .nav{display:flex;align-items:center;gap:2px}
.pop .nav button{border:0;background:none;padding:0 6px;font-size:14px}
.pop .cnt{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.stage:fullscreen{background:var(--paper);border:0;aspect-ratio:auto!important;width:100vw;height:100vh}
@media (max-width:900px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:12px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.halo,.hint{transition:none}}
@media print{nav,.tools,.pop,.hint,.pager,.keys{display:none}.layout{display:block}main{padding:0}.fig{break-inside:avoid;break-after:page;box-shadow:none;border:0}
  .stage{background:#fff}body{background:#fff;color:#000}}
</style>
</head>
<body>
<div class="layout">
<nav aria-label="Оглавление">
  <h1 id="ttl"></h1>
  <input class="search" id="q" type="search" placeholder="Поиск графы или поля — /" aria-label="Поиск графы или поля">
  <div id="found" role="status"></div>
  <ul class="legend" id="legend"></ul>
  <ol id="toc"></ol>
</nav>
<main id="main"></main>
</div>
<div class="pager" id="pager" aria-label="Развороты">
  <button id="pgPrev" title="Предыдущий разворот — K" aria-label="Предыдущий разворот">‹</button>
  <span class="where" id="pgWhere" title="Оглавление"></span>
  <button id="pgNext" title="Следующий разворот — J" aria-label="Следующий разворот">›</button>
  <button id="pgTop" title="Наверх — Home" aria-label="Наверх">⇡</button>
  <button id="pgKeys" title="Клавиши — ?" aria-label="Клавиши">?</button>
</div>
<div class="keys" id="keys" role="dialog" aria-modal="true" aria-label="Клавиши"><div class="card">
  <h2>Клавиши</h2>
  <dl>
    <dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>следующий и предыдущий разворот</dd>
    <dt><kbd>/</kbd></dt><dd>поиск графы, поля или разворота; Enter — следующая, Shift+Enter — предыдущая</dd>
    <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>предыдущая и следующая связь, когда открыта подсказка</dd>
    <dt><kbd>Ctrl</kbd> + колесо</dt><dd>масштаб разворота у курсора</dd>
    <dt>тянуть</dt><dd>сдвиг: левой кнопкой при увеличении, зажатым колесом или правой — всегда</dd>
    <dt>двойной щелчок</dt><dd>приблизить или вписать</dd>
    <dt><kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd></dt><dd>масштаб разворота, на котором фокус</dd>
    <dt><kbd>Esc</kbd></dt><dd>закрыть подсказку, справку, весь экран</dd>
  </dl>
</div></div>
<script type="application/json" id="data">{{DATA}}</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById('data').textContent);
  var byId = {}; D.sheets.forEach(function(s){ byId[s.id] = s; });
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs){ var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  document.getElementById('ttl').textContent = D.title;
  document.title = D.title;

  // Легенда видов линий — только у прежних проектов, где виды были разные.
  var dash = {transfer:'', auto:'3 1.5', name:'1 2', none:'6 4'};
  var leg = document.getElementById('legend');
  D.kinds.forEach(function(k){
    var li = el('li'); var s = sv('svg', {width:34, height:10, viewBox:'0 0 34 10'});
    s.appendChild(sv('line', {x1:1, y1:5, x2:33, y2:5, stroke:'currentColor', 'stroke-width':2.5, 'stroke-dasharray':dash[k.key] || ''}));
    li.appendChild(s); li.appendChild(el('span', null, k.label)); leg.appendChild(li);
  });

  var toc = document.getElementById('toc'), main = document.getElementById('main');
  var rowsOf = {}, tocOf = {}, views = [], order = [], cur = null;
  D.chapters.forEach(function(c){
    var li = el('li', 'toc-ch'); var chh = el('span', null, c.title); chh.title = 'Свернуть или развернуть'; chh.onclick = function(){ li.classList.toggle('shut'); };
    li.appendChild(chh); var ol = el('ol'); li.appendChild(ol); toc.appendChild(li);
    var sec = el('section', 'chapter'); var h = el('h2', null, c.title);
    var first = byId[c.sheets[0]]; if (first && first.doc) h.appendChild(el('span', 'chip', first.doc));
    sec.appendChild(h); main.appendChild(sec);
    c.sheets.forEach(function(id, i){
      var s = byId[id]; if (!s) return;
      var a = el('a'); a.href = '#' + id; a.appendChild(el('span', 'n', String(i + 1))); a.appendChild(el('span', null, s.title));
      a.appendChild(el('small', null, [s.page, 'связей ' + s.links.length].filter(Boolean).join(' · ')));
      var li2 = el('li'); li2.appendChild(a); ol.appendChild(li2); tocOf[id] = a; order.push(s); s.num = i + 1; s.chapterLi = li;
      sec.appendChild(figure(s, i + 1));
    });
  });

  // --- разворот: просмотрщик ------------------------------------------------
  function figure(s, num){
    var art = el('article', 'fig'); art.id = s.id;
    var hd = el('header');
    var h3 = el('h3'); h3.appendChild(el('span', 'n', num + '.')); h3.appendChild(document.createTextNode(s.title)); hd.appendChild(h3);
    hd.appendChild(el('span', 'meta', [s.doc && s.page ? s.doc + ', ' + s.page : s.page, 'связей ' + s.links.length].filter(Boolean).join(' · ')));
    var tools = el('div', 'tools');
    var zOut = el('button', null, '−'), zLbl = el('span', 'z', 'Вписан'), zIn = el('button', null, '+'), fit = el('button', null, 'Вписать'), full = el('button', null, 'На весь экран');
    zOut.title = 'Мельче — Ctrl + колесо'; zIn.title = 'Крупнее — Ctrl + колесо'; fit.title = 'Весь разворот — двойной щелчок'; full.title = 'Разворот на весь экран; Esc — выйти';
    [zOut, zLbl, zIn, fit, full].forEach(function(b){ tools.appendChild(b); });
    hd.appendChild(tools);
    art.appendChild(hd);

    var st = el('div', 'stage'); st.tabIndex = 0; st.setAttribute('aria-label', 'Разворот: Ctrl + колесо — масштаб, перетаскивание — сдвиг');
    st.style.aspectRatio = s.w + ' / ' + s.h;
    var cam = el('div', 'cam'); cam.style.width = s.w + 'px'; cam.style.height = s.h + 'px';
    var img = el('img'); img.src = 'data:image/png;base64,' + s.img; img.alt = s.title; img.width = s.w; img.height = s.h; img.decoding = 'async'; img.loading = 'lazy';
    img.style.width = s.w + 'px'; img.style.height = s.h + 'px'; img.draggable = false; cam.appendChild(img);
    var svg = sv('svg', {width:s.w, height:s.h, viewBox:'0 0 ' + s.w + ' ' + s.h}); cam.appendChild(svg);
    s.links.forEach(function(k, i){
      var g = sv('g', {'class':'lk'}); g.dataset.i = i;
      var pts = k.pts.map(function(p){ return p.join(','); }).join(' ');
      g.appendChild(sv('polyline', {'class':'halo', points:pts, stroke:k.color}));
      g.appendChild(sv('polyline', {'class':'hit', points:pts}));
      k.badges.forEach(function(b){ g.appendChild(sv('circle', {'class':'hitc', cx:b[0], cy:b[1], r:20})); });
      if (k.row) g.appendChild(sv('rect', {'class':'hitc', x:k.row[0], y:k.row[1], width:k.row[2], height:k.row[3]}));
      g.addEventListener('click', function(e){ if (v.moved) return; e.stopPropagation(); pop(s, i, false); });
      svg.appendChild(g);
    });
    s.notes.forEach(function(n){
      var p = el('div', 'pin', '!'); p.style.left = n.x + 'px'; p.style.top = n.y + 'px';
      p.title = n.text + (n.author ? ' — ' + n.author : ''); cam.appendChild(p);
    });
    st.appendChild(cam);
    var hint = el('div', 'hint'); hint.appendChild(el('span', null, 'Ctrl + колесо — приблизить')); st.appendChild(hint);
    art.appendChild(st);

    // Масштаб k — от «вписан» (1) до 12; base — вписанный масштаб.
    var v = {s:s, st:st, cam:cam, k:1, x:0, y:0, base:1, moved:false, pops:[], label:zLbl};
    function base(){
      var W = st.clientWidth, H = st.clientHeight;
      return Math.min(W / s.w, H / s.h) || 1;
    }
    function clamp(){
      var W = st.clientWidth, H = st.clientHeight, cw = s.w * v.base * v.k, ch = s.h * v.base * v.k;
      v.x = cw <= W ? (W - cw) / 2 : Math.min(0, Math.max(W - cw, v.x));
      v.y = ch <= H ? (H - ch) / 2 : Math.min(0, Math.max(H - ch, v.y));
    }
    v.apply = function(){
      v.base = base(); clamp();
      var z = v.base * v.k;
      cam.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + z + ')';
      cam.style.setProperty('--z', z);
      st.classList.toggle('zoomed', v.k > 1.001);
      zLbl.textContent = v.k > 1.001 ? Math.round(v.k * 100) + ' %' : 'Вписан';
      v.pops.forEach(function(p){ place(v, p); });
    };
    v.zoomAt = function(mx, my, f){
      var nk = Math.min(12, Math.max(1, v.k * f)); f = nk / v.k;
      v.x = mx - (mx - v.x) * f; v.y = my - (my - v.y) * f; v.k = nk; v.apply();
    };
    v.fit = function(){ v.k = 1; v.apply(); };
    v.center = function(){ return [st.clientWidth / 2, st.clientHeight / 2]; };
    zIn.onclick = function(){ var c = v.center(); v.zoomAt(c[0], c[1], 1.4); };
    zOut.onclick = function(){ var c = v.center(); v.zoomAt(c[0], c[1], 1 / 1.4); };
    fit.onclick = v.fit;
    full.onclick = function(){ if (document.fullscreenElement === st) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); };
    st.addEventListener('fullscreenchange', function(){ requestAnimationFrame(v.fit); });

    // Ctrl (⌘) + колесо — масштаб разворота, не браузера; обычное колесо —
    // страница, с подсказкой (совместное управление жестами).
    var hintTimer = null;
    st.addEventListener('wheel', function(e){
      if (e.ctrlKey || e.metaKey){
        e.preventDefault();
        var r = st.getBoundingClientRect();
        v.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)));
      } else if (document.fullscreenElement === st){
        e.preventDefault(); v.x -= e.shiftKey ? e.deltaY : e.deltaX; v.y -= e.shiftKey ? 0 : e.deltaY; v.apply();
      } else if (hintShown < 3){
        hint.classList.add('show'); clearTimeout(hintTimer);
        hintTimer = setTimeout(function(){ hint.classList.remove('show'); }, 1100);
        if (!hint.dataset.done){ hint.dataset.done = 1; hintShown++; }
      }
    }, {passive:false});

    // Сдвиг мышью (при увеличении) и двумя пальцами; двойной щелчок —
    // приблизить в 2,5 раза или вписать.
    var ptrs = {}, last = null, pinch = null, start = null, dragged = false;
    st.addEventListener('mousedown', function(e){ if (e.button === 1) e.preventDefault(); });
    st.addEventListener('contextmenu', function(e){ if (dragged) e.preventDefault(); });
    st.addEventListener('pointerdown', function(e){
      ptrs[e.pointerId] = [e.clientX, e.clientY]; v.moved = false;
      // Мышь: левая — сдвиг при увеличении; зажатое колесо и правая — сдвиг
      // всегда (правый щелчок без движения — меню браузера, как обычно).
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || (e.button === 0 && v.k > 1.001))){
        last = [e.clientX, e.clientY]; start = [e.clientX, e.clientY]; st.setPointerCapture(e.pointerId);
        if (e.button === 1) e.preventDefault();
      }
      var ids = Object.keys(ptrs);
      if (ids.length === 2){ var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = {d:Math.hypot(a[0] - b[0], a[1] - b[1]), m:[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}; }
    });
    st.addEventListener('pointermove', function(e){
      if (!(e.pointerId in ptrs)) return;
      ptrs[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(ptrs), r = st.getBoundingClientRect();
      if (pinch && ids.length === 2){
        var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        v.x += m[0] - pinch.m[0]; v.y += m[1] - pinch.m[1];
        v.zoomAt(m[0] - r.left, m[1] - r.top, d / pinch.d); pinch = {d:d, m:m}; v.moved = true; e.preventDefault();
      } else if (last){
        v.x += e.clientX - last[0]; v.y += e.clientY - last[1]; last = [e.clientX, e.clientY];
        if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 3){ v.moved = true; dragged = true; }
        st.classList.add('drag'); v.apply();
      }
    });
    function up(e){ setTimeout(function(){ dragged = false; }, 0); delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null; last = null; st.classList.remove('drag'); setTimeout(function(){ v.moved = false; }, 0); }
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('dblclick', function(e){
      if (v.k > 1.001) v.fit(); else { var r = st.getBoundingClientRect(); v.zoomAt(e.clientX - r.left, e.clientY - r.top, 2.5); }
    });
    // Клавиши на развороте (в фокусе): + и − — масштаб, 0 — вписать, стрелки — сдвиг.
    st.addEventListener('keydown', function(e){
      var c = v.center();
      if (e.key === '+' || e.key === '=') v.zoomAt(c[0], c[1], 1.25);
      else if (e.key === '-') v.zoomAt(c[0], c[1], 1 / 1.25);
      else if (e.key === '0') v.fit();
      else if (v.k > 1.001 && /^Arrow/.test(e.key)){ var d = 60; v.x += e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0; v.y += e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0; v.apply(); }
      else return;
      e.preventDefault();
    });

    // Таблица связей текстом.
    var tb = el('table', 'links'); var th = el('thead'); var tr = el('tr');
    ['№', s.doc || 'Документ', 'Система', 'Комментарий'].forEach(function(t){ tr.appendChild(el('th', null, t)); });
    th.appendChild(tr); tb.appendChild(th); var body = el('tbody'); tb.appendChild(body);
    rowsOf[s.id] = [];
    s.links.forEach(function(k, i){
      var r = el('tr'); var n = el('td', 'num'); var chip = el('span', null, String(k.n)); chip.style.setProperty('--c', k.color); n.appendChild(chip);
      r.appendChild(n); r.appendChild(el('td', null, k.doc)); r.appendChild(el('td', null, k.sys)); r.appendChild(el('td', 'cm', k.comment || ''));
      r.onclick = function(){ st.scrollIntoView({block:'center'}); pop(s, i, false); };
      r.onmouseenter = function(){ mark(s, i); }; r.onmouseleave = function(){ if (!s.popOpen) mark(s, -1); };
      body.appendChild(r); rowsOf[s.id].push(r);
    });
    if (s.links.length) art.appendChild(tb);
    s.view = v; s.svg = svg;
    views.push(v);
    requestAnimationFrame(v.apply);
    return art;
  }
  var hintShown = 0;
  window.addEventListener('resize', function(){ views.forEach(function(v){ v.apply(); }); });

  // --- подсказки ---------------------------------------------------------------
  var loose = null;
  function mark(s, i){
    Array.prototype.forEach.call(s.svg.querySelectorAll('.lk'), function(g){ g.classList.toggle('on', +g.dataset.i === i); });
    rowsOf[s.id].forEach(function(r, j){ r.classList.toggle('on', j === i); });
  }
  function place(v, p){
    var b = p.k.badges[0], z = v.base * v.k, W = v.st.clientWidth;
    p.el.style.left = Math.max(4, Math.min(v.x + b[0] * z + 18, W - Math.min(390, W) - 4)) + 'px';
    p.el.style.top = (v.y + b[1] * z + 18) + 'px';
  }
  function pop(s, i, pinned){
    var k = s.links[i], v = s.view;
    if (!pinned && loose){ loose.close(); }
    var p = el('div', 'pop'); p.style.setProperty('--c', k.color);
    var hd = el('div', 'hd'); hd.appendChild(el('span', 'num', String(k.n)));
    var nav = el('span', 'nav');
    var bp = el('button', null, '‹'); bp.title = 'Предыдущая связь — ←'; bp.onclick = function(e){ e.stopPropagation(); step(-1); };
    var bn = el('button', null, '›'); bn.title = 'Следующая связь — →'; bn.onclick = function(e){ e.stopPropagation(); step(1); };
    nav.appendChild(bp); nav.appendChild(el('span', 'cnt', (i + 1) + ' из ' + s.links.length)); nav.appendChild(bn);
    hd.appendChild(nav); hd.appendChild(el('span', 'sp'));
    function step(d){ var j = (i + d + s.links.length) % s.links.length; item.close(); pop(s, j, false); }
    var item = {k:k, el:p, s:s, step:step};
    item.close = function(){ p.remove(); v.pops = v.pops.filter(function(x){ return x !== item; }); if (loose === item) loose = null; s.popOpen = v.pops.length > 0; if (!s.popOpen) mark(s, -1); };
    var x = el('button', 'x', '✕'); x.title = 'Закрыть'; x.onclick = item.close; hd.appendChild(x);
    p.appendChild(hd);
    p.appendChild(el('div', 'lbl', s.doc || 'Документ')); p.appendChild(el('p', null, k.doc));
    p.appendChild(el('div', 'lbl', 'Система')); p.appendChild(el('p', null, k.sys));
    if (k.comment){ p.appendChild(el('div', 'lbl', 'Комментарий')); p.appendChild(el('p', null, k.comment)); }
    if (k.also.length){
      p.appendChild(el('div', 'lbl', 'То же поле в других разворотах'));
      var al = el('div', 'bar'); k.also.forEach(function(a){ var b = el('button', null, a.label); b.onclick = function(){ jump(a.sheet, a.n); }; al.appendChild(b); });
      p.appendChild(al);
    }
    var bar = el('div', 'bar'); bar.style.marginTop = '8px';
    if (!pinned){ var pin = el('button', null, 'Закрепить'); pin.onclick = function(){ item.close(); pop(s, i, true); }; bar.appendChild(pin); }
    if (k.row){ var row = el('button', null, 'К строке таблицы'); row.onclick = function(){ var r = rowsOf[s.id][i]; r.scrollIntoView({block:'center'}); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }; bar.appendChild(row); }
    if (k.url){ var a = el('a', null, 'Открыть ссылку'); a.href = k.url; a.target = '_blank'; a.rel = 'noopener'; a.style.alignSelf = 'center'; bar.appendChild(a); }
    p.appendChild(bar);
    v.st.appendChild(p); v.pops.push(item);
    // Приближенный разворот подвигается к связи.
    if (v.k > 1.001){
      var b0 = k.badges[0], z = v.base * v.k, px = v.x + b0[0] * z, py = v.y + b0[1] * z, W = v.st.clientWidth, H = v.st.clientHeight;
      if (px < 40 || py < 40 || px > W - 40 || py > H - 40){ v.x = W / 3 - b0[0] * z; v.y = H / 3 - b0[1] * z; v.apply(); }
    }
    place(v, item);
    if (!pinned) loose = item;
    s.popOpen = true; mark(s, i);
  }
  function jump(id, n){
    var s = byId[id]; if (!s) return;
    var i = s.links.findIndex(function(k){ return k.n === n; });
    document.getElementById(id).scrollIntoView({block:'start'});
    if (i >= 0) setTimeout(function(){ pop(s, i, false); }, 250);
  }
  document.addEventListener('click', function(e){ if (loose && !loose.el.contains(e.target) && !e.target.closest('tr') && !e.target.closest('.lk')) loose.close(); });

  // --- оглавление: разворот на экране ----------------------------------------
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if (e.isIntersecting) setCurrent(byId[e.target.id]); });
    }, {rootMargin:'-40% 0px -55% 0px'});
    D.sheets.forEach(function(s){ var a = document.getElementById(s.id); if (a) io.observe(a); });
  }

  function setCurrent(s){
    if (!s || s === cur) return;
    cur = s;
    Object.keys(tocOf).forEach(function(id){ tocOf[id].classList.toggle('on', id === s.id); });
    var a = tocOf[s.id]; if (a){ s.chapterLi.classList.remove('shut'); a.scrollIntoView({block:'nearest'}); }
    var n = order.indexOf(s) + 1;
    pgWhere.innerHTML = ''; var b = el('b', null, n + ' из ' + order.length); pgWhere.appendChild(b); pgWhere.appendChild(document.createTextNode(' · ' + s.title));
    pgWhere.title = s.title + (s.page ? ' · ' + s.page : '');
    if (history.replaceState) history.replaceState(null, '', '#' + s.id);
  }
  function goSheet(d){
    var i = cur ? order.indexOf(cur) : -1, j = Math.max(0, Math.min(order.length - 1, i + d));
    var t = document.getElementById(order[j].id); if (t) t.scrollIntoView({block:'start'});
    setCurrent(order[j]);
  }
  var pgWhere = document.getElementById('pgWhere'), keysBox = document.getElementById('keys');
  document.getElementById('pgPrev').onclick = function(){ goSheet(-1); };
  document.getElementById('pgNext').onclick = function(){ goSheet(1); };
  document.getElementById('pgTop').onclick = function(){ window.scrollTo(0, 0); };
  document.getElementById('pgKeys').onclick = function(){ keysBox.classList.add('open'); };
  keysBox.onclick = function(e){ if (e.target === keysBox) keysBox.classList.remove('open'); };
  pgWhere.onclick = function(){ document.getElementById('q').focus(); };
  // Ссылка с разворотом (#id): развороты строятся скриптом — прокрутить самим.
  var start0 = location.hash && byId[location.hash.slice(1)];
  if (order.length) setCurrent(start0 || order[0]);
  if (start0) requestAnimationFrame(function(){ document.getElementById(start0.id).scrollIntoView({block:'start'}); });

  // --- поиск -------------------------------------------------------------------
  var q = document.getElementById('q'), found = document.getElementById('found'), hits = [], at = -1;
  q.addEventListener('input', function(){
    var t = q.value.trim().toLowerCase(); hits = []; at = -1;
    D.sheets.forEach(function(s){ s.links.forEach(function(k, i){
      var on = t && ((k.doc + ' ' + k.sys + ' ' + (k.comment || '')).toLowerCase().indexOf(t) >= 0);
      rowsOf[s.id][i].classList.toggle('hit-search', !!on); if (on) hits.push([s, i]);
    }); });
    // Оглавление: развороты, у которых совпало название или есть найденная связь.
    var sheetHits = 0;
    order.forEach(function(s){
      var byTitle = t && [s.title, s.page, s.chapter, s.doc].join(' ').toLowerCase().indexOf(t) >= 0;
      var byLink = t && hits.some(function(h){ return h[0] === s; });
      tocOf[s.id].parentNode.classList.toggle('hide', !!t && !byTitle && !byLink);
      if (byTitle) sheetHits++;
    });
    // Главы без совпавших разворотов — прячутся на время поиска.
    document.querySelectorAll('.toc-ch').forEach(function(li){
      if (t) li.classList.remove('shut');
      li.style.display = t && !li.querySelector('li:not(.hide)') ? 'none' : '';
    });
    found.textContent = t ? ((hits.length ? 'Связей: ' + hits.length + '. Enter — следующая, Shift+Enter — предыдущая' : 'Связей не найдено') + (sheetHits ? '; разворотов по названию: ' + sheetHits : '')) : '';
  });
  q.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ q.value = ''; q.dispatchEvent(new Event('input')); q.blur(); return; }
    if (e.key !== 'Enter' || !hits.length) return;
    at = (at + (e.shiftKey ? -1 : 1) + hits.length) % hits.length; var h = hits[at];
    h[0].view.st.scrollIntoView({block:'center'}); pop(h[0], h[1], false);
    found.textContent = at + 1 + ' из ' + hits.length + '. Enter — следующая, Shift+Enter — предыдущая';
  });
  document.addEventListener('keydown', function(e){
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape'){
      if (keysBox.classList.contains('open')){ keysBox.classList.remove('open'); return; }
      if (loose){ loose.close(); return; }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/' && !document.fullscreenElement){ e.preventDefault(); q.focus(); q.select(); }
    else if (e.key === '?'){ keysBox.classList.add('open'); }
    else if (e.key === 'j' || e.key === 'J' || e.key === 'о' || e.key === 'О'){ goSheet(1); }
    else if (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л'){ goSheet(-1); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && loose){ e.preventDefault(); e.stopPropagation(); loose.step(e.key === 'ArrowRight' ? 1 : -1); }
  }, true);
})();
</script>
</body>
</html>
""";
}
