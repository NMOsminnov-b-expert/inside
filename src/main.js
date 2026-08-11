import { render } from './app.js';
import { initNotesGlobalListeners } from './features/notes/notesController.js';
import { initDropdownGlobals } from './ui/dropdowns.js';
import { initAccordions } from './ui/accordions.js';

// Порядок регистрации документ-слушателей повторяет порядок
// единого обработчика исходника: заметки -> дропдауны -> аккордеоны.
initNotesGlobalListeners();
initDropdownGlobals();
initAccordions();

render();