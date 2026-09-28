# -*- coding: utf-8 -*-
"""Перенос прежнего графа знаний в реестр knowledge/ (разовый, 28.09.2026).

Решение пользователя 28.09.2026: источник знаний — граф knowledge/ в git,
поиск по нему — CodeGraph (RAG); записи размечаются метками; журналом служит
история коммитов. Прежний граф на сервере памяти MCP с файлами лога в
.claude/knowledge-graph/ снимается: логи в .claude — возможная утечка, а
пересборка кэша из логов стирала то, что записывалось через сервер.

Что переносится:
  * все сущности и связи прежнего графа (кэш memory.jsonl, собранный из всех
    файлов лога);
  * записи, сделанные через сервер памяти без файла лога и стёртые
    пересборкой, — восстановлены из стенограммы сессии (пункты помечены
    «[восстановлено]», у записи метка «восстановлено»);
  * заметки Claude о правилах работы (…/.claude/projects/<проект>/memory).

Одна сущность — один файл knowledge/<папка>/<id>.py (формат —
tools/knowledge/graph.py). Связи пишутся в
запись, из которой выходят. Прежнее имя сущности сохраняется в
«прежнее_имя» — по нему находится запись, на которую ссылались по-старому.

    python tools/knowledge/migrate_from_graph.py <memory.jsonl> <lost.json> <папка заметок>
"""
import glob
import io
import json
import os
import re
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KNOW = os.path.join(ROOT, 'knowledge')

# Тип сущности прежнего графа → вид записи и папка.
KINDS = {
    'Decision': ('решение', 'decisions'),
    'Convention': ('правило', 'rules'),
    'OpenQuestion': ('вопрос', 'questions'),
    'Task': ('задача', 'tasks'),
    'Practice': ('практика', 'practices'),
    'Reference': ('источник', 'sources'),
    'Tool': ('утилита', 'tools'),
    'KernelModule': ('модуль кода', 'code'),
    'Shell': ('модуль кода', 'code'),
    'Page': ('модуль кода', 'code'),
    'DomainModule': ('модуль кода', 'code'),
    'DomainConcept': ('понятие', 'terms'),
    'Project': ('проект', 'project'),
}

TRANSLIT = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
                    ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't',
                     'u', 'f', 'h', 'c', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya']))

# Метки по упоминаниям в тексте: модуль, часть макета, тема.
TOPICS = [
    ('civil', r'\bcivil\b|гражданск'),
    ('apartment', r'\bapartment\b|квартир'),
    ('residential-house', r'residential-house|жило[йм] дом|жилого здания'),
    ('production', r'\bproduction\b|производствен'),
    ('land-plot', r'land-plot|земельн'),
    ('vehicle', r'\bvehicle\b|\bТС\b|транспорт'),
    ('kernel', r'app/kernel|\bядро\b|\bядра\b'),
    ('просмотрщик', r'просмотрщик|viewer'),
    ('реестр-оц', r'реестр ОЦ|ocMenu|реестр объектов'),
    ('проверки', r'tools/checks|run\.py|проверк'),
    ('документы', r'tools/docs|\.docx|\.xlsx|справочник'),
    ('разметка', r'razmetka|разметк'),
    ('методология', r'методолог|класс капитальности|капитальност'),
    ('осмотр', r'осмотр'),
    ('лог-действий', r'лог действий|аудит|«Логи»'),
    ('оформление', r'вёрстк|оформлени|дизайн|интерфейс'),
]


def slug(name):
    s = name.lower()
    s = re.sub(r'^(decision|convention|open|task|practice|ref|probe|otlozheno)\s*:\s*', '', s)
    s = ''.join(TRANSLIT.get(ch, ch) for ch in s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return (s[:70].rstrip('-')) or 'zapis'


def first_date(texts):
    for t in texts:
        m = re.search(r'(\d{2})\.(\d{2})\.(20\d{2})', t)
        if m:
            return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1))
        m = re.search(r'(20\d{2})-(\d{2})-(\d{2})', t)
        if m:
            return m.group(0)
    return ''


def status(kind, name, texts):
    joined = ' '.join(texts[-3:]) if texts else ''
    closed = re.search(r'РЕШЕНО|ЗАКРЫТ|Закрыто|Снято|вопрос для себя закрыл|уже реализовано', joined + ' ' + name)
    if kind == 'вопрос':
        return 'закрыт' if closed else 'открыт'
    if kind == 'задача':
        if re.search(r'ОТЛОЖЕНО|отложено', joined + ' ' + name):
            return 'отложено'
        return 'закрыт' if closed else 'открыт'
    if kind in ('решение', 'правило', 'практика'):
        return 'действует'
    return 'актуально'


def labels(kind, name, texts, extra=()):
    out = [kind]
    body = name + ' ' + ' '.join(texts)
    for tag, rx in TOPICS:
        if re.search(rx, body, re.I):
            out.append(tag)
    out += list(extra)
    return sorted(set(out), key=out.index)




def write(folder, rec):
    graph.save(folder, rec)


def convert_registry():
    """Реестр понятий и полей (YAML, снят с макета) — в тот же вид, что весь
    граф: YAML-значения CodeGraph не читает."""
    n = 0
    for folder in ('concepts', 'fields'):
        for p in sorted(glob.glob(os.path.join(KNOW, folder, '*.yaml'))):
            rec = yaml.safe_load(io.open(p, encoding='utf-8'))
            graph.save(folder, rec)
            os.remove(p)
            n += 1
    return n


