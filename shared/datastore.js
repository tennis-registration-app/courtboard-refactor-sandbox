(function() {
  'use strict';

  // Ensure window.Tennis namespace exists
  window.Tennis = window.Tennis || {};

  // DataStore class with caching for localStorage
  class TennisDataStore {
    constructor() {
      this.cache = new Map();
      this.metrics = {
        cacheHits: 0,
        cacheMisses: 0,
        totalOperations: 0,
        totalResponseTime: 0,
        storageOperationsSaved: 0
      };
      this.warmCache();
    }

    warmCache() {
      // Pre-load common keys into cache
      const keys = [
        'tennisClubData',
        'tennisClubSettings',
        'courtBlocks',
        'tennisDataUpdateTick'
      ];
      
      keys.forEach(key => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try {
          this.cache.set(key, JSON.parse(raw));
        } catch {}
      });
    }

    async get(key) {
      const t0 = performance.now();
      this.metrics.totalOperations++;
      
      if (this.cache.has(key)) {
        this.metrics.cacheHits++;
        this.metrics.totalResponseTime += (performance.now() - t0);
        return this.cache.get(key);
      }
      
      this.metrics.cacheMisses++;
      const raw = localStorage.getItem(key);
      let parsed = null;
      
      if (raw) {
        try {
          parsed = JSON.parse(raw);
          this.cache.set(key, parsed);
        } catch {}
      }
      
      this.metrics.totalResponseTime += (performance.now() - t0);
      return parsed;
    }

    async set(key, data, options = {}) {
      const t0 = performance.now();
      this.metrics.totalOperations++;
      
      // Update cache
      this.cache.set(key, data);
      
      // Special handling for tennisClubData to use Storage.writeJSON
      const S = window.Tennis?.Storage;
      const E = window.Tennis?.Events;
      const DATA_KEY = S?.STORAGE?.DATA;
      const TICK_KEY = S?.STORAGE?.UPDATE_TICK;
      
      if (key === DATA_KEY && S?.writeJSON) {
        const persisted = data;
        try {
          // monotonic tick for freshness (lightweight)
          S.writeJSON(TICK_KEY, Date.now());
          // use guarded write path (StorageGuard will prevent clobbering)
          S.writeJSON(DATA_KEY, persisted);
        } finally {
          // emit both Tennis.Events AND DOM events for maximum compatibility
          E?.emitDom?.('DATA_UPDATED', { key: DATA_KEY, data: persisted });
          E?.emitDom?.('tennisDataUpdate', { key: DATA_KEY, data: persisted });
          
          // Also emit DOM events as backup
          try {
            window.dispatchEvent(new CustomEvent('tennisDataUpdate', {
              detail: { key: DATA_KEY, data: persisted }
            }));
            window.dispatchEvent(new CustomEvent('DATA_UPDATED', {
              detail: { key: DATA_KEY, data: persisted }
            }));
          } catch {}
        }
        this.metrics.totalResponseTime += (performance.now() - t0);
        return persisted;
      }
      
      // Fallback: existing behavior for non-DATA keys
      if (options.immediate || key === 'tennisClubData' || key === 'courtBlocks') {
        try {
          localStorage.setItem(key, JSON.stringify(data));
        } catch {}
      }
      
      this.metrics.totalResponseTime += (performance.now() - t0);
      
      // Emit legacy DOM event for backward compatibility
      try {
        window.dispatchEvent(new CustomEvent('tennisDataUpdate', {
          detail: { key, data }
        }));
      } catch {}
      
      // Emit new Tennis.Events event
      if (window.Tennis && window.Tennis.Events && window.Tennis.Events.emitDom) {
        window.Tennis.Events.emitDom('DATA_UPDATED', { key, data });
      }
    }

    getMetrics() {
      const total = this.metrics.totalOperations || 1;
      const avg = this.metrics.totalResponseTime / total;
      const hit = (this.metrics.cacheHits / total) * 100;
      
      return {
        ...this.metrics,
        avgResponseTime: +avg.toFixed(3),
        cacheHitRate: +hit.toFixed(1)
      };
    }

    clearCache() {
      this.cache.clear();
      this.warmCache();
    }
  }

  // Create and expose a singleton instance
  window.Tennis.DataStore = new TennisDataStore();

})();