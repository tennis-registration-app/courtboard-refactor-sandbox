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