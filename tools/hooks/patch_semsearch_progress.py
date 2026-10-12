# -*- coding: utf-8 -*-
"""Правка semsearch на этой машине: индексатор сообщает долю готового по ходу.

Просьба пользователя 12.10.2026 «добавь ожидаемое время завершения
индексации для qwen» (запись графа graf-vremya-okonchaniya-obnovleniya-
indeksa). Индексатор codebase-mcp сообщал число файлов только в конце пачки,
а дообновление обычно и есть одна пачка (15–18 файлов, 20–30 минут) —
оценивать время окончания было не по чему. После правки:

  indexer.py           — раз в 10 с зовёт progress(доля, файлов, векторов);
                         доля — по объёму файлов: записанные пачки целиком,
                         текущая — по доле посчитанных векторов;
  background_worker.py — пишет её в задание: status_message «progress 0.4123»;
  client.py            — печатает status_message в строке хода; его читает
                         tools/hooks/reindex.py и считает время окончания.

Код semsearch — вне репозитория (%LOCALAPPDATA%\\semsearch), правится на
месте; до правки — копия <файл>.before-eta рядом (откат — вернуть её).
Повторный запуск ничего не меняет. Идущий прогон правка не затрагивает —
доля появится со следующего.

    python tools/hooks/patch_semsearch_progress.py
"""
import io, os, pathlib, shutil, sys

sys.stdout.reconfigure(encoding='utf-8')
BASE = pathlib.Path(os.environ['LOCALAPPDATA']) / 'semsearch'
SRC = BASE / 'src' / 'codebase-mcp' / 'src'
MARK = 'PROGRESS_EVERY_S'

PATCHES = {
    SRC / 'services' / 'indexer.py': [
        ("from typing import Final, Iterator, Literal, Sequence, TypeVar",
         "from typing import Awaitable, Callable, Final, Iterator, Literal, Sequence, TypeVar"),
        ("EMBEDDING_BATCH_SIZE: Final[int] = 5",
         "PROGRESS_EVERY_S: Final[float] = 10.0  # ход в задание — не чаще (12.10.2026, проект inside)\n"
         "EMBEDDING_BATCH_SIZE: Final[int] = 5"),
        ("    force_reindex: bool = False,\n) -> IndexResult:\n",
         "    force_reindex: bool = False,\n"
         "    progress: Callable[[float, int, int], Awaitable[None]] | None = None,\n"
         ") -> IndexResult:\n"),
        ("        all_chunks_to_create: list[tuple[CodeChunk, str]] = []  # для итогов\n        files_processed = 0\n",
         "        all_chunks_to_create: list[tuple[CodeChunk, str]] = []  # для итогов\n"
         "        files_processed = 0\n"
         "\n"
         "        # Ход (правка 12.10.2026, проект inside): доля готового по объёму\n"
         "        # файлов — записанные пачки целиком, текущая — по доле посчитанных\n"
         "        # векторов её фрагментов; не чаще раза в PROGRESS_EVERY_S секунд.\n"
         "        def _size(f: Path) -> int:\n"
         "            try:\n"
         "                return max(1, f.stat().st_size)\n"
         "            except OSError:\n"
         "                return 1\n"
         "\n"
         "        bytes_total = sum(_size(f) for f in files_to_index) or 1\n"
         "        bytes_done = 0\n"
         "        last_report = [0.0]\n"
         "\n"
         "        async def report(frac: float, force: bool = False) -> None:\n"
         "            if progress is None:\n"
         "                return\n"
         "            now_t = time.perf_counter()\n"
         "            if not force and now_t - last_report[0] < PROGRESS_EVERY_S:\n"
         "                return\n"
         "            last_report[0] = now_t\n"
         "            try:\n"
         "                await progress(min(1.0, max(0.0, frac)), files_processed, embeddings_generated)\n"
         "            except Exception as e:  # ход — не повод ронять индексацию\n"
         "                logger.warning(f\"Progress report failed: {e}\")\n"),
        ("            batch_embeddings_all: list[list[float]] = []\n",
         "            batch_embeddings_all: list[list[float]] = []\n"
         "            batch_bytes = sum(_size(f) for f in file_batch)\n"
         "            await report(bytes_done / bytes_total, force=True)\n"),
        ("                    batch_embeddings_all.extend([[] for _ in text_batch])\n",
         "                    batch_embeddings_all.extend([[] for _ in text_batch])\n"
         "                await report((bytes_done + batch_bytes * len(batch_embeddings_all) / max(1, len(batch_chunks))) / bytes_total)\n"),
        ("            files_processed += len(file_batch)\n",
         "            files_processed += len(file_batch)\n"
         "            bytes_done += batch_bytes\n"
         "            await report(bytes_done / bytes_total, force=True)\n"),
    ],
    SRC / 'services' / 'background_worker.py': [
        ("        # 2. Run existing indexer (NO MODIFICATIONS to indexer.py!)\n",
         "        # Ход по пути (PROGRESS_EVERY_S в indexer.py; правка 12.10.2026, проект\n"
         "        # inside): доля готового — в status_message «progress 0.4123»,\n"
         "        # счётчики — в своих полях; по окончании их перезаписывает итог.\n"
         "        async def _progress(frac: float, files: int, chunks: int) -> None:\n"
         "            await update_job(job_id=job_id, status_message=f\"progress {frac:.4f}\",\n"
         "                             files_indexed=files, chunks_created=chunks)\n"
         "\n"
         "        # 2. Run existing indexer (NO MODIFICATIONS to indexer.py!)\n"),
        ("                force_reindex=force_reindex,\n            )\n",
         "                force_reindex=force_reindex,\n"
         "                progress=_progress,\n"
         "            )\n"),
    ],
    BASE / 'client.py': [
        ("                      st.get('error_message') or '', flush=True)",
         "                      st.get('error_message') or '', st.get('status_message') or '', flush=True)  # PROGRESS_EVERY_S: доля хода"),
    ],
}


def main():
    for path, pairs in PATCHES.items():
        raw = io.open(path, encoding='utf-8', newline='').read()
        crlf = '\r\n' in raw
        s = raw.replace('\r\n', '\n')
        if MARK in s:
            print('уже поправлен:', path)
            continue
        for old, new in pairs:
            if s.count(old) != 1:
                sys.exit('не нашлось места правки (%d вхождений) в %s:\n%s' % (s.count(old), path, old))
            s = s.replace(old, new, 1)
        backup = path.with_name(path.name + '.before-eta')
        if not backup.exists():
            shutil.copy2(path, backup)
        io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
        print('поправлен:', path, '(копия —', backup.name + ')')


if __name__ == '__main__':
    main()
