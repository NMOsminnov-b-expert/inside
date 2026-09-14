// Статическая проверка кода макета.
//
// Зачем она здесь. Проект собран из ES-модулей без сборщика: опечатка в имени
// функции или забытый импорт не всплывают до тех пор, пока человек не откроет
// именно тот экран, где этот код выполняется. Так уже терялись «bindNumField is
// not defined» и «Unexpected identifier» — их ловили руками, по консоли
// браузера. ESLint ловит это до открытия страницы.
//
// Запускается `npm run lint` (или `npx eslint .`). Правил намеренно немного:
// цель — ошибки, а не единый стиль оформления, который в проекте и так
// держится комментариями и ревью.
import js from '@eslint/js';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
    ignores: [
      'node_modules/**',
      // Вендорный PDF.js — чужой минифицированный код, его не правим.
      'app/vendor/**',
      'docs/**',
      'tools/visual-parity/out/**',
      '.claude/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['app/**/*.js'],
    plugins: { 'unused-imports': unusedImports },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Импорт, который в файле не используется, — след переезда кода. Правило
      // отделено от общего no-unused-vars потому, что умеет само убирать такие
      // строки (eslint --fix): вручную по полутора сотням файлов это была бы
      // работа на день с риском задеть соседнюю строку.
      'unused-imports/no-unused-imports': 'error',
      // Неиспользуемое — это либо забытая правка, либо оставшийся после
      // переименования хвост. Аргументы функций не считаем: обработчики часто
      // принимают событие, которое не читают.
      'no-unused-vars': ['error', {
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Обращение к необъявленному имени — тот самый «… is not defined»,
      // который в макете без сборки виден только в консоли браузера.
      'no-undef': 'error',
      // Неразрывный и узкий пробелы в коде — обычно случайная вставка из
      // документа, но в регулярных выражениях они нужны по делу: разбор чисел
      // вычищает именно их из «1 840,50» (kernel/fmt.js).
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipStrings: true }],
      // Пустой блок почти всегда означает недоделанную ветку.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Присваивание в условии — почти всегда описка вместо сравнения.
      'no-cond-assign': 'error',
      // Дубли в объекте: вторая пара молча затирает первую — так уже терялись
      // поля в описаниях колонок.
      'no-dupe-keys': 'error',
      // Недостижимый код после return — след от правки, которую не довели.
      'no-unreachable': 'error',
    },
  },

  {
    // Служебные скрипты Node (граф знаний, обёртка MCP-сервера).
    files: ['.claude/**/*.js', '*.config.js', '*.cjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
