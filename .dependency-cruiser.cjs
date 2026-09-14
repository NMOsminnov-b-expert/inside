// Архитектурные правила проекта, проверяемые машиной.
//
// До сих пор они держались на ревью и на памяти: «modules/* → modules/*
// нельзя, кроме карточки участка и карточки квартиры». Правило нарушалось в
// коде и переставало работать как правило — теперь его проверяет
// dependency-cruiser (`npm run lint:arch`).
//
// Источник формулировок — CLAUDE.md, раздел «Архитектурные правила проекта»,
// и app/README.md. Если правило меняется, править надо оба места.
module.exports = {
  forbidden: [
    {
      name: 'нет-кросс-импортов-модулей',
      comment:
        'Пять модулей типов ОЦ изолированы друг от друга: общий код живёт в '
        + 'kernel. Исключения — карточка земельного участка (land-plot/oi/land) '
        + 'и карточка квартиры (apartment/oi/apartment): они одни на весь '
        + 'проект и переиспользуются остальными модулями осознанно.',
      severity: 'error',
      // $1 — имя модуля, пойманное скобками в from.path: «свой» модуль
      // попадает в pathNot и остаётся разрешённым, чужой — нет.
      from: { path: '^app/modules/([^/]+)/' },
      to: {
        path: '^app/modules/',
        pathNot: [
          '^app/modules/$1/',
          '^app/modules/land-plot/oi/land/',
          '^app/modules/apartment/oi/apartment/',
          // Словари участка живут рядом с его карточкой и берутся всеми
          // модулями (data/dictExport.js). Часть того же исключения: участок
          // у всех типов ОЦ один, значит и его перечни одни.
          '^app/modules/land-plot/data/landDicts\.js$',
        ],
      },
    },
    {
      name: 'ядро-не-знает-модулей',
      comment:
        'kernel, shell и pages не знают ни одного типа ОЦ. Единственная дверь '
        + 'наружу — kernel/registry.js, который и существует ради этого.',
      severity: 'error',
      from: { path: '^app/(kernel|shell|pages)/', pathNot: '^app/kernel/registry\\.js$' },
      to: { path: '^app/modules/' },
    },
    {
      name: 'нет-круговых-зависимостей',
      comment:
        'Цикл импортов в модулях без сборки — это гарантированный undefined в '
        + 'одном из файлов, причём проявляется он только на том экране, где '
        + 'модуль загрузился первым.',
      severity: 'error',
      from: {},
      // Циклы ЧЕРЕЗ kernel/registry.js не считаются: реестр знает про модули
      // осознанно и подгружает их лениво, поэтому «kernel → модуль → kernel»
      // в рантайме циклом не является. Настоящих циклов в проекте нет — если
      // появится, правило его покажет.
      to: { circular: true, viaNot: '^app/kernel/registry\.js$' },
    },
    {
      name: 'нет-файлов-сирот',
      comment:
        'Файл, который никто не импортирует, — либо забытый после правки '
        + 'хвост, либо потерянная точка входа.',
      severity: 'warn',
      from: { orphan: true, pathNot: ['^app/(app|main)\\.js$', '\\.css$'] },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^app/vendor/' },
    tsPreCompilationDeps: false,
    reporterOptions: {
      text: { highlightFocused: true },
      dot: { collapsePattern: '^app/(kernel|shell|pages|modules/[^/]+)' },
    },
  },
};
