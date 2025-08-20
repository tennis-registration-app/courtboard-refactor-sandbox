(function () {
  const T = window.Tennis || (window.Tennis = {});
  const S = T.Storage, E = T.Events, C = T.Config;
  
  function listOverdueCourts(data, now = new Date(), min = C?.Timing?.AUTO_CLEAR_MIN || 180) {
    const cutoff = new Date(now.getTime() - min * 60000);
    const courts = data?.courts || [];
    const overdue = [];
    courts.forEach((c, idx) => {
      const end = c?.current?.endTime ? new Date(c.current.endTime) : null;
      if (end && !isNaN(end) && end <= cutoff) overdue.push(idx + 1);
    });
    return overdue;
  }
  
  async function autoClearOverdueSessions(now = new Date()) {
    const data = typeof structuredClone === 'function'
      ? structuredClone(S.readDataSafe())
      : JSON.parse(JSON.stringify(S.readDataSafe()));
    const overdue = listOverdueCourts(data, now);
    if (!overdue.length) return 0;
    
    const nowISO = now.toISOString();
    
    // Preserve game history and add to historical games storage for each auto-cleared court
    overdue.forEach(courtNumber => {
      const court = data.courts[courtNumber - 1];
      if (court && court.current) {
        const gameData = court.current;
        
        // Preserve in court history
        court.history = Array.isArray(court.history) ? court.history : [];
        court.history.push({
          ...gameData,
          clearedAt: nowISO,
          clearReason: 'Auto-Cleared'
        });
        
        // Add to historical games for search functionality
        if (window.APP_UTILS && window.APP_UTILS.addHistoricalGame) {
          window.APP_UTILS.addHistoricalGame({
            courtNumber: courtNumber,
            players: gameData.players,
            startTime: gameData.startTime,
            endTime: nowISO, // Use auto-clear time as end time
            duration: gameData.duration,
            clearReason: 'Auto-Cleared'
          });
        }
        
        // Clear the court
        court.current = null;
      }
    });
    
    // Persist via service if available, else storage
    if (window.TennisDataService?.saveData) {
      await window.TennisDataService.saveData(data);
    } else {
      S.writeJSON(S.STORAGE.DATA, data);
      E?.emitDom?.('tennisDataUpdate', { key: S.STORAGE.DATA, data });
      window.dispatchEvent(new Event('DATA_UPDATED'));
    }
    return overdue.length;
  }
  
  T.Maintenance = { autoClearOverdueSessions, listOverdueCourts };
})();

Tennis.Maintenance = Tennis.Maintenance || {};
Tennis.Maintenance.enrichActiveSessionsWithMemberIds = function() {
  const S = Tennis.Storage;
  const R = Tennis.Domain.roster;
  const data = S.readDataClone();
  const roster = S.readJSON('tennisMembers') || S.readJSON('members') || window.__memberRoster || [];

  let touched = 0;
  for (const court of (data.courts || [])) {
    const arr = Array.isArray(court?.current?.players) ? court.current.players : [];
    const enriched = R.enrichPlayersWithIds(arr, roster);
    for (let i=0;i<arr.length;i++) {
      if (!arr[i].memberId && enriched[i]?.memberId) { arr[i] = enriched[i]; touched++; }
    }
  }
  for (const g of (data.waitingGroups || [])) {
    const arr = Array.isArray(g?.players) ? g.players : [];
    const enriched = R.enrichPlayersWithIds(arr, roster);
    for (let i=0;i<arr.length;i++) {
      if (!arr[i].memberId && enriched[i]?.memberId) { arr[i] = enriched[i]; touched++; }
    }
  }
  if (touched > 0) {
    return (window.TennisDataService || Tennis?.DataService)?.saveData(data).then(()=>touched);
  }
  return Promise.resolve(0);
};