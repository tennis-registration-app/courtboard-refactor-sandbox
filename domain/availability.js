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
        
        // Check if court is occupied
        let isOccupied = false;
        if (court) {
          // Check new structure (court.current)
          if (court.current && court.current.players && court.current.players.length > 0) {
            isOccupied = true;
          }
          // Check old structure (court.players)
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

    // Use existing API for free list (honors wetSet/blocks per current logic)
    const arr  = (window.Tennis.Domain.availability || window.Tennis.Domain.Availability)
                   .getFreeCourts({ data, now, blocks, wetSet }) || [];
    const free = Array.isArray(arr) ? arr.slice().sort((a,b)=>a-b) : (arr.free || []);
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

  // Export on both names (idempotent)
  (function attach(API){
    if (!API.getFreeCourtsInfo) API.getFreeCourtsInfo = getFreeCourtsInfo;
    if (!API.getSelectableCourts) API.getSelectableCourts = getSelectableCourts;
  })((window.Tennis.Domain.availability || window.Tennis.Domain.Availability));

})();