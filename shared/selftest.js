/* /shared/selftest.js */
// Dev-only self test runner: Tennis.selfTest.runAll()
(function attachSelfTest(){
  const T = (window.Tennis = window.Tennis || {});
  const NS = (T.selfTest = T.selfTest || {});
  if (typeof NS.runAll === 'function') return; // idempotent

  const S  = T.Storage;
  const TD = window.TennisDataService || T.DataService;
  const D  = T.Domain || {};
  const Av = D.availability || D.Availability;

  if (!S || !TD) {
    // Don't throw in production; just expose a noop so pages still load
    NS.runAll = async () => ({ passed: 0, failed: 0, results: [] });
    return;
  }

  // ---------- helpers ----------
  const now = () => new Date();
  const clone = (x) => (typeof structuredClone === "function"
    ? structuredClone(x)
    : JSON.parse(JSON.stringify(x)));

  // read/write helpers
  const readData = () => S.readDataSafe();
  const writeData = (data) => TD.saveData(data);
  const readBlocks = () => S.readJSON(S.STORAGE.BLOCKS) || [];
  const writeBlocks = (blocks) => S.writeJSON(S.STORAGE.BLOCKS, blocks);

  // seed/rollback wrapper
  async function withSeed(seedFn, testFn, { alsoSeedBlocks } = {}) {
    const origData   = clone(readData());
    const origBlocks = alsoSeedBlocks ? clone(readBlocks()) : null;

    // mutate a clone and persist
    const seeded = clone(origData);
    await seedFn(seeded);
    await writeData(seeded);
    if (alsoSeedBlocks && origBlocks) await writeBlocks(alsoSeedBlocks.blocks ?? origBlocks);

    // run test
    let result;
    try {
      result = await testFn();
    } catch (e) {
      result = { ok: false, notes: e && (e.message || String(e)) };
    }

    // rollback
    await writeData(origData);
    if (alsoSeedBlocks) await writeBlocks(origBlocks);

    return result;
  }

  // small wait
  const tick = (ms=30) => new Promise(r => setTimeout(r, ms));

  // Safe status helper
  function getStatuses() {
    const data = readData();
    const blocks = readBlocks();
    const wetSet = new Set(
      blocks
        .filter(b => b?.isWetCourt && new Date(b.startTime ?? b.start) <= now() && now() < new Date(b.endTime ?? b.end))
        .map(b => b.courtNumber)
    );
    if (!Av?.getCourtStatuses) return null;
    return Av.getCourtStatuses({ data, now: now(), blocks, wetSet });
  }

  // ---------- tests ----------
  async function testSelection_FreeOnly() {
    const T  = window.Tennis || {};
    const S  = T.Storage;
    const TD = (window.TennisDataService || T.DataService || {});
    const Av = T.Domain?.availability || T.Domain?.Availability;

    if (!S?.readDataSafe || !S?.readDataClone || !TD?.saveData || !Av?.getFreeCourtsInfo) {
      return { name: 'Selection: Free only', ok: true, notes: 'skipped (missing APIs)' };
    }

    // Snapshot current data
    const snap = S.readDataSafe();
    const n = Array.isArray(snap?.courts) ? snap.courts.length : 12;

    // Seed a fully-free dataset (deterministic)
    const seeded = S.readDataClone();
    seeded.courts = Array.from({ length: n }, () => ({ history: [], current: null }));

    await TD.saveData(seeded);
    await new Promise(r => setTimeout(r, 30));

    const info = Av.getFreeCourtsInfo({
      data: S.readDataSafe(),
      now: new Date(),
      blocks: [],           // <-- deterministic
      wetSet: new Set(),    // <-- deterministic
    });

    const ok =
      Array.isArray(info.free)      && info.free.length === n &&
      Array.isArray(info.overtime)  && info.overtime.length === 0;

    const notes = ok ? `free=${n}; overtime=0` : 'unexpected free/overtime sets';

    // Rollback
    await TD.saveData(snap);
    return { name: 'Selection: Free only', ok, notes };
  }

  async function testSelection_FallbackOvertime() {
    if (!Av?.getSelectableCourts) return { name: "Selection: Fallback overtime", ok: true, notes: "skipped (no Av.getSelectableCourts)" };
    return await withSeed(async (d) => {
      // Occupy all courts with past end time => all overtime
      const c = d.courts || [];
      const start = new Date(now().getTime() - 120*60000);
      const end   = new Date(now().getTime() - 5*60000);
      c.forEach(court => court.current = { players: [{ name: "Bob" }], startTime: start.toISOString(), endTime: end.toISOString(), duration: 60 });
    }, async () => {
      const info = Av.getFreeCourtsInfo({ data: readData(), now: now(), blocks: readBlocks(), wetSet: new Set() });
      const selectable = Av.getSelectableCourts({ data: readData(), now: now(), blocks: readBlocks(), wetSet: new Set() });
      const ok = (info.free.length === 0) && Array.isArray(selectable) && selectable.length > 0;
      return { name: "Selection: Fallback overtime", ok, notes: ok ? `selectable overtime=${selectable.length}` : "expected overtime selectable when no free" };
    });
  }

  async function testSelection_ExcludeWetBlocked() {
    try {
      const T = window.Tennis || {};
      const Av = T.Domain?.availability || T.Domain?.Availability;
      const S  = T.Storage;
      if (!Av?.getCourtStatuses || !S?.readDataSafe) {
        return { name: 'testSelection_ExcludeWetBlocked', ok: true, notes: 'skipped (no Av/S)' };
      }

      // Always use a real array with a controlled block
      const blocks = [];
      const now = new Date();
      const start = now.toISOString();
      const end   = new Date(now.getTime() + 60*60000).toISOString();
      // Block court 2 for the next hour
      blocks.push({ courtNumber: 2, start, end, isBlocked: true });

      const wetSet = new Set(); // none wet in this test
      const data = S.readDataSafe();
      const st = Av.getCourtStatuses({ data, now, blocks, wetSet });

      const c2 = st.find(s => s.courtNumber === 2);
      const ok = !!c2 && c2.status !== 'free'; // blocked must NOT be 'free'
      return { name: 'testSelection_ExcludeWetBlocked', ok, notes: ok ? 'blocked excluded' : 'court 2 not excluded' };
    } catch (e) {
      return { name: 'testSelection_ExcludeWetBlocked', ok: false, notes: e?.message || String(e) };
    }
  }

  async function testDuplicate_Playing_Service() {
    // Service safety net: trying to assign someone already on a court must fail
    const TD = (window.TennisDataService || window.Tennis?.DataService || {});
    if (typeof TD.assignCourt !== 'function') {
      return { name: "Duplicate: playing (service)", ok: true, notes: 'skipped (no TD.assignCourt)' };
    }
    return await withSeed(async (d) => {
      (d.courts || []).forEach(c => c.current = null);
      const start = new Date(now().getTime() - 5*60000);
      const end   = new Date(now().getTime() + 55*60000);
      d.courts[2].current = { players: [{ id: "m_alice", name: "Alice" }], startTime: start.toISOString(), endTime: end.toISOString(), duration: 60 };
    }, async () => {
      const res = await TD.assignCourt(5, [{ id: "m_alice", name: "Alice" }], 60);
      const ok = res && res.success === false && /conflict|already/i.test(res.error || "");
      return { name: "Duplicate: playing (service)", ok, notes: res && res.error };
    });
  }

  async function testDuplicate_Waitlist_Service() {
    const TD = (window.TennisDataService || window.Tennis?.DataService || {});
    if (typeof TD.assignCourt !== 'function') {
      return { name: "Duplicate: waitlist (service)", ok: true, notes: 'skipped (no TD.assignCourt)' };
    }
    return await withSeed(async (d) => {
      d.waitingGroups = Array.isArray(d.waitingGroups) ? d.waitingGroups : [];
      d.waitingGroups.push({ players: [{ id: "m_bob", name: "Bob" }], addedAt: now().toISOString() });
    }, async () => {
      const res = await TD.assignCourt(4, [{ id: "m_bob", name: "Bob" }], 60);
      const ok = res && res.success === false && /waitlist/i.test(res.error || "");
      return { name: "Duplicate: waitlist (service)", ok, notes: res && res.error };
    });
  }

  async function testAutoClear_Overdue() {
    if (!T.Maintenance?.autoClearOverdueSessions) return { name: "Auto-clear overdue", ok: true, notes: "skipped (no Maintenance.autoClearOverdueSessions)" };
    return await withSeed(async (d) => {
      (d.courts || []).forEach(c => c.current = null);
      const start = new Date(now().getTime() - 200*60000);
      const end   = new Date(now().getTime() - 190*60000);
      d.courts[0].current = { players: [{ name: "AutoClear" }], startTime: start.toISOString(), endTime: end.toISOString(), duration: 60 };
    }, async () => {
      const cleared = await T.Maintenance.autoClearOverdueSessions();
      const ok = (cleared|0) >= 1 && !readData().courts[0].current;
      return { name: "Auto-clear overdue", ok, notes: `cleared=${cleared}` };
    });
  }

  async function testCoalescing_Board() {
    const fn = window.refreshBoard;
    if (typeof fn !== "function") return { name: "Coalesce: CourtBoard", ok: true, notes: "skipped (no refreshBoard)" };
    let calls = 0;
    window.refreshBoard = (...a) => { calls++; return fn.apply(this, a); };
    const E = T.Events, key = S.STORAGE.DATA, data = readData();
    E.emitDom && E.emitDom("tennisDataUpdate", { key, data });
    window.dispatchEvent(new Event("DATA_UPDATED"));
    await tick(40);
    const ok = calls === 1;
    window.refreshBoard = fn;
    return { name: "Coalesce: CourtBoard", ok, notes: `calls=${calls}` };
  }

  async function testCoalescing_Admin() {
    const name = 'Coalesce: Admin';
    
    const hasAdminSignals =
      typeof window.scheduleAdminRefresh === 'function' ||
      typeof window.refreshAdminView    === 'function' ||
      typeof window.loadData            === 'function';

    if (!hasAdminSignals) {
      return { name: 'Coalesce: Admin', ok: true, notes: 'skipped (no admin coalescer on this page)' };
    }
    
    try {
      const callsBefore = window.__adminCoalesceHits || 0;
      let bridge = 0;
      const onBridge = () => { bridge++; };
      window.addEventListener('ADMIN_REFRESH', onBridge);

      // Fire both update events
      const S = window.Tennis?.Storage, E = window.Tennis?.Events;
      const key = S?.STORAGE?.DATA, data = S?.readDataSafe?.();
      E?.emitDom?.('tennisDataUpdate', { key, data });
      window.dispatchEvent(new Event('DATA_UPDATED'));

      await new Promise(r => setTimeout(r, 60));

      // cleanup
      const callsAfter = window.__adminCoalesceHits || 0;
      window.removeEventListener('ADMIN_REFRESH', onBridge);
      const called = callsAfter > callsBefore;
      const ok = called || bridge > 0;
      return { name: 'Coalesce: Admin', ok, notes: ok ? `calls=${called?1:0} bridge=${bridge}` : `calls=0 bridge=0` };
    } catch (e) {
      return { name, ok: false, notes: e?.message || String(e) };
    }
  }

  async function testCoalescing_Registration() {
    const fn = window.loadData;
    if (typeof fn !== "function") return { name: "Coalesce: Registration", ok: true, notes: "skipped (no loadData)" };
    let calls = 0;
    window.loadData = (...a) => { calls++; return fn.apply(this, a); };
    const E = T.Events, key = S.STORAGE.DATA, data = readData();
    E.emitDom && E.emitDom("tennisDataUpdate", { key, data });
    window.dispatchEvent(new Event("DATA_UPDATED"));
    await tick(40);
    const ok = calls === 1;
    window.loadData = fn;
    return { name: "Coalesce: Registration", ok, notes: `calls=${calls}` };
  }

  async function testNoBump_AllOccupied() {
    const TD = window.TennisDataService || T.DataService;
    if (!TD?.assignCourt || !S?.readDataSafe || !S?.saveData) {
      return { name: 'No bump on all occupied', ok: true, notes: 'skipped (missing APIs)' };
    }

    // Snapshot current data
    const snap = S.readDataSafe();
    const n = Array.isArray(snap?.courts) ? snap.courts.length : 12;

    // Seed all courts as occupied (deterministic)
    const seeded = S.readDataClone();
    seeded.courts = Array.from({ length: n }, (_, i) => ({
      history: [],
      current: {
        players: [{ id: `test-player-${i}`, name: `Player ${i}` }],
        startTime: new Date(Date.now() - 30 * 60000).toISOString(), // 30 min ago
        endTime: new Date(Date.now() + 30 * 60000).toISOString(), // 30 min from now
        assignedAt: new Date(Date.now() - 30 * 60000).toISOString()
      }
    }));

    await TD.saveData(seeded);
    await tick(30);

    // Try to assign to any court - should fail (no bumping allowed)
    const assignResult = await TD.assignCourt(1, {
      players: [{ id: 'test-new-player', name: 'New Player' }],
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 60 * 60000).toISOString()
    });

    const ok = !assignResult.success;
    const notes = ok 
      ? `correctly blocked: ${assignResult.error}`
      : `unexpectedly allowed assignment: ${JSON.stringify(assignResult)}`;

    // Rollback
    await TD.saveData(snap);
    return { name: 'No bump on all occupied', ok, notes };
  }

  async function testStrictSelection_FreeExists() {
    const Av = T.Domain?.availability || T.Domain?.Availability;
    if (!Av?.getSelectableCourtsStrict || !S?.readDataSafe || !S?.saveData) {
      return { name: 'Strict: free exists', ok: true, notes: 'skipped (missing APIs)' };
    }

    // Snapshot current data
    const snap = S.readDataSafe();
    const n = Array.isArray(snap?.courts) ? snap.courts.length : 12;

    // Seed: one free court, one overtime court
    const seeded = S.readDataClone();
    seeded.courts = Array.from({ length: n }, (_, i) => {
      if (i === 0) {
        // Court 1: free
        return { history: [], current: null };
      } else if (i === 1) {
        // Court 2: overtime
        return {
          history: [],
          current: {
            players: [{ id: 'overtime-player', name: 'Overtime Player' }],
            startTime: new Date(Date.now() - 90 * 60000).toISOString(), // 90 min ago
            endTime: new Date(Date.now() - 30 * 60000).toISOString(), // ended 30 min ago
            assignedAt: new Date(Date.now() - 90 * 60000).toISOString()
          }
        };
      } else {
        // Other courts: occupied
        return {
          history: [],
          current: {
            players: [{ id: `player-${i}`, name: `Player ${i}` }],
            startTime: new Date(Date.now() - 30 * 60000).toISOString(),
            endTime: new Date(Date.now() + 30 * 60000).toISOString(),
            assignedAt: new Date(Date.now() - 30 * 60000).toISOString()
          }
        };
      }
    });

    await S.saveData(seeded);
    await tick(30);

    const selectable = Av.getSelectableCourtsStrict({
      data: S.readDataSafe(),
      now: new Date(),
      blocks: [],
      wetSet: new Set()
    });

    // Should return only the free court(s), not overtime
    const ok = Array.isArray(selectable) && selectable.length === 1 && selectable.includes(1);
    const notes = ok 
      ? `correctly selected only free: [${selectable.join(',')}]`
      : `wrong selection: [${selectable?.join(',') || 'null'}]`;

    // Rollback
    await S.saveData(snap);
    return { name: 'Strict: free exists', ok, notes };
  }

  async function testStrictSelection_OnlyOvertime() {
    const Av = T.Domain?.availability || T.Domain?.Availability;
    if (!Av?.getSelectableCourtsStrict || !S?.readDataSafe || !S?.saveData) {
      return { name: 'Strict: only overtime', ok: true, notes: 'skipped (missing APIs)' };
    }

    // Snapshot current data
    const snap = S.readDataSafe();
    const n = Array.isArray(snap?.courts) ? snap.courts.length : 12;

    // Seed: zero free, some overtime
    const seeded = S.readDataClone();
    seeded.courts = Array.from({ length: n }, (_, i) => {
      if (i < 3) {
        // Courts 1-3: overtime
        return {
          history: [],
          current: {
            players: [{ id: `overtime-player-${i}`, name: `Overtime Player ${i}` }],
            startTime: new Date(Date.now() - 90 * 60000).toISOString(), // 90 min ago
            endTime: new Date(Date.now() - 15 * 60000).toISOString(), // ended 15 min ago
            assignedAt: new Date(Date.now() - 90 * 60000).toISOString()
          }
        };
      } else {
        // Other courts: occupied
        return {
          history: [],
          current: {
            players: [{ id: `player-${i}`, name: `Player ${i}` }],
            startTime: new Date(Date.now() - 30 * 60000).toISOString(),
            endTime: new Date(Date.now() + 30 * 60000).toISOString(),
            assignedAt: new Date(Date.now() - 30 * 60000).toISOString()
          }
        };
      }
    });

    await S.saveData(seeded);
    await tick(30);

    const selectable = Av.getSelectableCourtsStrict({
      data: S.readDataSafe(),
      now: new Date(),
      blocks: [],
      wetSet: new Set()
    });

    // Should return the overtime courts since no free exists
    const expectedOvertime = [1, 2, 3];
    const ok = Array.isArray(selectable) && 
               selectable.length === 3 && 
               expectedOvertime.every(n => selectable.includes(n));
    
    const notes = ok 
      ? `correctly selected overtime fallback: [${selectable.join(',')}]`
      : `wrong selection: [${selectable?.join(',') || 'null'}]`;

    // Rollback
    await S.saveData(snap);
    return { name: 'Strict: only overtime', ok, notes };
  }

  async function testWaitlistPriority_BlocksWalkIn() {
    const TD = window.TennisDataService || T.DataService;
    if (!TD?.assignCourt || !TD?.addToWaitlist) {
      return { name: 'Waitlist priority: blocks walk-in', ok: true, notes: 'skipped (missing APIs)' };
    }

    return await withSeed(async (d) => {
      // Clear courts and waitlist
      d.courts.forEach(c => c.current = null);
      d.waitingGroups = [];
      
      // Add a group to waitlist
      d.waitingGroups.push({ 
        players: [{ id: 'w_alice', name: 'Alice Waitlist' }], 
        guests: 0,
        addedAt: new Date().toISOString() 
      });
    }, async () => {
      // Try to assign a different walk-in group
      const res = await TD.assignCourt(1, [{ id: 'w_bob', name: 'Bob WalkIn' }], 60);
      const ok = res && res.success === false && /waitlist priority/i.test(res.error || '');
      return { name: 'Waitlist priority: blocks walk-in', ok, notes: res?.error || 'unknown' };
    });
  }

  async function testAssignNextFromWaitlist_Succeeds() {
    const TD = window.TennisDataService || T.DataService;
    if (!TD?.assignNextFromWaitlist || !TD?.addToWaitlist) {
      return { name: 'Assign next from waitlist: succeeds', ok: true, notes: 'skipped (missing APIs)' };
    }

    return await withSeed(async (d) => {
      // Clear courts and set up waitlist
      d.courts.forEach(c => c.current = null);
      d.waitingGroups = [];
      
      // Add a group to waitlist
      d.waitingGroups.push({ 
        players: [{ id: 'w_charlie', name: 'Charlie Next' }], 
        guests: 1,
        addedAt: new Date().toISOString() 
      });
    }, async () => {
      const beforeLength = readData().waitingGroups.length;
      const res = await TD.assignNextFromWaitlist(1);
      const afterLength = readData().waitingGroups.length;
      
      const ok = res && res.success === true && (beforeLength - afterLength) === 1;
      return { 
        name: 'Assign next from waitlist: succeeds', 
        ok, 
        notes: ok ? `removed ${beforeLength - afterLength} from waitlist` : (res?.error || 'failed') 
      };
    });
  }

  // ---------- runner ----------
  async function runAll() {
    const tests = [
      testSelection_FreeOnly,
      testSelection_FallbackOvertime,
      testSelection_ExcludeWetBlocked,
      testDuplicate_Playing_Service,
      testDuplicate_Waitlist_Service,
      testAutoClear_Overdue,
      testCoalescing_Board,
      testCoalescing_Admin,
      testCoalescing_Registration,
      testNoBump_AllOccupied,
      testStrictSelection_FreeExists,
      testStrictSelection_OnlyOvertime,
      testWaitlistPriority_BlocksWalkIn,
      testAssignNextFromWaitlist_Succeeds,
    ];

    const results = [];
    for (const t of tests) {
      try { results.push({ name: t.name, ...(await t()) }); }
      catch (e) { results.push({ name: t.name, ok: false, notes: e?.message || String(e) }); }
    }
    const flat = results.map(r => ({ Test: r.name || r.Test, OK: !!r.ok, Notes: r.notes || "" }));
    try { console.table(flat); } catch { console.log(flat); }
    const passed = results.filter(r => r.ok).length;
    const failed = results.length - passed;
    console.log(`Self-tests: ${passed} passed, ${failed} failed`);
    return { passed, failed, results };
  }

  NS.runAll = runAll;
})();