def main():
    mem_path, lost_path, notes_dir = sys.argv[1:4]
    print('реестр понятий и полей переведён:', convert_registry())
    ents, rels = {}, []
    for line in io.open(mem_path, encoding='utf-8'):
        x = json.loads(line)
        if x['type'] == 'entity':
            ents[x['name']] = {'type': x['entityType'], 'obs': list(x['observations']), 'restored': False}
        else:
            rels.append((x['from'], x['relationType'], x['to']))
    lost = json.load(io.open(lost_path, encoding='utf-8'))
    for name, e in lost['entities'].items():
        ents[name] = {'type': e['type'] or 'Decision', 'obs': ['[восстановлено] ' + o for o in e['obs']], 'restored': True}
    for name, o in lost['observations']:
        if name in ents and o not in ents[name]['obs']:
            ents[name]['obs'].append('[восстановлено] ' + o)
            ents[name]['restored'] = True
    for r in lost['relations']:
        rels.append(tuple(r))

    # id по имени; совпадения id в одной папке различаются суффиксом.
    ids = {}
    used = {r['id'] for _, _, r in graph.load_all(['concepts', 'fields'])}
    for name, e in ents.items():
        kind, folder = KINDS.get(e['type'], ('заметка', 'misc'))
        base = slug(name)
        sid, n = base, 2
        # ID уникален на весь граф: по нему ссылаются связи из любой папки.
        while sid in used:
            sid, n = '%s-%d' % (base, n), n + 1
        used.add(sid)
        ids[name] = (sid, kind, folder)

    registry = {r['id'] for _, _, r in graph.load_all(['concepts'])}
    count = {}
    for name, e in ents.items():
        sid, kind, folder = ids[name]
        obs = e['obs']
        links = []
        for a, t, b in rels:
            if a == name:
                link = {'тип': t}
                if b in ids:
                    link['куда'] = ids[b][0]
                    link['папка'] = ids[b][2]
                else:
                    link['куда_имя'] = b
                if link not in links:
                    links.append(link)
        title = re.sub(r'^(decision|convention|open|task|practice|ref|otlozheno)\s*:\s*', '', name).strip()
        # Имя латиницей («sravnitelnyy-podhod») — заголовок из первой фразы записи.
        if not re.search('[а-яё]', title, re.I) and '/' not in title and obs:
            title = re.split(r'(?<=[.:;»)])\s|\s—\s', obs[0].replace('[восстановлено] ', ''), maxsplit=1)[0][:110].strip()
        rec = {
            'id': sid,
            'вид': kind,
            'заголовок': title,
            'метки': labels(kind, name, obs, ['восстановлено'] if e['restored'] else []),
            'статус': status(kind, name, obs),
            'дата': first_date(obs),
            'источник': 'прежний граф знаний (перенос 28.09.2026)',
            'прежнее_имя': name,
        }
        if kind == 'понятие':
            match = [r for r in registry if r == slug(title.split('(')[0])]
            if match:
                rec['понятие_реестра'] = match[0]
        if 'ПОД БОЛЬШИМ ВОПРОСОМ' in ' '.join(obs):
            rec['метки'].append('под-вопросом')
        rec['пункты'] = obs
        if links:
            rec['связи'] = links
        write(folder, rec)
        count[folder] = count.get(folder, 0) + 1

    # Заметки Claude о правилах работы — правила с меткой «работа-с-claude».
    for p in sorted(glob.glob(os.path.join(notes_dir, '*.md'))):
        if os.path.basename(p) == 'MEMORY.md':
            continue
        text = io.open(p, encoding='utf-8').read()
        m = re.match(r'---\n(.*?)\n---\n(.*)', text, re.S)
        head = yaml.safe_load(m.group(1)) if m else {}
        body = (m.group(2) if m else text).strip()
        name = head.get('name') or os.path.splitext(os.path.basename(p))[0]
        paras = [x.strip() for x in re.split(r'\n\s*\n', body) if x.strip()]
        rec = {
            'id': 'claude-' + slug(name),
            'вид': 'правило',
            'заголовок': head.get('description', name),
            'метки': labels('правило', name, paras, ['работа-с-claude']),
            'статус': 'действует',
            'дата': first_date(paras),
            'источник': 'заметки Claude о работе с пользователем (перенос 28.09.2026)',
            'пункты': paras,
        }
        write('rules', rec)
        count['rules'] = count.get('rules', 0) + 1
    # Правила из CLAUDE.md: раздел верхнего уровня — запись. Разделы про
    # прежний граф на сервере памяти — со статусом «отменено»: механизм снят.
    md = io.open(os.path.join(ROOT, 'CLAUDE.md'), encoding='utf-8').read()
    for sec in re.split(r'\n(?=# )', '\n' + md):
        sec = sec.strip()
        if not sec.startswith('# '):
            continue
        head, _, body = sec.partition('\n')
        title = head[2:].strip()
        paras = [x.strip() for x in re.split(r'\n\s*\n', body) if x.strip()]
        old = re.search(r'Граф знаний|knowledge-graph|Восстановление после сбоя MCP', title + ' ' + body[:400]) is not None
        rec = {
            'id': 'claude-md-' + slug(title),
            'вид': 'правило',
            'заголовок': title,
            'метки': labels('правило', title, paras, ['claude-md'] + (['прежний-граф'] if old else [])),
            'статус': 'отменено' if old else 'действует',
            'дата': first_date(paras),
            'источник': 'CLAUDE.md проекта (перенос 28.09.2026)',
            'пункты': paras,
        }
        write('rules', rec)
        count['rules'] = count.get('rules', 0) + 1
    print('записей по папкам:', count, '— всего', sum(count.values()))
    print('связей:', len(rels))


if __name__ == '__main__':
    main()
