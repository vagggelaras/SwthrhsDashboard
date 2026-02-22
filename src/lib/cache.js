const DEFAULT_TTL = 5 * 60 * 1000 // 5 λεπτά

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }))
}

export function cacheInvalidate(...keys) {
  keys.forEach(k => localStorage.removeItem(k))
}
