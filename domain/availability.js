(function() {
  'use strict';

  // Ensure window.Tennis.Domain namespace exists
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};

  // Court availability utilities
  const Availability = {
    // Get list of free courts based on current data, time, blocks, and wet conditions
    getFreeCourts({ data, now, blocks = [], wetSet = new Set() }) {
      if (!data || !data.courts || !Array.isArray(data.courts)) {
        throw new Error('Invalid data or courts array provided');
      }
      if (!now || !Date.prototype.isPrototypeOf(now)) {
        throw new Error('Invalid current time provided');
      }
      if (!Array.isArray(blocks)) {
        throw new Error('Blocks must be an array');
      }
      
      const freeCourts = [];
      
      for (let i = 0; i < data.courts.length; i++) {
        const courtNumber = i + 1;
        const court = data.courts[i];
        
        // Check if court is wet
        if (wetSet.has(courtNumber)) {
          continue;
        }
        
        // Check if court is occupied (has any current session, regardless of timing)
        let isOccupied = false;
        if (court) {
          // Check new structure (court.current) - if it exists, court is not truly free
          if (court.current) {
            // Any current session means the court is not free for new assignment
            // This includes both active sessions and overtime sessions
            isOccupied = true;
          }
          // Check old structure (court.players) - fallback for legacy data
          else if (court.players && court.players.length > 0) {
            isOccupied = true;
          }
        }
        
        if (isOccupied) {
          continue;
        }
        
        // Check if court is currently blocked
        const isBlocked = blocks.some(block => {
          if (block.courtNumber !== courtNumber) return false;
          
          const blockStart = new Date(block.startTime);
          const blockEnd = new Date(block.endTime);
          
          return now >= blockStart && now < blockEnd;
        });
        
        if (isBlocked) {
          continue;
        }
        
        // Court is free
        freeCourts.push(courtNumber);
      }
      
      return freeCourts;
    },

    // Check if a court has a block conflict within the required time window
    hasSoonBlockConflict({ courtNumber, now, blocks = [], requiredMinutes = 60 }) {
      if (typeof courtNumber !== 'number' || courtNumber < 1) {
        throw new Error('Invalid court number provided');
      }
      if (!now || !Date.prototype.isPrototypeOf(now)) {
        throw new Error('Invalid current time provided');
      }
      if (!Array.isArray(blocks)) {
        throw new Error('Blocks must be an array');
      }
      if (typeof requiredMinutes !== 'number' || requiredMinutes <= 0) {
        throw new Error('Required minutes must be a positive number');
      }
      
      const requiredEndTime = new Date(now.getTime() + (requiredMinutes * 60 * 1000));
      
      return blocks.some(block => {
        if (block.courtNumber !== courtNumber) return false;
        
        const blockStart = new Date(block.startTime);
        const blockEnd = new Date(block.endTime);
        
        // Check if block overlaps with our required time window
        // Block conflicts if:
        // 1. Block starts before our session ends AND block ends after our session starts
        return blockStart < requiredEndTime && blockEnd > now;
      });
    }
  };

  /**
   * getNextFreeTimes({ data, now, blocks }) -> Date[]
   * Returns an array of length Tennis.Config.Courts.TOTAL_COUNT (1-indexed → index n-1),
   * where each entry is the earliest Date that court n is free.
   * Rules:
   *  - Coerce any stored times with new Date(...)
   *  - Start base = now
   *  - If the court is occupied and current.endTime > base, set base = current.endTime
   *  - While there exists a block for this court where block.startTime <= base < block.endTime,
   *    set base = block.endTime (and re-check; blocks can be adjacent/stacked)
   *  - Result for court n is that base
   */
  function getNextFreeTimes({ data, now, blocks }) {
    const total = (window.Tennis?.Config?.Courts?.TOTAL_COUNT) || 12;
    const out = new Array(total);
    const byCourt = (blocks || []).map(b => ({
      courtNumber: Number(b.courtNumber),
      start: new Date(b.startTime),
      end: new Date(b.endTime)
    }));
    for (let n = 1; n <= total; n++) {
      let base = new Date(now);
      const c = data?.courts?.[n - 1];
      if (c?.current?.endTime) {
        const end = new Date(c.current.endTime);
        if (end > base) base = end;
      }
      // advance through overlapping blocks
      let advanced = true;
      while (advanced) {
        advanced = false;
        for (const b of byCourt) {
          if (b.courtNumber !== n) continue;
          // overlap when b.start <= base < b.end
          if (b.start <= base && base < b.end) {
            base = new Date(b.end);
            advanced = true;
          }
        }
      }
      out[n - 1] = base;
    }
    return out;
  }

  // Returns an object shape without mutating inputs.
  // { free:number[], occupied:number[], wet:number[], overtime:number[], meta:{ total:number, overtimeCount:number } }
  function getFreeCourtsInfo({ data, now, blocks, wetSet }) {
    const total = (window.Tennis?.Config?.Courts?.TOTAL_COUNT) || 12;
    const all   = Array.from({ length: total }, (_, i) => i + 1);
    const wet   = Array.from(new Set([...(wetSet || new Set())])).sort((a,b)=>a-b);

    // DEBUG: Check what data we're actually getting
    const dataSnapshot = {
      isNull: data === null,
      isUndefined: data === undefined,
      hasCourts: !!data?.courts,
      courtsLength: Array.isArray(data?.courts) ? data.courts.length : 'NOT_ARRAY',
      courtsWithCurrent: Array.isArray(data?.courts) ? data.courts.filter(c => c?.current).length : 0,
      firstCourtCurrent: data?.courts?.[0]?.current || null
    };

    // Use existing API for free list (honors wetSet/blocks per current logic)
    const arr  = (window.Tennis.Domain.availability || window.Tennis.Domain.Availability)
                   .getFreeCourts({ data, now, blocks, wetSet }) || [];
    const free = Array.isArray(arr) ? arr.slice().sort((a,b)=>a-b) : (arr.free || []);
    
    // DEBUG: Log when we get suspicious results
    if (free.length >= 11) {
      console.log('🔍 getFreeCourtsInfo - ALL COURTS FREE detected:', {
        dataSnapshot,
        freeCount: free.length,
        callerStack: new Error().stack.split('\n').slice(1, 4)
      });
    }
    const freeSet = new Set(free);

    // NEW: overtime detection
    const courts = Array.isArray(data?.courts) ? data.courts : [];
    const overtime = [];
    for (let n = 1; n <= total; n++) {
      const c = courts[n - 1];
      const endRaw = c?.current?.endTime;
      if (!endRaw) continue;
      const end = new Date(endRaw);
      if (end instanceof Date && !isNaN(end) && end <= now) {
        overtime.push(n);
      }
    }

    const occupied = all.filter(n => !freeSet.has(n)).sort((a,b)=>a-b);
    return { free, occupied, wet, overtime, meta: { total, overtimeCount: overtime.length } };
  }

  // Attach getNextFreeTimes to the Availability API
  Availability.getNextFreeTimes = getNextFreeTimes;

  // Attach to window.Tennis.Domain (both capitalized and lowercase for compatibility)
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};
  (function(API) {
    if (!window.Tennis.Domain.availability) window.Tennis.Domain.availability = API;
    if (!window.Tennis.Domain.Availability) window.Tennis.Domain.Availability = API;
  })(Availability);

  function isBlockActiveNow(b, now) {
    if (!b) return false;
    const st = new Date(b.startTime ?? b.start);
    const et = new Date(b.endTime   ?? b.end);
    return (st instanceof Date && !isNaN(st) && et instanceof Date && !isNaN(et) && st <= now && now < et);
  }

  function getSelectableCourts({ data, now, blocks, wetSet }) {
    const Av = window.Tennis.Domain.availability || window.Tennis.Domain.Availability;
    const info = Av.getFreeCourtsInfo({ data, now, blocks, wetSet });

    // Active, non-wet blocks set (by courtNumber)
    const activeBlocked = new Set(
      (blocks || [])
        .filter(b => isBlockActiveNow(b, now))
        .filter(b => !b.isWetCourt)  // wet handled by wetSet already
        .map(b => b.courtNumber)
    );

    // 1) If any true free courts exist, they are the selectable set
    const free = (info.free || []).filter(n => !activeBlocked.has(n));
    if (free.length > 0) {
      return free;
    }

    // 2) Otherwise, overtime courts become selectable (still exclude wet/blocked)
    const overtime = (info.overtime || []).filter(n => !activeBlocked.has(n) && !(info.wet || []).includes(n));
    return overtime;
  }

  function isActiveBlock(b, now) {
    if (!b) return false;
    const st = new Date(b.startTime ?? b.start);
    const et = new Date(b.endTime   ?? b.end);
    return st instanceof Date && !isNaN(st) &&
           et instanceof Date && !isNaN(et) &&
           st <= now && now < et;
  }

  function getCourtStatuses({ data, now, blocks, wetSet }) {
    const Av = window.Tennis.Domain.availability || window.Tennis.Domain.Availability;
    const info = Av.getFreeCourtsInfo({ data, now, blocks, wetSet });

    // sets for quick lookup
    const S = (arr) => new Set(Array.isArray(arr) ? arr : []);
    const freeSet     = S(info.free);
    const occSet      = S(info.occupied);
    const overtimeSet = S(info.overtime);
    const wetSetLocal = S(info.wet); // prefer info.wet (already honors blocks + timing)

    // active non-wet blocks
    const activeBlocked = new Set(
      (blocks || [])
        .filter(b => isActiveBlock(b, now))
        .filter(b => !b.isWetCourt)
        .map(b => b.courtNumber)
    );

    // selection policy: free first, else overtime
    const hasTrueFree = freeSet.size > 0;

    const total = (data?.courts || []).length || (info.meta?.total || 0);
    const out = [];
    for (let n = 1; n <= total; n++) {
      const isWet      = wetSetLocal.has(n);
      const isBlocked  = activeBlocked.has(n);
      const isFree     = freeSet.has(n);
      const isOvertime = overtimeSet.has(n);
      const isOccupied = occSet.has(n);

      // precedence for a single status label
      let status = 'free';
      let blockedLabel = null;
      let blockedEnd = null;

      if (isWet)      status = 'wet';
      else if (isBlocked) {
        status = 'blocked';
        // Find the active block for this court
        const activeBlock = (blocks || []).find(b => 
          b.courtNumber === n && isActiveBlock(b, now) && !b.isWetCourt
        );
        if (activeBlock) {
          const b = activeBlock;
          blockedLabel = b.label || b.title || b.templateName || b.reason || b.type || 'Blocked';
          blockedEnd = b.endTime || b.end || b.until || null;
        }
      }
      else if (isOvertime) status = 'overtime';
      else if (isOccupied) status = 'occupied';
      else if (isFree)     status = 'free';

      // strict selectable policy: free OR overtime (when no free exists)
      const selectable = (!isWet && !isBlocked) &&
                         ((status === 'free') || (status === 'overtime' && !hasTrueFree));
      
      // selectable reason for styling
      const selectableReason = selectable
        ? (status === 'free' ? 'free' : 'overtime_fallback')
        : null;

      const courtStatus = { 
        courtNumber: n, 
        status, 
        selectable,
        selectableReason,
        isWet, isBlocked, isFree, isOvertime, isOccupied 
      };
      
      // Add blocked-specific fields if applicable
      if (status === 'blocked') {
        courtStatus.blockedLabel = blockedLabel;
        courtStatus.blockedEnd = blockedEnd;
      }

      out.push(courtStatus);
    }
    return out;
  }

  // Assignment helpers for preventing bumping
  function getSelectableCourtsForAssignment({ data, now, blocks, wetSet }) {
    // Use existing selectable logic but enforce stricter rules for assignment
    const selectable = getSelectableCourts({ data, now, blocks, wetSet });
    
    // For assignment, only allow truly free courts (no overtime bumping)
    const info = getFreeCourtsInfo({ data, now, blocks, wetSet });
    const trulyFree = info.free || [];
    
    // Filter selectable to only include truly free courts
    return selectable.filter(n => trulyFree.includes(n));
  }

  function canAssignToCourt(courtNumber, { data, now, blocks, wetSet }) {
    const assignable = getSelectableCourtsForAssignment({ data, now, blocks, wetSet });
    return assignable.includes(courtNumber);
  }

  // Strict selectable API - canonical source of truth
  function getSelectableCourtsStrict({ data, now, blocks = [], wetSet = new Set() }) {
    const info = getFreeCourtsInfo({ data, now, blocks, wetSet });
    const free = info.free || [];
    const overtime = info.overtime || [];
    
    // DEBUG: Log what we're returning to catch inappropriate selections
    const courtDetails = data?.courts?.map((c, i) => {
      const courtNum = i + 1;
      const current = c?.current;
      const endTime = current?.endTime;
      const endDate = endTime ? new Date(endTime) : null;
      const isActive = endDate ? endDate > now : false;
      
      return {
        court: courtNum,
        hasCurrent: !!current,
        endTime: endTime ? endDate.toLocaleTimeString() : null,
        isActive,
        players: current?.players?.length || 0,
        inFreeList: free.includes(courtNum),
        inOvertimeList: overtime.includes(courtNum)
      };
    });
    
    // Only log when something suspicious happens (all courts free or occupied courts in free list)
    const suspiciousLog = free.length >= 11 || courtDetails.some(c => c.isActive && c.inFreeList);
    
    if (suspiciousLog) {
      console.log('🚨 [getSelectableCourtsStrict] SUSPICIOUS - ALL COURTS FREE!', {
        now: now.toLocaleTimeString(),
        free,
        overtime,
        courtDetails: courtDetails.map(c => ({
          court: c.court,
          hasCurrent: c.hasCurrent,
          endTime: c.endTime,
          isActive: c.isActive,
          players: c.players
        })),
        dataPointer: data === null ? 'NULL' : typeof data,
        courtsPointer: data?.courts === null ? 'NULL' : Array.isArray(data?.courts) ? `Array(${data.courts.length})` : typeof data?.courts
      });
    } else {
      console.log('[getSelectableCourtsStrict] Normal:', {
        now: now.toLocaleTimeString(),
        freeCount: free.length,
        occupiedCourts: courtDetails.filter(c => c.isActive).map(c => `Court ${c.court} (until ${c.endTime})`)
      });
    }
    
    return free.length > 0 ? free : overtime;
  }

  // Returns true only if there is NOTHING the user can select
  // (neither free nor overtime courts). This preserves the policy
  // that overtime courts are selectable when free courts are exhausted.
  function shouldAllowWaitlistJoin({ data, now, blocks = [], wetSet = new Set() }) {
    const strict = getSelectableCourtsStrict({ data, now, blocks, wetSet });
    return (strict && typeof strict.size === 'number' ? strict.size : strict.length || 0) === 0;
  }

  // Export on both names (idempotent)
  (function attach(API){
    if (!API.getFreeCourtsInfo) API.getFreeCourtsInfo = getFreeCourtsInfo;
    if (!API.getSelectableCourts) API.getSelectableCourts = getSelectableCourts;
    if (!API.getCourtStatuses) API.getCourtStatuses = getCourtStatuses;
    if (!API.getSelectableCourtsForAssignment) API.getSelectableCourtsForAssignment = getSelectableCourtsForAssignment;
    if (!API.canAssignToCourt) API.canAssignToCourt = canAssignToCourt;
    if (!API.getSelectableCourtsStrict) API.getSelectableCourtsStrict = getSelectableCourtsStrict;
    if (!API.shouldAllowWaitlistJoin) API.shouldAllowWaitlistJoin = shouldAllowWaitlistJoin;
  })((window.Tennis.Domain.availability || window.Tennis.Domain.Availability));

})();