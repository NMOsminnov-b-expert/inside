// Движение интерфейса — исчезновение (правило графа interfeys-kak-v-mobilnom-vide-u-kazhdogo-interaktivnogo-
// elementa-svoya, 17.11.2026: «Каждый интерактивный элемент имеет свою анимацию»; замечание пользователя
// «"Сетка" открывается и закрывается без анимаций... нарушение»).
//
// Страницы перерисовываются целиком (setHTML), поэтому уходящий элемент сперва проигрывает «уход» —
// класс .anim-out из kernel/motion.css, — и только потом вызывается перерисовка. Появление — классами
// .anim-in* после перерисовки. «Уменьшить движение» в системе — сразу, без анимации.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function leave(el, done, cls = 'anim-out') {
  if (!el || !el.isConnected || reduced()) { done(); return; }
  let fired = false;
  const end = () => { if (fired) return; fired = true; done(); };
  el.classList.add(cls);
  el.addEventListener('animationend', end, { once: true });
  setTimeout(end, 360);   // запасной путь: анимация могла не начаться (элемент скрыт)
}

// Появление уже отрисованного элемента (после перерисовки).
export function enter(el, cls = 'anim-in') {
  if (!el || reduced()) return;
  el.classList.remove(cls);
  void el.offsetWidth;   // перезапуск анимации, если класс уже был
  el.classList.add(cls);
}
