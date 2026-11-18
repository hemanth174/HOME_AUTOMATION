import { unstable_cache } from 'next/cache';

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
    const readShared = unstable_cache(
      async () => ({ value: await loader(), storedAt: new Date().toISOString() }),
      ['admin-monitoring', key, String(ttlMs)],
      { revalidate: Math.max(1, Math.ceil(ttlMs / 1000)) },
    );
    const { value, storedAt } = await readShared();
    store.set(key, { value, storedAt, expires: new Date(storedAt).getTime() + ttlMs });
    inflight.delete(key);
    return { ...value, cache: { hit: Date.now() - new Date(storedAt).getTime() > 1000, storedAt } };
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
