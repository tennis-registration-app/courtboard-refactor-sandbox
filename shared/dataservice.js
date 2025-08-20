(function initDataService(){
  const T = (window.Tennis = window.Tennis || {});
  const S = T.Storage;
  const DS = T.DataStore;
  const Av = (T.Domain && (T.Domain.availability || T.Domain.Availability)) || {};
  T.DataService = T.DataService || {};
  const TD = T.DataService;

  // Helper to compare groups (ID-first, name fallback)
  function sameGroup(a = [], b = []) {
    const norm = (p) => (p?.memberId || '').toLowerCase() || (p?.id || '').toLowerCase() || (p?.name || '').trim().toLowerCase();
    if (a.length !== b.length) return false;
    const A = a.map(norm).sort(); 
    const B = b.map(norm).sort();
    return A.every((x,i)=>x===B[i]);
  }

  function deepClone(x) {
    // Use shared storage clone if available, otherwise fallback
    if (S?.readDataClone && typeof x === 'undefined') {
      return S.readDataClone();
    }
    try { return structuredClone(x); } 
    catch { return JSON.parse(JSON.stringify(x)); }
  }

  async function clearCourt(courtNumber, opts = {}) {
    if (!S?.readDataSafe || !DS?.set) {
      return { success: false, error: 'Service prerequisites missing' };
    }
    const data = S?.readDataClone ? S.readDataClone() : deepClone(S.readDataSafe());
    const idx = (courtNumber|0) - 1;
    if (!data?.courts || !data.courts[idx]) {
      return { success: false, error: 'Invalid court' };
    }
    const court = data.courts[idx];
    if (!court.current) {
      return { success: false, error: 'Court not occupied' };
    }

    const nowISO = new Date().toISOString();
    const gameData = court.current || {};
    
    // Preserve history
    court.history = Array.isArray(court.history) ? court.history.slice() : [];
    court.history.push({
      ...gameData,
      clearedAt: nowISO,
      reason: opts.reason || 'manual-clear'
    });
    
    // Add to historical games for search functionality
    if (window.APP_UTILS && window.APP_UTILS.addHistoricalGame && gameData.players) {
      window.APP_UTILS.addHistoricalGame({
        courtNumber: courtNumber,
        players: gameData.players,
        startTime: gameData.startTime,
        endTime: nowISO, // Use actual clear time for accuracy
        duration: gameData.duration,
        clearReason: opts.clearReason || 'Cleared'
      });
    }
    
    // Clear current
    court.current = null;

    // Track recentlyCleared (optional but useful)
    data.recentlyCleared = Array.isArray(data.recentlyCleared) ? data.recentlyCleared.slice() : [];
    data.recentlyCleared.push({ courtNumber, clearedAt: nowISO, source: opts.source || 'admin' });

    // Persist using guarded path (emits DATA_UPDATED + tennisDataUpdate)
    DS.set('tennisClubData', data);
    return { success: true };
  }

  // Core saveData function
  async function saveData(data) {
    if (!DS?.set) {
      return { success: false, error: 'DataStore not available' };
    }
    DS.set(S?.STORAGE?.DATA || 'tennisClubData', data);
    return { success: true };
  }

  // Hardened assignCourt with waitlist priority enforcement
  async function assignCourt(courtNumber, group, duration=60, opts={}) {
    try {
      console.log('[assignCourt] Called with:', { courtNumber, group, duration, opts });
      
      // Enforce strict selectable policy at the service boundary
      const S  = T.Storage;
      const Av = T.Domain.availability;

      const data   = S.readDataClone();                   // fresh mutable clone
      const now    = new Date();
      const blocks = S.readJSON(S.STORAGE.BLOCKS) || [];
      const wetSet = new Set();                           // adapt if you persist wet courts

      const strictSet = new Set(Av.getSelectableCourtsStrict({ data, now, blocks, wetSet }));
      if (!strictSet.has(courtNumber)) {
        // Never bump a non-overtime game; reject out-of-policy picks
        throw new Error(`Court ${courtNumber} is not selectable by policy`);
      }

      // (continue with existing validation, duplicate checks, and assignment logic)
      
      if (!S?.readDataSafe || !DS?.set) {
        return { success: false, error: 'Storage/DataStore unavailable' };
      }
      if (!courtNumber || !group) {
        return { success: false, error: 'Missing court number or group data' };
      }

      // Extract players from group (handle both array and object formats)
      const players = Array.isArray(group) ? group : (group?.players || []);
      
      // 1) HARD CONFLICTS FIRST - Check for duplicates before waitlist priority
      const R = T.Domain.roster || T.Domain.Roster;
      const groupWithIds = (R?.enrichPlayersWithIds)
        ? R.enrichPlayersWithIds(players, window.__memberRoster || [])
        : players;

      // Get waitlist data once
      const waiting = Array.isArray(data.waitingGroups) ? data.waitingGroups : [];
      const isFirstWaitingGroup = waiting.length > 0 && sameGroup(waiting[0]?.players || [], players);

      for (const p of groupWithIds) {
        const engagement = R?.findEngagementFor ? R.findEngagementFor(p, data) : null;
        if (engagement?.type === 'playing') {
          return { success: false, error: `${p.name || p} is already playing on Court ${engagement.court}` };
        }
        // Skip waitlist blocking here - let the comprehensive waitlist priority check handle it below
      }
      
      // 2) THEN waitlist priority check
      
      console.log('[assignCourt] Waitlist check:', { 
        waitingLength: waiting.length, 
        overrideWaitlist: opts?.overrideWaitlist,
        players: players,
        firstWaitingGroup: waiting[0]?.players 
      });
      
      // Check waitlist priority - modified to allow top 2 groups when 2+ courts available
      if (waiting.length > 0 && !opts?.overrideWaitlist) {
        // Get available courts count to determine how many groups can play
        // Use correct overtime logic: free courts OR overtime courts (not both)
        let availableCourtCount = 0;
        if (Av?.getFreeCourtsInfo) {
          const info = Av.getFreeCourtsInfo({ data, now, blocks, wetSet });
          const freeCount = info.free?.length || 0;
          const overtimeCount = info.overtime?.length || 0;
          availableCourtCount = freeCount > 0 ? freeCount : overtimeCount;
        }
        
        // Check if this group is in the allowed positions
        let groupPosition = 0;
        for (let i = 0; i < waiting.length; i++) {
          if (sameGroup(waiting[i]?.players || [], players)) {
            groupPosition = i + 1; // 1-based position
            break;
          }
        }
        
        console.log('[assignCourt] Waitlist priority check:', { 
          groupPosition, 
          availableCourtCount,
          waitingLength: waiting.length,
          players: players
        });
        
        // Allow position 1 always, position 2 only if 2+ courts available
        const maxAllowedPosition = availableCourtCount >= 2 ? 2 : 1;
        
        if (groupPosition === 0 || groupPosition > maxAllowedPosition) {
          return { 
            success: false, 
            error: `Waitlist priority: ${groupPosition === 0 ? 'please join the waitlist' : `position ${groupPosition} must wait (only top ${maxAllowedPosition} can play)`}.` 
          };
        }
      }

      // Reuse now, blocks, wetSet from strict check above
      // const now = new Date(); // already declared above
      // const blocks = S.readJSON(S.STORAGE.BLOCKS) || []; // already declared above  
      // const wetSet = new Set(); // already declared above
      const strict = Av?.getSelectableCourtsStrict
        ? [...Av.getSelectableCourtsStrict({ data, now, blocks, wetSet })]
        : [];
      
      if (!strict.includes(Number(courtNumber))) {
        return { success:false, error:'Court not selectable (not free or overtime).' };
      }

      const idx = (courtNumber | 0) - 1;
      if (!data?.courts || idx < 0 || idx >= data.courts.length) {
        return { success: false, error: 'Invalid court number' };
      }

      // Ensure court object exists
      data.courts[idx] = data.courts[idx] || {};
      const court = data.courts[idx];

      // STRICT: No bumping allowed - only assign to truly free courts or legitimate overtime
      const courtNum = Number(courtNumber);
      
      // First check: if court has any current session, examine it closely
      if (court.current) {
        const endTime = court.current.endTime;
        if (endTime) {
          const sessionEnd = new Date(endTime);
          if (sessionEnd > now) {
            // Session is still active (not overtime) - absolutely no bumping
            return { success: false, error: `Court ${courtNumber} is occupied until ${sessionEnd.toLocaleTimeString()}. No bumping allowed.` };
          }
        }
      }
      
      // Second check: use domain logic to double-check
      const courtInfo = Av?.getFreeCourtsInfo?.({ data, now, blocks, wetSet });
      const freeSet = new Set(courtInfo?.free || []);
      const overtimeSet = new Set(courtInfo?.overtime || []);
      
      if (!freeSet.has(courtNum) && !overtimeSet.has(courtNum)) {
        return { success: false, error: `Court ${courtNumber} is not available for assignment` };
      }

      // Assign the game - ensure each player has at least a name
      const normalizedPlayers = players.map(p => {
        if (typeof p === 'string') {
          return { name: p, id: p.toLowerCase() };
        }
        return {
          name: p.name || p.playerName || String(p),
          id: p.id || p.memberId || (p.name || p.playerName || String(p)).toLowerCase(),
          memberId: p.memberId || p.id || null,
          ...(p.phone && { phone: p.phone }),
          ...(p.ranking && { ranking: p.ranking })
        };
      });
      
      let replacedGroup = null;
      
      // If court has an existing game (overtime), preserve it in history before replacing
      if (court.current) {
        const existingGame = court.current;
        
        // Capture replaced group for UI
        replacedGroup = {
          players: existingGame.players,
          endTime: existingGame.endTime
        };
        const nowISO = now.toISOString();
        
        console.log('[assignCourt] BUMPING existing game:', {
          courtNumber,
          existingGame: {
            players: existingGame.players?.map(p => p.name),
            startTime: existingGame.startTime,
            endTime: existingGame.endTime
          },
          bumpTime: nowISO
        });
        
        // Preserve in court history
        court.history = Array.isArray(court.history) ? court.history : [];
        court.history.push({
          ...existingGame,
          clearedAt: nowISO,
          clearReason: 'Bumped'
        });
        
        // Add to historical games for search functionality
        if (window.APP_UTILS && window.APP_UTILS.addHistoricalGame) {
          console.log('[assignCourt] Adding bumped game to historical storage');
          window.APP_UTILS.addHistoricalGame({
            courtNumber: courtNumber,
            players: existingGame.players,
            startTime: existingGame.startTime,
            endTime: nowISO, // Use bump time as end time
            duration: existingGame.duration,
            clearReason: 'Bumped'
          });
        } else {
          console.warn('[assignCourt] APP_UTILS.addHistoricalGame not available');
        }
      }
      
      court.current = {
        players: normalizedPlayers,
        guests: group?.guests || 0,
        startTime: now.toISOString(),
        endTime: new Date(now.getTime() + duration*60000).toISOString(),
        assignedAt: now.toISOString(),
        duration,
        courtNumber
      };

      // If this was from waitlist, remove from waitlist
      // Check both position 1 and 2 since either could have been assigned
      if (waiting.length > 0) {
        for (let i = 0; i < Math.min(2, waiting.length); i++) {
          if (sameGroup(waiting[i]?.players || [], players)) {
            data.waitingGroups.splice(i, 1);
            break;
          }
        }
      }

      // Bump tick
      data.UPDATE_TICK = (data.UPDATE_TICK || 0) + 1;

      // Persist through guarded path
      await DS.set(S.STORAGE.DATA, data);

      return { success: true, courtNumber, replacedGroup };
    } catch (err) {
      return { success: false, error: String(err?.message || err) };
    }
  }

  if (typeof TD.addToWaitlist !== 'function') {
    TD.addToWaitlist = async function addToWaitlist(players = [], opts = {}) {
      if (!S || !DS) return { success:false, error:'Storage/DataStore unavailable' };
      try {
        const data = S.readDataClone();
        data.waitingGroups = Array.isArray(data.waitingGroups) ? data.waitingGroups : [];

        // normalize players
        const normalizedPlayers = Array.isArray(players) ? players.map(p => {
          const name = p?.name || p?.playerName || String(p);
          const id = p?.id || p?.memberId || name.toLowerCase();
          return { name, id, memberId: id };
        }) : [];

        // normalize guests
        const guests = Array.isArray(opts.guests) ? opts.guests.length : (Number(opts.guests) || 0);

        data.waitingGroups.push({ 
          players: normalizedPlayers, 
          guests, 
          addedAt: new Date().toISOString() 
        });

        const position = data.waitingGroups.length;
        await DS.set(S.STORAGE.DATA, data, { reason: 'ADD_WAITLIST' });
        return { success: true, position };
      } catch (e) {
        console.error('[DataService.addToWaitlist]', e);
        return { success:false, error: e?.message || 'Unknown error in addToWaitlist' };
      }
    };
  }


  // Add assignNextFromWaitlist
  if (typeof TD.assignNextFromWaitlist !== 'function') {
    TD.assignNextFromWaitlist = async function assignNextFromWaitlist(courtNumber) {
      try {
        if (!S || !DS) return { success:false, error:'Service prerequisites missing' };
        
        const data = S.readDataClone();
        if (!data.waitingGroups?.length) return { success:false, error:'No one is waiting' };

        // Use getFreeCourtsInfo for assignment - get fresh reference to availability module
        const now = new Date();
        const blocks = S.readJSON(S.STORAGE.BLOCKS) || [];
        const wetSet = new Set();
        
        // Get fresh availability module reference
        const AvRuntime = T.Domain?.availability || T.Domain?.Availability || {};
        
        let freeCourts = [];
        if (AvRuntime.getFreeCourtsInfo) {
          const courtInfo = AvRuntime.getFreeCourtsInfo({ data, now, blocks, wetSet });
          freeCourts = courtInfo?.free || [];
        } else if (AvRuntime.getFreeCourts) {
          // Fallback to basic getFreeCourts if getFreeCourtsInfo not available
          freeCourts = AvRuntime.getFreeCourts({ data, now, blocks, wetSet }) || [];
        }

        // Choose court - use requested court if free, otherwise first free court
        const court = Number(courtNumber) || freeCourts[0];
        if (!court || !freeCourts.includes(court)) {
          return { success:false, error:`No free courts available (free: [${freeCourts.join(',')}])` };
        }

        // Pop first waiting group
        const group = data.waitingGroups.shift();
        const players = Array.isArray(group?.players) ? group.players : [];
        const guests = Number(group?.guests || 0);

        // Duration from config or default to 60
        const Config = T.Config || {};
        const duration = Number(Config.SINGLES_DURATION_MIN) || 60;

        // Assign to court
        data.courts = data.courts || [];
        data.courts[court - 1] = data.courts[court - 1] || {};
        data.courts[court - 1].current = {
          players,
          guests,
          startTime: now.toISOString(),
          endTime: new Date(now.getTime() + duration * 60000).toISOString(),
          assignedAt: now.toISOString(),
          duration
        };

        await DS.set(S.STORAGE.DATA, data, { reason: 'ASSIGN_NEXT' });
        return { success: true, court, group };
      } catch (e) {
        return { success:false, error: e?.message || 'Failed to assign next from waitlist' };
      }
    };
  }

  // ---- Safe move (from -> to), no broad overwrites ----
  TD.moveCourt = async function moveCourt(from, to) {
    try {
      const fIdx = Number(from) - 1;
      const tIdx = Number(to)   - 1;

      const data = (typeof S.readDataClone === 'function')
        ? S.readDataClone()
        : (typeof structuredClone === 'function'
           ? structuredClone(S.readDataSafe())
           : JSON.parse(JSON.stringify(S.readDataSafe())));

      data.courts = Array.isArray(data.courts) ? data.courts : [];
      data.courts[fIdx] = data.courts[fIdx] || {};
      data.courts[tIdx] = data.courts[tIdx] || {};

      const src = data.courts[fIdx];
      const dst = data.courts[tIdx];

      if (!src?.current) {
        return { success: false, error: `Court ${from} is empty.` };
      }
      if (dst?.current) {
        return { success: false, error: `Court ${to} is occupied.` };
      }

      // Move: copy src.current → dest.current, then remove from src
      dst.current = src.current;
      delete src.current;

      // Optional: bump tick
      data.UPDATE_TICK = (data.UPDATE_TICK || 0) + 1;

      // Persist through the guarded, event-emitting path
      DS.set(S.STORAGE.DATA, data);

      return { success: true, from, to };
    } catch (err) {
      return { success: false, error: String(err?.message || err) };
    }
  };

  // Add missing method stubs for compatibility
  if (typeof TD.loadData !== 'function') {
    TD.loadData = async function() {
      return S?.readDataSafe?.() || {};
    };
  }

  if (typeof TD.cleanupExpiredBlocks !== 'function') {
    TD.cleanupExpiredBlocks = async function() {
      // Stub - actual implementation should be in page-specific code
      return { removed: 0 };
    };
  }

  if (typeof TD.getActiveBlocksForCourt !== 'function') {
    TD.getActiveBlocksForCourt = function(courtNumber) {
      // Stub - returns empty array if no specific implementation
      return [];
    };
  }

  // Expose core functions
  TD.clearCourt = clearCourt;
  TD.unassignCourt = clearCourt;
  TD.saveData = saveData;
  TD.assignCourt = assignCourt;

  // Export aliases
  if (!window.TennisDataService) window.TennisDataService = TD;
})();