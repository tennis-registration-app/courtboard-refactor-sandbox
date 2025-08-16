(function () {
  window.Tennis = window.Tennis || {};
  const S  = window.Tennis.Storage;
  const DS = window.Tennis.DataStore;

  function deepClone(x) {
    try { return structuredClone(x); } 
    catch { return JSON.parse(JSON.stringify(x)); }
  }

  async function clearCourt(courtNumber, opts = {}) {
    if (!S?.readDataSafe || !DS?.set) {
      return { success: false, error: 'Service prerequisites missing' };
    }
    const data = deepClone(S.readDataSafe());
    const idx = (courtNumber|0) - 1;
    if (!data?.courts || !data.courts[idx]) {
      return { success: false, error: 'Invalid court' };
    }
    const court = data.courts[idx];
    if (!court.current) {
      return { success: false, error: 'Court not occupied' };
    }

    const nowISO = new Date().toISOString();
    // Preserve history
    court.history = Array.isArray(court.history) ? court.history.slice() : [];
    court.history.push({
      ...(court.current || {}),
      clearedAt: nowISO,
      reason: opts.reason || 'manual-clear'
    });
    // Clear current
    court.current = null;

    // Track recentlyCleared (optional but useful)
    data.recentlyCleared = Array.isArray(data.recentlyCleared) ? data.recentlyCleared.slice() : [];
    data.recentlyCleared.push({ courtNumber, clearedAt: nowISO, source: opts.source || 'admin' });

    // Persist using guarded path (emits DATA_UPDATED + tennisDataUpdate)
    DS.set('tennisClubData', data);
    return { success: true };
  }

  // Expose/merge onto global service object
  window.TennisDataService = Object.assign(window.TennisDataService || {}, {
    clearCourt,
    unassignCourt: clearCourt
  });
})();