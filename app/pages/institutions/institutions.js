// Вкладка «Учреждения» — иерархическая структура организаций.
import { esc, $, $$ } from '../../kernel/dom.js';
import { MENU_HREF } from '../../kernel/router.js';

// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: заменить тестовое дерево данными API и определить
// правила выборки учреждений с учетом прав доступа и объема списка.
// ===== Тестовые данные иерархии учреждений =====
function createInstitutionsTree() {
  return [
    {
      id: 'inst-state',
      name: 'Государство',
      icon: '🏛️',
      type: 'root',
      children: [
        {
          id: 'inst-min',
          name: 'Министерство для ТЕСТА',
          icon: '🏢',
          type: 'ministry',
          children: [
            {
              id: 'inst-uch1',
              name: 'Учреждение 1',
              icon: '📋',
              type: 'institution',
              children: [
                { id: 'inst-fil1', name: 'Филиал 1', icon: '📍', type: 'branch', children: [] },
                { id: 'inst-fil2', name: 'Филиал 2', icon: '📍', type: 'branch', children: [] },
              ],
            },
            {
              id: 'inst-uch2',
              name: 'Подведомственное учреждение',
              icon: '📋',
              type: 'institution',
              children: [
                { id: 'inst-sub1', name: 'Подразделение А', icon: '📍', type: 'section', children: [] },
                { id: 'inst-sub2', name: 'Подразделение Б', icon: '📍', type: 'section', children: [] },
              ],
            },
          ],
        },
        {
          id: 'inst-mayor',
          name: 'Мэрия г. Бишкек',
          icon: '🏢',
          type: 'mayor',
          children: [
            {
              id: 'inst-dept1',
              name: 'Департамент имущества',
              icon: '📋',
              type: 'department',
              children: [
                { id: 'inst-sec1', name: 'Отдел оценки', icon: '📍', type: 'section', children: [] },
                { id: 'inst-sec2', name: 'Отдел учета', icon: '📍', type: 'section', children: [] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'inst-commerce',
      name: 'Коммерческие организации',
      icon: '💼',
      type: 'category',
      children: [
        {
          id: 'inst-company1',
          name: 'ООО "Оценка Плюс"',
          icon: '🏢',
          type: 'company',
          children: [],
        },
        {
          id: 'inst-company2',
          name: 'АО "Независимая оценка"',
          icon: '🏢',
          type: 'company',
          children: [],
        },
      ],
    },
    {
      id: 'inst-persons',
      name: 'Физические лица',
      icon: '👤',
      type: 'category',
      children: [
        { id: 'inst-person1', name: 'Абдылдаев Айсултан', icon: '👤', type: 'person', children: [] },
        { id: 'inst-person2', name: 'Молчанов Кирилл', icon: '👤', type: 'person', children: [] },
      ],
    },
  ];
}

// ===== Иерархия по регионам (альтернативный вид) =====
function createInstitutionsByRegion() {
  return [
    {
      id: 'region-bishkek',
      name: 'г. Бишкек',
      icon: '🗺️',
      type: 'region',
      children: [
        {
          id: 'inst-mayor-bishkek',
          name: 'Мэрия г. Бишкек',
          icon: '🏢',
          type: 'mayor',
          children: [],
        },
        {
          id: 'inst-min-bishkek',
          name: 'Министерство для ТЕСТА (филиал)',
          icon: '🏢',
          type: 'ministry',
          children: [],
        },
      ],
    },
    {
      id: 'region-osh',
      name: 'г. Ош',
      icon: '🗺️',
      type: 'region',
      children: [
        { id: 'inst-mayor-osh', name: 'Мэрия г. Ош', icon: '🏢', type: 'mayor', children: [] },
      ],
    },
  ];
}

export function mountInstitutions(host) {
  const scope = host.scope;

  host.setCrumbs([
    { label: 'Главная', to: MENU_HREF },
    { label: 'Учреждения', current: true },
  ]);
  host.setDrawer(null);
  host.ensureStyle('./app/pages/institutions/institutions.css');

  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: состояние режима, поиска и раскрытия сейчас живет
  // в памяти вкладки; при необходимости выбрать серверное или пользовательское хранение.
  // Состояние интерфейса
  const state = {
    mode: 'hierarchy',  // 'hierarchy' | 'regions'
    search: '',
    selected: null,
    expanded: new Set(),  // id узлов, которые раскрыты
    filteredTree: null,
  };

  // ===== Рендеринг =====
  function getTree() {
    const tree = state.mode === 'hierarchy' ? createInstitutionsTree() : createInstitutionsByRegion();
    const search = state.search.trim().toLocaleLowerCase();
    if (!search) return tree;

    function filterNodes(nodes) {
      return nodes.reduce((result, node) => {
        const children = filterNodes(node.children || []);
        const matches = node.name.toLocaleLowerCase().includes(search);
        if (matches || children.length > 0) {
          result.push({ ...node, children });
        }
        return result;
      }, []);
    }

    return filterNodes(tree);
  }

  function countChildren(node) {
    return (node.children || []).length;
  }

  function renderTreeNode(node, depth = 0) {
    const hasChildren = (node.children || []).length > 0;
    const isExpanded = state.search.trim() ? hasChildren : state.expanded.has(node.id);
    const isSelected = state.selected === node.id;

    const childCount = countChildren(node);
    const childText = childCount > 0 ? `<span class="tree-count">${childCount}</span>` : '';

    const arrow = hasChildren
      ? `<button class="tree-arrow ${isExpanded ? 'open' : ''}" data-toggle-node="${esc(node.id)}" title="Развернуть/свернуть">▶</button>`
      : '<span class="tree-arrow-empty"></span>';

    const nodeClass = isSelected ? ' selected' : '';
    const nodeHTML = `
      <div class="tree-item${nodeClass}" style="--depth:${depth}" data-node-id="${esc(node.id)}">
        <div class="tree-content" data-select-node="${esc(node.id)}">
          ${arrow}
          <span class="tree-icon">${node.icon}</span>
          <span class="tree-name">${esc(node.name)}</span>
          ${childText}
        </div>
      </div>
    `;

    if (!isExpanded || !hasChildren) {
      return nodeHTML;
    }

    const childrenHTML = (node.children || [])
      .map((child) => renderTreeNode(child, depth + 1))
      .join('');

    return nodeHTML + `<div class="tree-children">${childrenHTML}</div>`;
  }

  function renderTree() {
    const tree = getTree();
    const treeHTML = tree.map((node) => renderTreeNode(node)).join('');

    return `
      <div class="inst-panel-tree">
        <div class="tree-actions">
          <button class="btn btn-sm btn-ghost" data-expand-all title="Развернуть всё">▼ Развернуть</button>
          <button class="btn btn-sm btn-ghost" data-collapse-all title="Свернуть всё">▲ Свернуть</button>
        </div>
        <div class="tree-root" data-tree-root>
          ${treeHTML}
        </div>
      </div>
    `;
  }

  function renderContent() {
    if (!state.selected) {
      return `
        <div class="inst-empty">
          <div class="empty-icon">📋</div>
          <h3>Выберите учреждение</h3>
          <p>Выберите учреждение из списка слева, чтобы увидеть информацию о нём.</p>
        </div>
      `;
    }

    // Найти узел по ID
    function findNode(tree, id) {
      for (const node of tree) {
        if (node.id === id) return node;
        const found = findNode(node.children || [], id);
        if (found) return found;
      }
      return null;
    }

    const tree = getTree();
    const node = findNode(tree, state.selected);

    if (!node) {
      return `<div class="inst-empty"><p>Учреждение не найдено</p></div>`;
    }

    // Построить путь (breadcrumbs)
    function findPath(tree, id, path = []) {
      for (const node of tree) {
        const currentPath = [...path, node];
        if (node.id === id) return currentPath;
        const found = findPath(node.children || [], id, currentPath);
        if (found) return found;
      }
      return null;
    }

    const path = findPath(tree, state.selected) || [];
    const breadcrumbs = path.map((n) => `<span>${esc(n.name)}</span>`).join('<span class="sep">→</span>');

    return `
      <div class="inst-content">
        <h2>${esc(node.name)}</h2>
        <div class="inst-breadcrumbs">${breadcrumbs}</div>

        <div class="inst-info">
          <div class="info-row">
            <label>Тип:</label>
            <span>${esc(node.type)}</span>
          </div>
          <div class="info-row">
            <label>ID:</label>
            <span class="mono">${esc(node.id)}</span>
          </div>
          ${node.children && node.children.length > 0 ? `
            <div class="info-row">
              <label>Подведомственные:</label>
              <span>${node.children.length}</span>
            </div>
          ` : ''}
        </div>

        ${node.children && node.children.length > 0 ? `
          <div class="inst-section">
            <h3>Подведомственные учреждения</h3>
            <div class="inst-children-list">
              ${node.children.map((child) => `
                <div class="child-item" data-select-node="${esc(child.id)}">
                  <span class="child-icon">${child.icon}</span>
                  <span class="child-name">${esc(child.name)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="inst-section inst-tabs-stub">
          <h3>Вкладки (в разработке)</h3>
          <p class="muted">• Объекты оценки<br>• Документы<br>• Сотрудники</p>
        </div>
      </div>
    `;
  }

  function render() {
    const html = `
      <div class="inst-main">
        <aside class="inst-panel">
          <div class="panel-head">
            <h3>Учреждения</h3>
          </div>

          <div class="panel-mode">
            <button class="mode-btn ${state.mode === 'hierarchy' ? 'active' : ''}" data-mode-hierarchy>
              По иерархии
            </button>
            <button class="mode-btn ${state.mode === 'regions' ? 'active' : ''}" data-mode-regions>
              По регионам
            </button>
          </div>

          <div class="panel-search">
            <input class="input" data-search-input placeholder="Поиск учреждения…" value="${esc(state.search)}">
          </div>

          ${renderTree()}
        </aside>

        <main class="inst-workspace">
          ${renderContent()}
        </main>
      </div>
    `;

    scope.setHTML(html);
    bindEvents();
  }

  // ===== Обработчики событий =====
  function bindEvents() {
    // Переключение режима
    scope.on('click', '[data-mode-hierarchy]', () => {
      state.mode = 'hierarchy';
      state.expanded.clear();
      state.search = '';
      render();
    });

    scope.on('click', '[data-mode-regions]', () => {
      state.mode = 'regions';
      state.expanded.clear();
      state.search = '';
      render();
    });

    // Раскрытие/сворачивание узлов
    scope.on('click', '[data-toggle-node]', (e) => {
      e.stopPropagation();
      const nodeId = e.target.dataset.toggleNode;
      if (state.expanded.has(nodeId)) {
        state.expanded.delete(nodeId);
      } else {
        state.expanded.add(nodeId);
      }
      render();
    });

    // Выбор узла
    scope.on('click', '[data-select-node]', (e) => {
      e.stopPropagation();
      const nodeId = e.target.closest('[data-select-node]').dataset.selectNode;
      state.selected = nodeId;

      // Убедиться, что родители раскрыты
      function expandParents(tree, id) {
        for (const node of tree) {
          if (node.children) {
            const found = findNodeInTree(node.children, id);
            if (found) {
              state.expanded.add(node.id);
              expandParents(tree, node.id);
            }
          }
        }
      }

      function findNodeInTree(tree, id) {
        if (tree.some((n) => n.id === id)) return true;
        for (const node of tree) {
          if (findNodeInTree(node.children || [], id)) return true;
        }
        return false;
      }

      const tree = getTree();
      expandParents(tree, nodeId);

      render();
    });

    // Развернуть/свернуть всё
    scope.on('click', '[data-expand-all]', () => {
      function collectIds(nodes) {
        const ids = [];
        nodes.forEach((node) => {
          ids.push(node.id);
          if (node.children) ids.push(...collectIds(node.children));
        });
        return ids;
      }
      const tree = getTree();
      state.expanded = new Set(collectIds(tree));
      render();
    });

    scope.on('click', '[data-collapse-all]', () => {
      state.expanded.clear();
      render();
    });

    // Поиск
    scope.on('input', '[data-search-input]', (e) => {
      state.search = e.target.value;
      render();
    });
  }

  render();

  return {
    destroy: () => {
      // очистка
    },
  };
}
