/** Fixed-window counter. Keys are agent ids or "provision", never raw tokens. */

function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  const max = Math.max(1, Number(limit) || 1);
  const span = Math.max(1, Number(windowMs) || 1);
  return {
    allow(key) {
      const now = Date.now();
      const fresh = (hits.get(key) || []).filter((ts) => now - ts < span);
      if (fresh.length >= max) {
        hits.set(key, fresh);
        return false;
      }
      fresh.push(now);
      hits.set(key, fresh);
      return true;
    },
  };
}

module.exports = { createRateLimiter };
