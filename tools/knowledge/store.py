# -*- coding: utf-8 -*-
"""Граф знаний макета в PostgreSQL — хранение, история, выгрузка в файлы.

Решение пользователя 30.10.2026: «все же переносим его целиком в psql. Так
будет надежнее и проще» (запись графа graf-znaniy-v-postgresql-papka-knowledge-vygruzka). Источник
записей — база knowledge в PostgreSQL поиска по смыслу (localhost:5432,
%LOCALAPPDATA%/semsearch; поднимает и гасит svc.py там же). Здесь же:

  * история правок — таблица history (кто, когда, что было, что стало):
    граф не в git (29.10.2026), и журнал правок живёт в базе;
  * полнотекстовый поиск — столбец fts (русская морфология + ID как есть);
  * ежедневная копия базы — .graf/knowledge-backup/, четырнадцать последних.

Папка knowledge/ — выгрузка из базы тем же форматом файлов-констант: её
читают CodeGraph, поиск по смыслу, сборщики документов и программа «Граф
проекта». Файл, изменённый в обход базы (программой или руками), при
следующем обращении к графу забирается в базу (sync); выгрузка не
перезаписывает такой файл, пока он не забран.

Запись в базе — json (не jsonb): порядок полей сохраняется, и выгруженный
файл байт в байт совпадает с тем, что пишет программа (Literal.cs).
"""
import datetime
import glob
import hashlib
import io
import json
import os
import subprocess
import sys
import time

SEMSEARCH = os.path.join(os.environ.get('LOCALAPPDATA') or '', 'semsearch')
PG_BIN = os.path.join(SEMSEARCH, 'pgsql', 'bin')
DB = 'knowledge'
HIDDEN = 0x08000000 if os.name == 'nt' else 0

SCHEMA = r"""
create table if not exists record (
    id          text primary key,
    folder      text not null,
    data        json not null,
    fts         tsvector,
    file_hash   text,
    exported    text,          -- md5(data::text) на момент выгрузки в файл
    updated_at  timestamptz not null default now(),
    updated_by  text
);
alter table record add column if not exists exported text;
create index if not exists record_fts on record using gin (fts);
create index if not exists record_folder on record (folder);

create table if not exists history (
    n       bigserial primary key,
    id      text not null,
    at      timestamptz not null default now(),
    by      text,
    op      text not null,
    old     json,
    new     json
);
create index if not exists history_id on history (id, at desc);

create or replace function record_touch() returns trigger language plpgsql as $$
begin
    new.fts := setweight(to_tsvector('simple', new.id), 'A')
            || setweight(to_tsvector('russian', coalesce(new.data->>'заголовок', '') || ' ' ||
                                                coalesce(new.data->>'термин', '')), 'A')
            || setweight(to_tsvector('russian', coalesce(new.data->>'метки', '')), 'B')
            || setweight(to_tsvector('russian', new.data::text), 'C');
    if tg_op = 'INSERT' or old.data::text is distinct from new.data::text or old.folder <> new.folder then
        new.updated_at := now();
        new.updated_by := coalesce(nullif(current_setting('graf.author', true), ''), current_user);
    end if;
    return new;
end $$;
drop trigger if exists record_touch on record;
create trigger record_touch before insert or update on record for each row execute function record_touch();

create or replace function record_history() returns trigger language plpgsql as $$
declare who text := coalesce(nullif(current_setting('graf.author', true), ''), current_user);
begin
    if tg_op = 'INSERT' then
        insert into history (id, by, op, new) values (new.id, who, 'новая', new.data);
    elsif tg_op = 'DELETE' then
        insert into history (id, by, op, old) values (old.id, who, 'удалена', old.data);
    elsif old.data::text is distinct from new.data::text or old.folder <> new.folder then
        insert into history (id, by, op, old, new) values (new.id, who, 'правка', old.data, new.data);
    end if;
    return null;
end $$;
drop trigger if exists record_history on record;
create trigger record_history after insert or update or delete on record for each row execute function record_history();

-- Для запросов руками: поля записи столбцами и связи строками.
create or replace view rec as
    select id, folder, data->>'вид' as kind, coalesce(data->>'заголовок', data->>'термин') as title,
           data->>'статус' as status, data->>'дата' as date,
           array(select json_array_elements_text(coalesce(data->'метки', '[]'))) as tags,
           data->'пункты' as points, updated_at, updated_by
    from record;
create or replace view link as
    select r.id as src, l->>'тип' as type, l->>'куда' as dst, l as raw
    from record r, json_array_elements(coalesce(r.data->'связи', '[]')) l;
"""


# --- подключение ------------------------------------------------------------

def _password():
    return io.open(os.path.join(SEMSEARCH, 'pgpass.txt'), encoding='ascii').read().strip()


def pg_up():
    exe = os.path.join(PG_BIN, 'pg_isready.exe')
    return subprocess.run([exe, '-h', 'localhost', '-p', '5432', '-q'], stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, creationflags=HIDDEN).returncode == 0


