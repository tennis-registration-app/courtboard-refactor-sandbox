(function() {
  'use strict';

  // Ensure window.Tennis namespace exists
  window.Tennis = window.Tennis || {};

  // Storage module that delegates to window.APP_UTILS from shared-utils.js
  window.Tennis.Storage = {
    // Re-expose storage constants
    KEYS: {
      DATA: 'tennisClubData',
      SETTINGS: 'tennisClubSettings',
      BLOCKS: 'courtBlocks',
      HISTORICAL_GAMES: 'tennisHistoricalGames',
      UPDATE_TICK: 'tennisDataUpdateTick'
    },

    // Delegate to APP_UTILS functions
    readJSON: function(key) {
      if (window.APP_UTILS && window.APP_UTILS.readJSON) {
        return window.APP_UTILS.readJSON(key);
      }
      // Fallback implementation
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },

    writeJSON: function(key, val) {
      if (window.APP_UTILS && window.APP_UTILS.writeJSON) {
        return window.APP_UTILS.writeJSON(key, val);
      }
      // Fallback implementation
      try {
        localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch {
        return false;
      }
    },

    readDataSafe: function() {
      if (window.APP_UTILS && window.APP_UTILS.readDataSafe) {
        return window.APP_UTILS.readDataSafe();
      }
      // Fallback implementation
      return this.readJSON(this.KEYS.DATA) || this.getEmptyData();
    },

    getEmptyData: function() {
      if (window.APP_UTILS && window.APP_UTILS.getEmptyData) {
        return window.APP_UTILS.getEmptyData();
      }
      // Fallback implementation
      return {
        __schema: 1,
        courts: Array(12).fill(null),
        waitingGroups: [],
        recentlyCleared: [],
        calculatedAvailability: null
      };
    },

    // New function to list all tennis-related keys
    listAllKeys: function() {
      const keywords = ['tennis', 'court', 'ball', 'guest', 'analytics'];
      const allKeys = [];
      
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && keywords.some(keyword => key.toLowerCase().includes(keyword))) {
            allKeys.push(key);
          }
        }
      } catch (e) {
        console.error('Error listing localStorage keys:', e);
      }
      
      return allKeys;
    },

    };

  // expose constants so callers can use Tennis.Storage.STORAGE / EVENTS
  window.Tennis.Storage.STORAGE = window.Tennis.Storage.STORAGE || window.APP_UTILS.STORAGE;
  window.Tennis.Storage.EVENTS = window.Tennis.Storage.EVENTS || window.APP_UTILS.EVENTS;

})();

(function installDataWriteGuard(S){
  try {
    if (!S || S.__dataWriteGuardInstalled) return;
    const DATA_KEY = S.STORAGE && S.STORAGE.DATA;
    const TICK_KEY = S.STORAGE && S.STORAGE.UPDATE_TICK;
    const origWrite = S.writeJSON.bind(S);

    function countAssigned(obj) {
      return (obj?.courts || []).filter(c => !!c?.current).length;
    }
    function hasFutureCurrent(obj, now) {
      return (obj?.courts || []).some(c => {
        const end = c?.current?.endTime ? new Date(c.current.endTime) : null;
        return end && !isNaN(end) && end > now;
      });
    }

    S.writeJSON = function guardedWriteJSON(key, value) {
      try {
        if (key === DATA_KEY) {
          const now = new Date();
          const current = S.readDataSafe();
          const currAssigned = countAssigned(current);
          const nextAssigned = countAssigned(value);

          // Core guard: don't overwrite active courts with an empty snapshot
          if (currAssigned > 0 && nextAssigned === 0 && hasFutureCurrent(current, now)) {
            console.warn('[StorageGuard] Skip DATA overwrite: candidate has assigned=0 but live data has active courts with future end times');
            // Nudge listeners to recompute with current data (no state loss)
            try {
              const E = (window.Tennis && window.Tennis.Events);
              E && typeof E.emitDom === 'function' && E.emitDom('DATA_UPDATED', { key, data: current });
              E && typeof E.emitDom === 'function' && E.emitDom('tennisDataUpdate', { key, data: current });
            } catch {}
            return current;
          }

          // Monotonic update tick (helps future freshness checks)
          const currTick = S.readJSON(TICK_KEY) || 0;
          const incomingTick = (value && value.__tick) || 0; // optional if any writer adds it
          const newTick = Math.max(currTick + 1, Date.now(), incomingTick);

          const res = origWrite(key, value);
          if (TICK_KEY) origWrite(TICK_KEY, newTick);
          return res;
        }
      } catch (e) {
        console.warn('[StorageGuard] guard error:', e && e.message);
      }
      return origWrite(key, value);
    };

    S.__dataWriteGuardInstalled = true;
  } catch (e) {
    console.warn('[StorageGuard] install failed:', e && e.message);
  }
})(window.Tennis && window.Tennis.Storage);

// ---- Hardening guard: prevent clobbering active courts with empty snapshots ----
(function hardenStorage(S){
  try {
    if (!S || S.__guarded) return;
    const DATA_KEY = S.STORAGE?.DATA;
    const Events   = window.Tennis?.Events;
    const asCount  = (obj) => (obj?.courts || []).filter(c => !!c?.current).length;
    const hasFuture = (obj, now) =>
      (obj?.courts || []).some(c => {
        const end = c?.current?.endTime ? new Date(c.current.endTime) : null;
        return end && !isNaN(end) && end > now;
      });

    const orig = S.writeJSON;
    S.writeJSON = function wrappedWriteJSON(key, value) {
      if (key === DATA_KEY) {
        try {
          const now          = new Date();
          const current      = S.readDataSafe();
          const currAssigned = asCount(current);
          const nextAssigned = asCount(value);

          // Guard: if we have live courts with future end times, don't accept a write that zeroes them out.
          if (currAssigned > 0 && nextAssigned === 0 && hasFuture(current, now)) {
            console.warn('[StorageGuard] Skip DATA write: would clear active courts with future end times');
            if (Events?.emitDom) {
              // Keep all listeners in sync with the current, preserved state
              Events.emitDom('DATA_UPDATED', { key: DATA_KEY, data: current });
              Events.emitDom('tennisDataUpdate', { key: DATA_KEY, data: current });
            }
            return current; // do not overwrite
          }
        } catch (e) {
          console.warn('[StorageGuard] check failed:', e?.message);
        }
      }
      return orig.apply(this, arguments);
    };
    S.__guarded = true;
  } catch (e) {
    console.warn('Failed to install StorageGuard:', e?.message);
  }
})(window.Tennis?.Storage);
// ---- End hardening guard ----