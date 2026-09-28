# -*- coding: utf-8 -*-
"""Граф проекта картинкой: все записи knowledge/ узлами, связи — рёбрами.

    python tools/knowledge/view_graph.py          собрать local-docs/graf-proekta.html
    python tools/knowledge/view_graph.py --open   собрать и открыть в браузере

Страница — один файл: данные и библиотеки (tools/knowledge/vendor) внутри,
открывается без интернета и ничего не запрашивает снаружи. Лежит в
local-docs/ (в .gitignore): в ней все знания проекта, наружу они не уходят.

На странице: 2D и 3D (переключатель), цвет узла — вид записи, размер — число
связей; поиск по заголовку, ID и меткам; фильтры по виду, метке и статусу;
щелчок по узлу — карточка записи с пунктами и связями, соседи подсвечены,
переход по связи — щелчком.
"""
import io
import json
import os
import sys
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(graph.ROOT, 'local-docs', 'graf-proekta.html')

# Цвет по папке: соседние по смыслу виды — разными тонами.
COLORS = {
    'decisions': '#4E79A7', 'rules': '#E15759', 'questions': '#F28E2B', 'tasks': '#EDC948',
    'practices': '#59A14F', 'sources': '#B07AA1', 'tools': '#76B7B2', 'code': '#9C755F',
    'terms': '#FF9DA7', 'concepts': '#86BCB6', 'fields': '#BAB0AC', 'project': '#1F1F1F',
}
NAMES = {
    'decisions': 'Решения', 'rules': 'Правила', 'questions': 'Вопросы', 'tasks': 'Задачи',
    'practices': 'Практики', 'sources': 'Источники', 'tools': 'Утилиты', 'code': 'Модули кода',
    'terms': 'Понятия (пояснения)', 'concepts': 'Реестр: понятия', 'fields': 'Реестр: поля', 'project': 'Проект',
}


def data():
    nodes, links = [], []
    for folder, path, r in graph.load_all():
        nodes.append({
            'id': r['id'], 'f': folder, 't': r.get('заголовок') or r.get('термин') or r['id'],
            'tags': r.get('метки') or [], 's': r.get('статус') or '', 'd': r.get('дата') or '',
            'p': [str(x) for x in (r.get('пункты') or [])][:40],
            'file': os.path.relpath(path, graph.ROOT).replace('\\', '/'),
        })
        for l in r.get('связи') or []:
            if l.get('куда'):
                links.append({'source': r['id'], 'target': l['куда'], 'type': l.get('тип', '')})
        # Понятие с пояснениями — к записи реестра.
        if r.get('понятие_реестра'):
            links.append({'source': r['id'], 'target': r['понятие_реестра'], 'type': 'пояснение к'})
    ids = {n['id'] for n in nodes}
    links = [l for l in links if l['target'] in ids]
    return {'nodes': nodes, 'links': links, 'colors': COLORS, 'names': NAMES}


def build():
    lib2 = io.open(os.path.join(HERE, 'vendor', 'force-graph.min.js'), encoding='utf-8').read()
    lib3 = io.open(os.path.join(HERE, 'vendor', '3d-force-graph.min.js'), encoding='utf-8').read()
    d = json.dumps(data(), ensure_ascii=False).replace('</', '<\\/')
    html = (PAGE.replace('/*LIB2D*/', lib2.replace('</script', '<\\/script'))
            .replace('/*LIB3D*/', lib3.replace('</script', '<\\/script'))
            .replace('{{DATA}}', d))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, 'w', encoding='utf-8').write(html)
    return OUT