def ensure_pg(wait=40):
    """PostgreSQL поиска по смыслу живёт, только пока нужен (svc.py) — поднять,
    если погашен. Гасит его svc.py, когда потребителей не останется."""
    if pg_up():
        return
    sys.path.insert(0, SEMSEARCH)
    try:
        import svc
        svc.start_pg()
    finally:
        sys.path.remove(SEMSEARCH)
    t0 = time.time()
    while time.time() - t0 < wait:
        if pg_up():
            return
        time.sleep(0.5)
    sys.exit('PostgreSQL графа не поднялся за %d с (%s)' % (wait, SEMSEARCH))


def author():
    try:
        out = subprocess.run(['git', 'config', 'user.name'], stdout=subprocess.PIPE, creationflags=HIDDEN)
        name = out.stdout.decode('utf-8', 'replace').strip()
    except OSError:
        name = ''
    name = name or os.environ.get('USERNAME', '')
    # Правка из Claude Code: в истории видно и чей аккаунт, и что делал помощник.
    return name + (' (Claude Code)' if os.environ.get('CLAUDECODE') else '')


_conn = None


def connect(dbname=DB):
    global _conn
    if dbname == DB and _conn is not None:
        return _conn
    import psycopg
    ensure_pg()
    conn = psycopg.connect(host='localhost', port=5432, user='postgres', password=_password(), dbname=dbname,
                           application_name='graph.py', autocommit=(dbname != DB))
    if dbname == DB:
        conn.execute("select set_config('graf.author', %s, false)", [author()])
        conn.commit()
        _conn = conn
    return conn


def init():
    """База и схема — создать, если нет (повторный вызов безвреден)."""
    admin = connect('postgres')
    if not admin.execute('select 1 from pg_database where datname = %s', [DB]).fetchone():
        # Локаль ru-RU, а не C: с C поиск по морфологии не приводит кириллицу
        # к строчным и не находит «Правило» по «правила» (проверено 30.10.2026).
        admin.execute("create database %s template template0 encoding 'UTF8' locale 'ru-RU'" % DB)
    admin.close()
    conn = connect()
    conn.execute(SCHEMA)
    conn.commit()
    return conn


# --- записи -----------------------------------------------------------------

def rows(folders=None):
    """[(folder, rec)] из базы, по папке и ID — как раньше шёл обход файлов."""
    conn = connect()
    q = 'select folder, data::text from record'
    args = []
    if folders:
        q += ' where folder = any(%s)'
        args.append(list(folders))
    q += ' order by folder, id'
    return [(f, json.loads(d)) for f, d in conn.execute(q, args).fetchall()]


def get(rid):
    r = connect().execute('select folder, data::text from record where id = %s', [rid]).fetchone()
    return (r[0], json.loads(r[1])) if r else (None, None)


def put(folder, rec, commit=True, export=True):
    conn = connect()
    conn.execute('insert into record (id, folder, data) values (%s, %s, %s::json) '
                 'on conflict (id) do update set folder = excluded.folder, data = excluded.data',
                 [rec['id'], folder, json.dumps(rec, ensure_ascii=False)])
    if commit:
        conn.commit()
    if export:
        export_one(folder, rec)


def delete(rid):
    conn = connect()
    folder, rec = get(rid)
    if not rec:
        return False
    conn.execute('delete from record where id = %s', [rid])
    conn.commit()
    p = _path(folder, rid)
    if os.path.exists(p):
        os.remove(p)
    return True


# --- выгрузка в файлы и обратно -------------------------------------------

def _g():
    import graph
    return graph


def _path(folder, rid):
    g = _g()
    return os.path.join(g.HOME, 'knowledge', folder, g.file_name(rid))


