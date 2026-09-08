// Запуск MCP-сервера памяти с АБСОЛЮТНЫМ путём к файлу графа.
//
// Зачем обёртка (найдено 08.09.2026). Сервер @modelcontextprotocol/server-memory
// считает относительный MEMORY_FILE_PATH не от корня проекта, а от своей папки
// внутри кэша npx:
//
//   path.isAbsolute(p) ? p : path.join(path.dirname(fileURLToPath(import.meta.url)), p)
//
// Поэтому при относительном пути он всё время работал впустую: чтение возвращало
// пустой граф, а запись падала с ENOENT — каталога .claude/knowledge-graph внутри
// кэша npx нет. Внешне это выглядело как «сервер подключён, но граф пустой».
//
// Прямо в .mcp.json абсолютный путь не написать: файл общий для команды, а
// каталог у каждого свой. Подстановка ${CLAUDE_PROJECT_DIR} не спасает — этой
// переменной в окружении MCP-сервера нет, и раскрывается она в фолбэк «.», то
// есть в ту же папку кэша.
//
// Отсюда обёртка: путь считается от расположения ЭТОГО файла
// (<репозиторий>/.claude/knowledge-graph/tools/), а не от текущего каталога и не
// из переменных окружения. Это работает у любого участника команды и не требует
// ни одной настройки на машине.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const graphDir = resolve(here, '..');               // .claude/knowledge-graph
const memoryFile = join(graphDir, 'memory.jsonl');

// stdio наследуется целиком: MCP говорит через stdin/stdout, и обёртка не должна
// вставать в этот канал — иначе пришлось бы пересылать кадры протокола руками.
// Команда одной строкой, а не командой с массивом доводов: на Windows npx —
// это .cmd, и запустить его можно только через shell, а shell вместе с
// массивом доводов Node объявил устаревшим (DEP0190) и печатает
// предупреждение в stderr на каждый старт. Подстановки здесь нет — строка
// целиком своя, поэтому экранировать нечего.
const child = spawn('npx -y @modelcontextprotocol/server-memory', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, MEMORY_FILE_PATH: memoryFile },
});

child.on('exit', (code, signal) => process.exit(code === null ? (signal ? 1 : 0) : code));
child.on('error', (e) => {
  // Пишем в stderr, а не в stdout: stdout занят протоколом.
  process.stderr.write('memory-server: не удалось запустить npx: ' + e.message + '\n');
  process.exit(1);
});
