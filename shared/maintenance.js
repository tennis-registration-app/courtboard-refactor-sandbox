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
    overdue.forEach(n => { if (data.courts[n - 1]) data.courts[n - 1].current = null; });
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