def _hash(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def export_one(folder, rec):
    text = _g().render(folder, rec)
    p = _path(folder, rec['id'])
    # Запись сменила папку — прежний файл убрать.
    for old in glob.glob(os.path.join(_g().HOME, 'knowledge', '*', _g().file_name(rec['id']))):
        if os.path.normcase(old) != os.path.normcase(p):
            os.remove(old)
    if not os.path.exists(p) or io.open(p, encoding='utf-8').read() != text:
        _write(p, text)
    conn = connect()
    conn.execute('update record set file_hash = %s, exported = md5(data::text) where id = %s', [_hash(text), rec['id']])
    conn.commit()


def sync(quiet=False):
    """Файлы → база → файлы.

    1. Файл изменён в обход базы (его содержимое не совпадает с тем, что
       выгружалось последним) — разобрать и положить в базу.
    2. Новый файл, которого в базе нет, — в базу.
    3. Запись в базе изменилась (правка запросом) — выгрузить; файл, который
       правили и в базе, и на диске, — база выигрывает, копия файла — в
       .graf/knowledge-conflicts/.
    Возвращает (забрано из файлов, выгружено)."""
    g = _g()
    conn = connect()
    known = {rid: (folder, h) for rid, folder, h in conn.execute('select id, folder, file_hash from record')}
    # По имени файла, без папки: запись, перенесённую в другую папку, старый
    # файл на прежнем месте не делает «правкой на диске».
    by_name = {g.file_name(rid): rid for rid in known}
    taken, written, seen = [], 0, set()
    for folder in g.FOLDERS:
        for p in glob.glob(os.path.join(g.HOME, 'knowledge', folder, '*.py')):
            text = io.open(p, encoding='utf-8').read()
            h = _hash(text)
            rid = by_name.get(os.path.basename(p))
            if rid and known[rid][1] == h:
                seen.add(rid)   # файл как выгружен — разбирать не нужно
                continue
            try:
                rec = g.read(p)
            except (SyntaxError, ValueError) as e:
                print('пропущен файл с ошибкой: %s — %s' % (os.path.relpath(p, g.HOME), e))
                continue
            rid = rec.get('id')
            if not rid:
                continue
            seen.add(rid)
            if rid in known and known[rid][1] and (folder, rec) != get(rid):
                db_text = g.render(*get(rid))
                if db_text != text and _hash(db_text) != known[rid][1]:
                    # Правили и там, и там — база выигрывает, файл — в сторону.
                    side = os.path.join(g.HOME, '.graf', 'knowledge-conflicts',
                                        datetime.datetime.now().strftime('%Y%m%d-%H%M%S-') + os.path.basename(p))
                    _write(side, text)
                    print('конфликт: %s правили и в базе, и в файле; файл сохранён в %s'
                          % (rid, os.path.relpath(side, g.HOME)))
                    continue
            put(folder, rec, commit=False, export=False)
            conn.execute('update record set file_hash = %s, exported = md5(data::text) where id = %s', [h, rid])
            taken.append(rid)
    conn.commit()
    # Выгрузить то, что изменилось в базе (правка запросом) или пропало с диска.
    stale = conn.execute('select folder, data::text from record where exported is distinct from md5(data::text) '
                         'or not (id = any(%s))', [list(seen)]).fetchall()
    for folder, d in stale:
        export_one(folder, json.loads(d))
        written += 1
    if not quiet and (taken or written):
        print('граф: из файлов в базу — %d%s, из базы в файлы — %d'
              % (len(taken), (' (' + ', '.join(taken[:5]) + (' …' if len(taken) > 5 else '') + ')') if taken else '',
                 written))
    return taken, written


def backup(force=False, keep=14):
    """Копия базы раз в день — .graf/knowledge-backup/knowledge-ГГГГ-ММ-ДД.dump
    (pg_dump -Fc; восстановление — pg_restore -c -d knowledge <файл>)."""
    g = _g()
    d = os.path.join(g.HOME, '.graf', 'knowledge-backup')
    os.makedirs(d, exist_ok=True)
    out = os.path.join(d, 'knowledge-%s.dump' % datetime.date.today().isoformat())
    if os.path.exists(out) and not force:
        return None
    env = dict(os.environ, PGPASSWORD=_password())
    r = subprocess.run([os.path.join(PG_BIN, 'pg_dump.exe'), '-h', 'localhost', '-U', 'postgres', '-Fc',
                        '-f', out, DB], env=env, capture_output=True, text=True, creationflags=HIDDEN)
    if r.returncode:
        print('копия базы графа не сделана: ' + r.stderr.strip())
        return None
    for old in sorted(glob.glob(os.path.join(d, 'knowledge-*.dump')))[:-keep]:
        os.remove(old)
    return out


def history(rid=None, limit=30):
    conn = connect()
    q = 'select n, id, at, by, op, old::text, new::text from history'
    args = []
    if rid:
        q += ' where id = %s'
        args.append(rid)
    q += ' order by n desc limit %s'
    args.append(limit)
    return conn.execute(q, args).fetchall()


def find(text, limit=30):
    """Сначала все слова как есть (подстрокой — ID, части слов), затем
    по морфологии (websearch_to_tsquery, русский словарь); порядок — ts_rank."""
    conn = connect()
    words = [w.lower() for w in text.split()]
    sql = """
        with q as (select websearch_to_tsquery('russian', %(t)s) || websearch_to_tsquery('simple', %(t)s) as q)
        select folder, id, coalesce(data->>'заголовок', data->>'термин'), ts_rank(fts, (select q from q)) as rank
        from record
        where (lower(data::text) like all(%(likes)s)) or fts @@ (select q from q)
        order by (lower(data::text) like all(%(likes)s)) desc, rank desc, id
        limit %(lim)s"""
    likes = ['%' + w.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%' for w in words]
    hits = conn.execute(sql, {'t': text, 'likes': likes, 'lim': limit}).fetchall()
    total = conn.execute("""
        with q as (select websearch_to_tsquery('russian', %(t)s) || websearch_to_tsquery('simple', %(t)s) as q)
        select count(*) from record where (lower(data::text) like all(%(likes)s)) or fts @@ (select q from q)""",
                         {'t': text, 'likes': likes}).fetchone()[0]
    return hits, total


def sql(query):
    conn = connect()
    cur = conn.execute(query)
    cols = [c.name for c in cur.description] if cur.description else []
    data = cur.fetchall() if cur.description else []
    conn.commit()
    return cols, data, cur.rowcount
