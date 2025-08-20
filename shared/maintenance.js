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
  
  function listBlockConflictCourts(data, blocks, now = new Date()) {
    const courts = data?.courts || [];
    const conflicts = [];
    
    courts.forEach((court, idx) => {
      const courtNumber = idx + 1;
      
      // Skip if court has no active game
      if (!court?.current) return;
      
      // Check if this court is currently blocked by an active block
      const activeBlock = blocks.find(block => {
        const blockCourtNum = Number(block.courtNumber || block.court);
        if (blockCourtNum !== courtNumber) return false;
        
        const blockStart = new Date(block.startTime);
        const blockEnd = new Date(block.endTime);
        
        // Block is active if current time is within the block period
        return blockStart <= now && now < blockEnd;
      });
      
      if (activeBlock) {
        conflicts.push({
          courtNumber,
          game: court.current,
          block: activeBlock
        });
      }
    });
    
    return conflicts;
  }
  
  async function autoClearBlockConflicts(now = new Date()) {
    const data = typeof structuredClone === 'function'
      ? structuredClone(S.readDataSafe())
      : JSON.parse(JSON.stringify(S.readDataSafe()));
      
    // Get current blocks
    const blocks = S.readJSON(S.STORAGE.BLOCKS) || [];
    if (!blocks.length) return 0;
    
    const conflicts = listBlockConflictCourts(data, blocks, now);
    if (!conflicts.length) return 0;
    
    const nowISO = now.toISOString();
    
    // Clear conflicted games and preserve them in history
    conflicts.forEach(({ courtNumber, game, block }) => {
      const court = data.courts[courtNumber - 1];
      if (court && court.current) {
        console.log(`[Maintenance] Clearing game on court ${courtNumber} due to block: ${block.reason}`);
        
        // Preserve in court history
        court.history = Array.isArray(court.history) ? court.history : [];
        court.history.push({
          ...game,
          clearedAt: nowISO,
          clearReason: 'Bumped',
          bumpReason: block.reason,
          blockStartTime: block.startTime
        });
        
        // Add to historical games for search functionality
        if (window.APP_UTILS && window.APP_UTILS.addHistoricalGame) {
          window.APP_UTILS.addHistoricalGame({
            courtNumber: courtNumber,
            players: game.players,
            startTime: game.startTime,
            endTime: nowISO, // Use bump time as end time
            duration: game.duration,
            clearReason: 'Bumped',
            bumpReason: block.reason
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
    
    return conflicts.length;
  }

  T.Maintenance = { autoClearOverdueSessions, listOverdueCourts, autoClearBlockConflicts, listBlockConflictCourts };
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