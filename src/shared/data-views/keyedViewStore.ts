export function createKeyedViewStore<State extends object>(defaults: Readonly<State>, normalize: (previous: Readonly<State>, patch: Partial<State>) => Readonly<State>) {
  let snapshot: Readonly<Record<string, Readonly<State>>> = Object.freeze(Object.create(null));
  const listeners = new Set<() => void>();
  const get = (id?: string | null): Readonly<State> => id && Object.hasOwn(snapshot, id) ? snapshot[id] : defaults;
  const publish = (next: Record<string, Readonly<State>>) => {
    snapshot = Object.freeze(next);
    listeners.forEach(listener => listener());
  };
  return {
    get, getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(id: string, patch: Partial<State>) {
      if (typeof id !== 'string' || !id.trim()) throw new Error('数据视图必须指定有效的数据集标识。');
      const previous = get(id);
      const next = Object.freeze(normalize(previous, patch));
      if (JSON.stringify(previous) !== JSON.stringify(next)) publish(Object.assign(Object.create(null), snapshot, { [id]: next }));
      return next;
    },
    retain(ids: readonly string[]) {
      const retained = new Set(ids);
      const entries = Object.entries(snapshot).filter(([id]) => retained.has(id));
      if (entries.length !== Object.keys(snapshot).length) publish(Object.assign(Object.create(null), Object.fromEntries(entries)));
    },
  };
}
