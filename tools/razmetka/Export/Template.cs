namespace Razmetka.Export;

// Страница экспорта: оглавление по главам и разворотам, поиск, легенда
// типов связей; у разворота — картинка и прозрачный слой подсказок поверх
// (щелчок по стрелке, номеру или строке таблицы — подсказка со строкой
// связи; «Закрепить», «К строке таблицы», «То же поле» — переход); под
// разворотом — таблица связей текстом (её можно выделить и скопировать);
// «Крупно» — просмотр с масштабом колесом и сдвигом мышью.
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
:root{--bg:#EEF2F5;--card:#fff;--ink:#1C2A35;--muted:#5F7180;--line:#D5DDE3;--accent:#1F5F8B;--soft:#E3EEF6;
  --shadow:0 1px 2px rgba(20,40,60,.06),0 4px 16px rgba(20,40,60,.06)}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,Arial,sans-serif}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:22px 18px 32px;background:var(--card);border-right:1px solid var(--line)}
nav h1{font-size:18px;line-height:1.3;margin:0 0 14px;text-wrap:balance}
.search{width:100%;font:inherit;padding:7px 10px;border:1px solid var(--line);border-radius:8px}
.search:focus{outline:2px solid var(--accent);outline-offset:1px}
#found{font-size:12px;color:var(--muted);min-height:18px;margin:4px 0 10px}
.legend{list-style:none;margin:0 0 16px;padding:0;font-size:12px;color:var(--muted)}
.legend li{display:flex;align-items:center;gap:8px;margin:2px 0}
.legend svg{flex:0 0 34px}
nav ol{list-style:none;margin:0;padding:0}
.toc-ch{margin:0 0 14px}
.toc-ch>span{display:block;font-weight:600;font-size:12px;letter-spacing:.03em;color:var(--muted);text-transform:uppercase;margin-bottom:4px}
.toc-ch a{display:block;padding:5px 10px;border-radius:6px;color:var(--ink);text-decoration:none;font-size:14px}
.toc-ch a small{display:block;color:var(--muted);font-size:12px}
.toc-ch a:hover{background:var(--soft)}
main{padding:26px 30px 80px;max-width:1900px}
.chapter>h2{font-size:22px;margin:6px 0 16px;text-wrap:balance}
.chapter+.chapter{margin-top:40px}
.fig{background:var(--card);border-radius:10px;box-shadow:var(--shadow);padding:16px 18px 18px;margin:0 0 26px}
.fig header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:10px}
.fig h3{font-size:17px;margin:0}
.fig .page{color:var(--muted);font-size:13px}
.fig header button{margin-left:auto}
button{font:600 13px "Segoe UI",Arial,sans-serif;padding:5px 11px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);cursor:pointer}
button:hover{background:var(--soft)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.stage{position:relative;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff}
.stage img{display:block;width:100%;height:auto}
.stage svg{position:absolute;inset:0;width:100%;height:100%}
.hit{fill:none;stroke:transparent;stroke-width:26;pointer-events:stroke;cursor:pointer}
.hitc{fill:transparent;cursor:pointer}
.halo{fill:none;stroke-width:12;stroke-linejoin:round;opacity:0;transition:opacity .12s;pointer-events:none}
.lk:hover .halo,.lk.on .halo{opacity:.35}
.pin{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#F4B92F;color:#fff;
  font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;cursor:help}
.pop{position:absolute;z-index:3;max-width:380px;background:#fff;border:2px solid var(--c);border-radius:8px;padding:9px 11px;
  box-shadow:0 6px 24px rgba(20,40,60,.22);font-size:14px}
.pop .hd{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.pop .chip{background:var(--c);color:#fff;font-weight:700;border-radius:11px;padding:0 8px}
.pop .kind{color:var(--muted);font-size:12px;flex:1}
.pop .x{border:0;padding:0 4px;font-size:15px;background:none}
.pop .lbl{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.pop p{margin:1px 0 7px}
.pop .bar{display:flex;flex-wrap:wrap;gap:6px}
.pop a{color:var(--accent)}
table.links{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
.links th{text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:6px 10px;border-bottom:1px solid var(--line)}
.links td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.links td.num{width:52px}
.links td.num span{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:13px;
  background:var(--c);color:#fff;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}
.links tr{cursor:pointer}
.links tr:hover td,.links tr.on td{background:var(--soft)}
.links tr.hit-search td{background:#FFF4D6}
.links tr.flash td{animation:fl 1.2s}
@keyframes fl{0%{background:#FFE08A}100%{background:transparent}}
.links .kind{color:var(--muted);font-size:12px;white-space:nowrap}
.viewer{position:fixed;inset:0;background:rgba(18,28,36,.92);display:none;z-index:10}
.viewer.open{display:block}
.viewer .top{position:absolute;left:0;right:0;top:0;height:56px;display:flex;align-items:center;gap:14px;padding:0 14px 0 20px;background:#15212B;color:#fff}
.viewer .top .t{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.viewer .top .h{color:#9FB2C0;font-size:13px}
.viewer .pane{position:absolute;left:0;right:0;top:56px;bottom:0;overflow:hidden;cursor:grab}
.viewer .pane img{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 10px 40px rgba(0,0,0,.4)}
@media (max-width:900px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:14px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.halo{transition:none}}
@media print{nav,.viewer,.pop{display:none}.layout{display:block}.fig{break-inside:avoid;box-shadow:none}}
</style>
</head>
<body>
<div class="layout">
<nav aria-label="Оглавление">
  <h1 id="ttl"></h1>
  <input class="search" id="q" type="search" placeholder="Поиск графы или поля" aria-label="Поиск графы или поля">
  <div id="found" role="status"></div>
  <ul class="legend" id="legend"></ul>
  <ol id="toc"></ol>
</nav>
<main id="main"></main>
</div>
<div class="viewer" id="viewer" role="dialog" aria-modal="true">
  <div class="top"><span class="t" id="vt"></span><span class="h">колесо — масштаб, перетаскивание — сдвиг, Esc — закрыть</span><button id="vx">Закрыть</button></div>
  <div class="pane" id="vp"><img id="vi" alt=""></div>
</div>
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

  // Легенда: тип связи — вид линии, как в программе.
  var dash = {transfer:'', auto:'3 1.5', name:'1 2', none:'6 4'};
  var leg = document.getElementById('legend');
  D.kinds.forEach(function(k){
    var li = el('li'); var s = sv('svg', {width:34, height:10, viewBox:'0 0 34 10'});
    s.appendChild(sv('line', {x1:1, y1:5, x2:33, y2:5, stroke:'#5F7180', 'stroke-width':2.5, 'stroke-dasharray':dash[k.key] || ''}));
    li.appendChild(s); li.appendChild(el('span', null, k.label)); leg.appendChild(li);
  });

  var toc = document.getElementById('toc'), main = document.getElementById('main');
  var rowsOf = {};
  D.chapters.forEach(function(c, ci){
    var li = el('li', 'toc-ch'); li.appendChild(el('span', null, c.title)); var ol = el('ol'); li.appendChild(ol); toc.appendChild(li);
    var sec = el('section', 'chapter'); sec.appendChild(el('h2', null, c.title)); main.appendChild(sec);
    c.sheets.forEach(function(id){
      var s = byId[id]; if (!s) return;
      var a = el('a'); a.href = '#' + id; a.textContent = s.title; a.appendChild(el('small', null, s.page)); var li2 = el('li'); li2.appendChild(a); ol.appendChild(li2);
      sec.appendChild(figure(s));
    });
  });

  function figure(s){
    var art = el('article', 'fig'); art.id = s.id;
    var hd = el('header'); hd.appendChild(el('h3', null, s.title)); hd.appendChild(el('span', 'page', (s.doc ? s.doc + ', ' : '') + s.page));
    var big = el('button', null, 'Крупно'); big.onclick = function(){ openViewer(s); }; hd.appendChild(big);
    art.appendChild(hd);
    var st = el('div', 'stage'); art.appendChild(st);
    var img = el('img'); img.src = 'data:image/jpeg;base64,' + s.img; img.alt = s.title; img.width = s.w; img.height = s.h; st.appendChild(img);
    var svg = sv('svg', {viewBox:'0 0 ' + s.w + ' ' + s.h, preserveAspectRatio:'none'}); st.appendChild(svg);
    s.links.forEach(function(k, i){
      var g = sv('g', {'class':'lk'}); g.dataset.i = i;
      var pts = k.pts.map(function(p){ return p.join(','); }).join(' ');
      g.appendChild(sv('polyline', {'class':'halo', points:pts, stroke:k.color}));
      g.appendChild(sv('polyline', {'class':'hit', points:pts}));
      k.badges.forEach(function(b){ g.appendChild(sv('circle', {'class':'hitc', cx:b[0], cy:b[1], r:20})); });
      if (k.row) g.appendChild(sv('rect', {'class':'hitc', x:k.row[0], y:k.row[1], width:k.row[2], height:k.row[3]}));
      g.addEventListener('click', function(e){ e.stopPropagation(); pop(s, i, false); });
      svg.appendChild(g);
    });
    s.notes.forEach(function(n){
      var p = el('div', 'pin', '!'); p.style.left = (n.x / s.w * 100) + '%'; p.style.top = (n.y / s.h * 100) + '%';
      p.title = n.text + (n.author ? ' — ' + n.author : ''); st.appendChild(p);
    });
    // Таблица связей текстом.
    var tb = el('table', 'links'); var th = el('thead'); var tr = el('tr');
    ['№', s.doc || 'Документ', 'Система', 'Тип'].forEach(function(t){ tr.appendChild(el('th', null, t)); });
    th.appendChild(tr); tb.appendChild(th); var body = el('tbody'); tb.appendChild(body);
    rowsOf[s.id] = [];
    s.links.forEach(function(k, i){
      var r = el('tr'); var n = el('td', 'num'); var chip = el('span', null, String(k.n)); chip.style.setProperty('--c', k.color); n.appendChild(chip);
      r.appendChild(n); r.appendChild(el('td', null, k.doc)); r.appendChild(el('td', null, k.sys)); r.appendChild(el('td', 'kind', k.kindLabel));
      r.onclick = function(){ pop(s, i, false); st.scrollIntoView({block:'center'}); };
      body.appendChild(r); rowsOf[s.id].push(r);
    });
    art.appendChild(tb);
    s.stage = st; s.svg = svg;
    return art;
  }

  // Подсказка: у номера на стрелке; закреплённых может быть несколько.
  var loose = null;
  function mark(s, i){
    Array.prototype.forEach.call(s.svg.querySelectorAll('.lk'), function(g){ g.classList.toggle('on', +g.dataset.i === i); });
    rowsOf[s.id].forEach(function(r, j){ r.classList.toggle('on', j === i); });
  }
  function pop(s, i, pinned){
    var k = s.links[i];
    if (!pinned && loose) loose.remove();
    var p = el('div', 'pop'); p.style.setProperty('--c', k.color);
    var hd = el('div', 'hd'); hd.appendChild(el('span', 'chip', String(k.n))); hd.appendChild(el('span', 'kind', k.kindLabel));
    var x = el('button', 'x', '✕'); x.title = 'Закрыть'; x.onclick = function(){ p.remove(); if (loose === p) loose = null; mark(s, -1); }; hd.appendChild(x);
    p.appendChild(hd);
    p.appendChild(el('div', 'lbl', s.doc || 'Документ')); p.appendChild(el('p', null, k.doc));
    p.appendChild(el('div', 'lbl', 'Система')); p.appendChild(el('p', null, k.sys));
    if (k.also.length){
      p.appendChild(el('div', 'lbl', 'То же поле в других разворотах'));
      var al = el('div', 'bar'); k.also.forEach(function(a){ var b = el('button', null, a.label); b.onclick = function(){ jump(a.sheet, a.n); }; al.appendChild(b); });
      p.appendChild(al);
    }
    var bar = el('div', 'bar'); bar.style.marginTop = '8px';
    if (!pinned){ var pin = el('button', null, 'Закрепить'); pin.onclick = function(){ p.remove(); loose = null; pop(s, i, true); }; bar.appendChild(pin); }
    var row = el('button', null, 'К строке таблицы'); row.onclick = function(){ var r = rowsOf[s.id][i]; r.scrollIntoView({block:'center'}); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }; bar.appendChild(row);
    if (k.url){ var a = el('a', null, 'Открыть ссылку'); a.href = k.url; a.target = '_blank'; a.rel = 'noopener'; a.style.alignSelf = 'center'; bar.appendChild(a); }
    p.appendChild(bar);
    var sc = s.stage.clientWidth / s.w, b = k.badges[0];
    p.style.left = Math.min(b[0] * sc + 18, Math.max(0, s.stage.clientWidth - 390)) + 'px';
    p.style.top = (b[1] * sc + 18) + 'px';
    s.stage.appendChild(p);
    if (!pinned) loose = p;
    mark(s, i);
  }
  function jump(id, n){
    var s = byId[id]; if (!s) return;
    var i = s.links.findIndex(function(k){ return k.n === n; });
    document.getElementById(id).scrollIntoView({block:'start'});
    if (i >= 0) setTimeout(function(){ pop(s, i, false); }, 250);
  }
  document.addEventListener('click', function(e){ if (loose && !loose.contains(e.target) && !e.target.closest('tr')) { loose.remove(); loose = null; } });

  // Поиск: подсвечивает строки таблиц; Enter — к следующей найденной связи.
  var q = document.getElementById('q'), found = document.getElementById('found'), hits = [], at = -1;
  q.addEventListener('input', function(){
    var t = q.value.trim().toLowerCase(); hits = []; at = -1;
    D.sheets.forEach(function(s){ s.links.forEach(function(k, i){
      var on = t && (k.doc.toLowerCase().indexOf(t) >= 0 || k.sys.toLowerCase().indexOf(t) >= 0);
      rowsOf[s.id][i].classList.toggle('hit-search', !!on); if (on) hits.push([s, i]);
    }); });
    found.textContent = t ? (hits.length ? 'Найдено: ' + hits.length + '. Enter — следующая' : 'Не найдено') : '';
  });
  q.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' || !hits.length) return;
    at = (at + 1) % hits.length; var h = hits[at];
    h[0].stage.scrollIntoView({block:'center'}); pop(h[0], h[1], false);
    found.textContent = at + 1 + ' из ' + hits.length + '. Enter — следующая';
  });

  // Просмотр крупно.
  var V = document.getElementById('viewer'), vp = document.getElementById('vp'), vi = document.getElementById('vi'), sc = 1, ox = 0, oy = 0, drag = null;
  function apply(){ vi.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + sc + ')'; }
  function openViewer(s){
    vi.src = 'data:image/jpeg;base64,' + s.img; document.getElementById('vt').textContent = s.title + (s.page ? ' · ' + s.page : '');
    V.classList.add('open'); var r = vp.getBoundingClientRect();
    sc = Math.min(r.width / s.w, r.height / s.h); ox = (r.width - s.w * sc) / 2; oy = (r.height - s.h * sc) / 2; apply();
  }
  function closeViewer(){ V.classList.remove('open'); }
  document.getElementById('vx').onclick = closeViewer;
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeViewer(); });
  vp.addEventListener('wheel', function(e){
    e.preventDefault(); var r = vp.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var k = e.deltaY < 0 ? 1.15 : 1 / 1.15; ox = mx - (mx - ox) * k; oy = my - (my - oy) * k; sc *= k; apply();
  }, {passive:false});
  vp.addEventListener('mousedown', function(e){ drag = [e.clientX - ox, e.clientY - oy]; vp.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', function(e){ if (drag){ ox = e.clientX - drag[0]; oy = e.clientY - drag[1]; apply(); } });
  window.addEventListener('mouseup', function(){ drag = null; vp.style.cursor = ''; });
})();
</script>
</body>
</html>
""";
}
