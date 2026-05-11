const windows = new Map();

const CLEANUP_INTERVAL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of windows) {
    const alive = entries.filter((ts) => ts > now);
    if (alive.length === 0) windows.delete(key);
    else windows.set(key, alive);
  }
}, CLEANUP_INTERVAL).unref();

export function checkRateLimit(ip, key, maxRequests, windowMs) {
  const id = `${key}:${ip}`;
  const now = Date.now();
  const cutoff = now - windowMs;

  const entries = (windows.get(id) || []).filter((ts) => ts > cutoff);
  if (entries.length >= maxRequests) {
    const oldest = entries[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entries.push(now);
  windows.set(id, entries);
  return { allowed: true, retryAfter: 0 };
}
