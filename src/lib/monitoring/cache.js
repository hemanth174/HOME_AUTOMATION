const store = new Map();
const inflight = new Map();

export function cacheKey(parts) {
  return JSON.stringify(parts);
}

export async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expires > now) {
    return { ...existing.value, cache: { hit: true, storedAt: existing.storedAt } };
  }
  if (inflight.has(key)) {
    return inflight.get(key);
  }
  const task = (async () => {
    const value = await loader();
    store.set(key, { value, storedAt: new Date().toISOString(), expires: Date.now() + ttlMs });
    inflight.delete(key);
    return { ...value, cache: { hit: false, storedAt: new Date().toISOString() } };
  })().catch((error) => {
    inflight.delete(key);
    throw error;
  });
  inflight.set(key, task);
  return task;
}

export function clearCache(prefix) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