PAGE = r'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Граф проекта</title>
<style>
:root{--ink:#1C2A35;--muted:#5F7180;--line:#D5DDE3;--panel:#fff;--soft:#E3EEF6;--accent:#1F5F8B;--stage:#0F1720}
*{box-sizing:border-box}
html,body{margin:0;height:100%;font:14px/1.45 "Segoe UI",system-ui,Arial,sans-serif;color:var(--ink);background:var(--stage)}
.app{display:grid;grid-template-columns:260px minmax(0,1fr) 380px;grid-template-rows:auto 1fr;height:100vh}
header{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--panel);border-bottom:1px solid var(--line)}
header h1{font-size:16px;margin:0 12px 0 0}
header label.row{flex:0 0 auto;gap:6px}
header input[type=search]{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;width:320px}
header input[type=search]:focus{outline:2px solid var(--accent);outline-offset:1px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{font:600 13px inherit;padding:6px 14px;border:0;background:#fff;cursor:pointer}
.seg button.on{background:var(--accent);color:#fff}
button.plain{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:pointer}
button.plain:hover{background:var(--soft)}
#count{color:var(--muted);margin-left:auto}
aside{background:var(--panel);overflow:auto;padding:12px 14px}
aside.left{border-right:1px solid var(--line)}
aside.right{border-left:1px solid var(--line)}
h2{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}
h2:first-child{margin-top:0}
label.row{display:flex;align-items:center;gap:8px;padding:2px 0;cursor:pointer}
.sw{width:12px;height:12px;border-radius:50%;flex:0 0 12px}
.n{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
.tags{display:flex;flex-wrap:wrap;gap:4px}
.tag{font:12px inherit;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer}
.tag.on{background:var(--accent);border-color:var(--accent);color:#fff}
#stage{position:relative;overflow:hidden}
#tip{position:absolute;pointer-events:none;background:rgba(255,255,255,.95);padding:4px 8px;border-radius:6px;font-size:12px;display:none;max-width:360px}
.card h3{font-size:16px;margin:0 0 6px;text-wrap:balance}
.meta{color:var(--muted);font-size:12px;margin-bottom:8px}
.card ul{padding-left:18px;margin:6px 0}
.card li{margin:0 0 6px}
.lk{display:block;width:100%;text-align:left;font:inherit;border:0;background:none;padding:3px 0;cursor:pointer;color:var(--accent)}
.lk:hover{text-decoration:underline}
.lk small{color:var(--muted)}
.empty{color:var(--muted)}
code{font-size:12px;background:#F3F5F7;padding:1px 4px;border-radius:4px}
</style>
</head>
<body>
<div class="app">
<header>
  <h1>Граф проекта</h1>
  <input id="q" type="search" placeholder="Поиск: заголовок, ID, метка — Enter" aria-label="Поиск по графу">
  <div class="seg" role="group" aria-label="Вид"><button id="v2" class="on">2D</button><button id="v3">3D</button></div>
  <button class="plain" id="fit" title="Весь граф в окне">По окну</button>
  <label class="row"><input type="checkbox" id="lonely"> одиночные узлы</label>
  <span id="count"></span>
</header>
<aside class="left">
  <h2>Вид записи</h2><div id="folders"></div>
  <h2>Статус</h2><div id="statuses"></div>
  <h2>Метки</h2><div class="tags" id="tags"></div>
</aside>
<div id="stage"><div id="tip"></div></div>
<aside class="right"><div class="card" id="card"><p class="empty">Щелчок по узлу — запись: пункты и связи. Колесо — масштаб, перетаскивание — сдвиг, узел можно тянуть.</p></div></aside>
</div>
<script>/*LIB2D*/</script>
<script>/*LIB3D*/</script>
<script type="application/json" id="data">{{DATA}}</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById('data').textContent);
  var byId = {}; D.nodes.forEach(function(n){ byId[n.id] = n; n.deg = 0; n.out = []; n.inc = []; });
  D.links.forEach(function(l){ var a = byId[l.source], b = byId[l.target]; a.deg++; b.deg++; a.out.push(l); b.inc.push(l); });
  var off = {}, tagOn = null, statusOff = {}, showLonely = false, sel = null, mode = '2d', G = null;
  var stage = document.getElementById('stage'), tip = document.getElementById('tip');
  function el(t, c, x){ var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  // Фильтры: виды, статусы, метки.
  var counts = {}, stats = {}, tagc = {};
  D.nodes.forEach(function(n){ counts[n.f] = (counts[n.f] || 0) + 1; if (n.s) stats[n.s] = (stats[n.s] || 0) + 1; n.tags.forEach(function(t){ tagc[t] = (tagc[t] || 0) + 1; }); });
  var fb = document.getElementById('folders');
  Object.keys(D.names).forEach(function(f){
    if (!counts[f]) return;
    var r = el('label', 'row'), c = el('input'); c.type = 'checkbox'; c.checked = true;
    c.onchange = function(){ off[f] = !c.checked; refresh(); };
    var sw = el('span', 'sw'); sw.style.background = D.colors[f];
    r.appendChild(c); r.appendChild(sw); r.appendChild(el('span', null, D.names[f])); r.appendChild(el('span', 'n', counts[f])); fb.appendChild(r);
  });
  var sb = document.getElementById('statuses');
  Object.keys(stats).sort().forEach(function(s){
    var r = el('label', 'row'), c = el('input'); c.type = 'checkbox'; c.checked = true;
    c.onchange = function(){ statusOff[s] = !c.checked; refresh(); };
    r.appendChild(c); r.appendChild(el('span', null, s)); r.appendChild(el('span', 'n', stats[s])); sb.appendChild(r);
  });
  var tb = document.getElementById('tags');
  Object.keys(tagc).sort(function(a, b){ return tagc[b] - tagc[a]; }).forEach(function(t){
    var b = el('button', 'tag', t + ' ' + tagc[t]); b.dataset.t = t;
    b.onclick = function(){ tagOn = tagOn === t ? null : t; Array.prototype.forEach.call(tb.children, function(x){ x.classList.toggle('on', x.dataset.t === tagOn); }); refresh(); };
    tb.appendChild(b);
  });
  document.getElementById('lonely').onchange = function(e){ showLonely = e.target.checked; refresh(); };

  function visible(){
    var nodes = D.nodes.filter(function(n){
      return !off[n.f] && !statusOff[n.s] && (!tagOn || n.tags.indexOf(tagOn) >= 0);
    });
    var ids = {}; nodes.forEach(function(n){ ids[n.id] = 1; });
    var links = D.links.filter(function(l){ return ids[id(l.source)] && ids[id(l.target)]; });
    if (!showLonely){
      var linked = {}; links.forEach(function(l){ linked[id(l.source)] = 1; linked[id(l.target)] = 1; });
      nodes = nodes.filter(function(n){ return linked[n.id] || n === sel; });
    }
    return {nodes: nodes, links: links.map(function(l){ return {source: id(l.source), target: id(l.target), type: l.type}; })};
  }
  function id(x){ return typeof x === 'object' ? x.id : x; }

  // Подсветка: выбранный узел и соседи.
  var near = {};
  function mark(n){
    near = {}; if (!n) return;
    near[n.id] = 1; n.out.forEach(function(l){ near[id(l.target)] = 1; }); n.inc.forEach(function(l){ near[id(l.source)] = 1; });
  }
  function color(n){ var c = D.colors[n.f]; if (sel && !near[n.id]) return c + '33'; return c; }
  function lcolor(l){ if (!sel) return 'rgba(180,195,210,.35)'; return (id(l.source) === sel.id || id(l.target) === sel.id) ? '#FFD166' : 'rgba(180,195,210,.08)'; }
  function size(n){ return 2 + Math.sqrt(n.deg) * 2; }

  function make(){
    if (G && G._destructor) G._destructor();
    var box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0';
    Array.prototype.forEach.call(stage.querySelectorAll('div.gbox'), function(b){ b.remove(); });
    box.className = 'gbox'; stage.insertBefore(box, tip);
    var w = stage.clientWidth, h = stage.clientHeight;
    G = (mode === '2d' ? ForceGraph()(box) : ForceGraph3D()(box))
      .width(w).height(h).backgroundColor('#0F1720')
      .nodeId('id').nodeVal(function(n){ return size(n) * (mode === '3d' ? 1.5 : 1); })
      .nodeColor(color).nodeLabel(function(n){ return ''; })
      .linkColor(lcolor).linkDirectionalArrowLength(mode === '2d' ? 3 : 2.5).linkDirectionalArrowRelPos(1)
      .onNodeClick(function(n){ pick(n.id, true); })
      .onBackgroundClick(function(){ pick(null); })
      .onNodeHover(function(n){ box.style.cursor = n ? 'pointer' : ''; if (!n){ tip.style.display = 'none'; return; }
        tip.textContent = D.names[n.f] + ': ' + n.t; tip.style.display = 'block'; });
    if (mode === '2d'){
      // Подписи: при выбранном узле — только у него и соседей; без выбора —
      // у всех, когда масштаб позволяет их прочесть.
      G.nodeCanvasObjectMode(function(){ return 'after'; }).nodeCanvasObject(function(n, ctx, k){
        if (sel && n.id === sel.id){
          ctx.beginPath(); ctx.arc(n.x, n.y, Math.sqrt(size(n)) * 4 + 3 / k, 0, 2 * Math.PI);
          ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 2 / k; ctx.stroke();
        }
        if (sel ? !near[n.id] : k < 2.2) return;
        var t = n.t.length > 48 ? n.t.slice(0, 48) + '…' : n.t;
        ctx.font = (sel && n.id === sel.id ? 'bold ' : '') + (12 / k) + 'px Segoe UI'; ctx.fillStyle = '#E6ECF2';
        ctx.fillText(t, n.x + Math.sqrt(size(n)) * 4 + 4 / k, n.y + 4 / k);
      });
    }
    G.graphData(visible());
    stage.onmousemove = function(e){ var r = stage.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; };
    setTimeout(function(){ G.zoomToFit(400, 40); }, 900);
    count();
  }
  function refresh(){ G.graphData(visible()); count(); }
  function restyle(){ G.nodeColor(color).linkColor(lcolor); if (mode === '2d') G.nodeCanvasObject(G.nodeCanvasObject()); }
  function count(){ var v = G.graphData(); document.getElementById('count').textContent = 'узлов ' + v.nodes.length + ' из ' + D.nodes.length + ', связей ' + v.links.length; }

  // Карточка записи.
  function pick(nid, focus){
    sel = nid ? byId[nid] : null; mark(sel); restyle();
    var card = document.getElementById('card'); card.innerHTML = '';
    if (!sel){ card.appendChild(el('p', 'empty', 'Щелчок по узлу — запись: пункты и связи.')); return; }
    var inView = G.graphData().nodes.some(function(n){ return n.id === sel.id; });
    if (!inView) refresh();
    card.appendChild(el('h3', null, sel.t));
    var m = el('div', 'meta'); m.textContent = D.names[sel.f] + ' · ' + (sel.s || '—') + (sel.d ? ' · ' + sel.d : '') + ' · ID ' + sel.id; card.appendChild(m);
    var f = el('div', 'meta'); f.appendChild(el('code', null, sel.file)); card.appendChild(f);
    if (sel.tags.length){ var tg = el('div', 'tags'); sel.tags.forEach(function(t){ tg.appendChild(el('span', 'tag', t)); }); card.appendChild(tg); }
    if (sel.p.length){ card.appendChild(el('h2', null, 'Пункты')); var ul = el('ul'); sel.p.forEach(function(p){ ul.appendChild(el('li', null, p)); }); card.appendChild(ul); }
    function list(title, arr, key){
      if (!arr.length) return; card.appendChild(el('h2', null, title + ' · ' + arr.length));
      arr.forEach(function(l){ var o = byId[id(l[key])]; var b = el('button', 'lk'); b.textContent = o.t + ' '; b.appendChild(el('small', null, '(' + l.type + ')'));
        b.onclick = function(){ pick(o.id, true); }; card.appendChild(b); });
    }
    list('Связи отсюда', sel.out, 'target'); list('Связи сюда', sel.inc, 'source');
    if (focus) setTimeout(function(){ var n = G.graphData().nodes.find(function(x){ return x.id === sel.id; }); if (!n) return;
      if (mode === '2d'){ G.centerAt(n.x, n.y, 600); G.zoom(3, 600); }
      else { var d = 90, r = Math.hypot(n.x, n.y, n.z) || 1, k = 1 + d / r; G.cameraPosition({x: n.x * k, y: n.y * k, z: n.z * k}, n, 800); } }, 50);
  }

  // Поиск: Enter — следующий найденный узел.
  var hits = [], at = -1;
  var q = document.getElementById('q');
  q.oninput = function(){ var t = q.value.trim().toLowerCase(); at = -1;
    hits = t ? D.nodes.filter(function(n){ return (n.t + ' ' + n.id + ' ' + n.tags.join(' ')).toLowerCase().indexOf(t) >= 0; }) : []; };
  q.onkeydown = function(e){ if (e.key !== 'Enter' || !hits.length) return; at = (at + 1) % hits.length; pick(hits[at].id, true);
    document.getElementById('count').textContent = 'найдено ' + hits.length + ', ' + (at + 1) + '-й'; };

  document.getElementById('v2').onclick = function(){ if (mode === '2d') return; mode = '2d'; this.classList.add('on'); document.getElementById('v3').classList.remove('on'); make(); };
  document.getElementById('v3').onclick = function(){ if (mode === '3d') return; mode = '3d'; this.classList.add('on'); document.getElementById('v2').classList.remove('on'); make(); };
  document.getElementById('fit').onclick = function(){ G.zoomToFit(500, 40); };
  window.addEventListener('resize', function(){ G.width(stage.clientWidth).height(stage.clientHeight); });
  make();
})();
</script>
</body>
</html>
'''


if __name__ == '__main__':
    out = build()
    print('Готово:', os.path.relpath(out, graph.ROOT), '— %.1f МБ' % (os.path.getsize(out) / 1024 / 1024))
    if '--open' in sys.argv:
        webbrowser.open('file:///' + out.replace('\\', '/'))
