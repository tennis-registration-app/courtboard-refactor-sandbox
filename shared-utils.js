// ===== Shared utils (no UI changes) =====
(function () {
  // --- Core config
  const COURT_COUNT = 12;

  // --- Storage/Event keys
  const STORAGE = {
    DATA: 'tennisClubData',
    SETTINGS: 'tennisClubSettings',
    BLOCKS: 'courtBlocks',
    HISTORICAL_GAMES: 'tennisHistoricalGames',
    UPDATE_TICK: 'tennisDataUpdateTick',
  };
  const EVENTS = { UPDATE: 'tennisDataUpdate' };

  // --- Schema version (bump if you change structure later)
  const SCHEMA_VERSION = 1;

  // --- JSON helpers
  const readJSON = (key) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  };
  const writeJSON = (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch {
      return false;
    }
  };

  // --- Default data shape
  const getEmptyData = () => ({
    __schema: SCHEMA_VERSION,
    courts: Array(COURT_COUNT).fill(null),
    waitingGroups: [],
    recentlyCleared: [],
    calculatedAvailability: null,
  });

  // --- Normalize any loaded data to current schema
  const normalizeData = (data) => {
    if (!data || typeof data !== 'object') return getEmptyData();
    const out = Object.assign(getEmptyData(), data);

    // Ensure courts is correct length
    if (!Array.isArray(out.courts)) out.courts = Array(COURT_COUNT).fill(null);
    if (out.courts.length !== COURT_COUNT) {
      const resized = Array(COURT_COUNT).fill(null);
      for (let i = 0; i < Math.min(COURT_COUNT, out.courts.length); i++) resized[i] = out.courts[i];
      out.courts = resized;
    }

    // Ensure arrays
    if (!Array.isArray(out.waitingGroups)) out.waitingGroups = [];
    if (!Array.isArray(out.recentlyCleared)) out.recentlyCleared = [];

    // Stamp/upgrade schema
    out.__schema = SCHEMA_VERSION;
    return out;
  };

  // --- Read, normalize, and self-heal storage if needed
  const readDataSafe = () => {
    const current = readJSON(STORAGE.DATA);
    const normalized = normalizeData(current);
    if (!current || JSON.stringify(current) !== JSON.stringify(normalized)) {
      // Self-heal silently
      writeJSON(STORAGE.DATA, normalized);
    }
    return normalized;
  };

  // --- Historical games helpers
  const getHistoricalGames = () => readJSON(STORAGE.HISTORICAL_GAMES) || [];
  
  const addHistoricalGame = (game) => {
    const games = getHistoricalGames();
    const gameRecord = {
      ...game,
      id: `${game.courtNumber}-${Date.now()}`,
      dateAdded: new Date().toISOString(),
      date: new Date(game.startTime).toISOString().split('T')[0] // YYYY-MM-DD format
    };
    games.push(gameRecord);
    writeJSON(STORAGE.HISTORICAL_GAMES, games);
    return gameRecord;
  };

  
  const searchHistoricalGames = (filters = {}) => {
    const games = getHistoricalGames();
    return games.filter(game => {
      // Court number filter
      if (filters.courtNumber && game.courtNumber !== filters.courtNumber) return false;
      
      // Date range filter
      if (filters.startDate) {
        const gameDate = new Date(game.date);
        const startDate = new Date(filters.startDate);
        if (gameDate < startDate) return false;
      }
      if (filters.endDate) {
        const gameDate = new Date(game.date);
        const endDate = new Date(filters.endDate);
        if (gameDate > endDate) return false;
      }
      
      // Player name filter (partial match, case insensitive)
      if (filters.playerName) {
        const searchName = filters.playerName.toLowerCase();
        const hasPlayer = game.players.some(player => 
          player.name.toLowerCase().includes(searchName)
        );
        if (!hasPlayer) return false;
      }
      
      return true;
    }).sort((a, b) => new Date(b.startTime) - new Date(a.startTime)); // Most recent first
  };

  // Expose on window
  window.APP_UTILS = {
    COURT_COUNT,
    STORAGE,
    EVENTS,
    SCHEMA_VERSION,
    readJSON,
    writeJSON,
    getEmptyData,
    normalizeData,
    readDataSafe,
    getHistoricalGames,
    addHistoricalGame,
    searchHistoricalGames,
  };
})();

// ===== Shared classes & constants (no UI changes) =====
(function () {
  const U = window.APP_UTILS;
  if (!U) return;

  // COURTS array (1..COURT_COUNT)
  const COURTS = Array.from({ length: U.COURT_COUNT }, (_, i) => i + 1);

  // TIME_SLOTS (keep minimal; adjust later if needed)
  const TIME_SLOTS = [
    '06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30',
    '10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30',
    '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
    '18:00','18:30','19:00','19:30','20:00','20:30','21:00'
  ];

  // Centralized DataStore (moved out of page files)
  class TennisCourtDataStore {
    constructor() {
      this.cache = new Map();
      this.metrics = { cacheHits: 0, cacheMisses: 0, totalOperations: 0, totalResponseTime: 0, storageOperationsSaved: 0 };
      this.warmCache();
    }
    warmCache() {
      const keys = [U.STORAGE.DATA, U.STORAGE.SETTINGS, U.STORAGE.BLOCKS, U.STORAGE.UPDATE_TICK];
      keys.forEach(key => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try { this.cache.set(key, JSON.parse(raw)); } catch {}
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
      if (raw) { try { parsed = JSON.parse(raw); this.cache.set(key, parsed); } catch {} }
      this.metrics.totalResponseTime += (performance.now() - t0);
      return parsed;
    }
    async set(key, data, options = {}) {
      const t0 = performance.now();
      this.metrics.totalOperations++;
      this.cache.set(key, data);
      if (options.immediate || key === U.STORAGE.DATA || key === U.STORAGE.BLOCKS) {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
      }
      this.metrics.totalResponseTime += (performance.now() - t0);
      // same-tab update signal
      try { window.dispatchEvent(new CustomEvent(U.EVENTS.UPDATE, { detail: { key, data } })); } catch {}
    }
    getMetrics() {
      const total = this.metrics.totalOperations || 1;
      const avg = this.metrics.totalResponseTime / total;
      const hit = (this.metrics.cacheHits / total) * 100;
      return { ...this.metrics, avgResponseTime: +avg.toFixed(3), cacheHitRate: +hit.toFixed(1) };
    }
  }

  // Tiny event bus helpers
  const broadcastEvent = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {} };
  const listenForEvent  = (name, handler, opts) => {
    try { window.addEventListener(name, handler, opts); } catch {}
    return () => { try { window.removeEventListener(name, handler, opts); } catch {} };
  };

  // Expose
  U.COURTS = COURTS;
  U.TIME_SLOTS = TIME_SLOTS;
  U.TennisCourtDataStore = TennisCourtDataStore;
  U.broadcastEvent = broadcastEvent;
  U.listenForEvent = listenForEvent;
})();