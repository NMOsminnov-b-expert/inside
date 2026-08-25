// Крошечный стор: модуль держит в нём свои данные и своё UI-состояние.
export function createStore(initial) {
  let state = initial;
  const subs = new Set();

  return {
    get state() { return state; },
    set(patch) {
      state = Object.assign(state, patch);
      subs.forEach((fn) => fn(state));
    },
    touch() { subs.forEach((fn) => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
