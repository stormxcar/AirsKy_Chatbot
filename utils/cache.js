// utils/cache.js
class Cache {
  constructor(ttl = 3600000) {
    // 1 hour default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    // Clean expired items
    for (const [key, item] of this.cache.entries()) {
      if (Date.now() - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}

// Airport cache instance
const airportCache = new Cache(3600000); // 1 hour

module.exports = {
  Cache,
  airportCache,
};
