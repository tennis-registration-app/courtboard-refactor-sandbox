(function() {
  'use strict';

  // Ensure window.Tennis.Domain namespace exists
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};

  // Waitlist management utilities
  const Waitlist = {
    // Validate that a group is properly formed
    validateGroup(group) {
      if (!Array.isArray(group)) {
        return { valid: false, error: 'Group must be an array' };
      }
      
      if (group.length === 0) {
        return { valid: false, error: 'Group cannot be empty' };
      }
      
      if (group.length > 4) {
        return { valid: false, error: 'Group cannot have more than 4 players' };
      }
      
      // Validate each player
      for (let i = 0; i < group.length; i++) {
        const player = group[i];
        
        if (!player || typeof player !== 'object') {
          return { valid: false, error: `Player ${i + 1} is invalid` };
        }
        
        if (!player.name || typeof player.name !== 'string' || player.name.trim().length === 0) {
          return { valid: false, error: `Player ${i + 1} must have a valid name` };
        }
        
        // ID is optional - we can work with just names
        // if (!player.id || typeof player.id !== 'string') {
        //   return { valid: false, error: `Player ${i + 1} must have a valid ID` };
        // }
      }
      
      // Check for duplicate players (by ID if available, otherwise by normalized name)
      const playerKeys = group.map(p => {
        if (p.id) return `id:${p.id}`;
        return `name:${p.name.trim().toLowerCase()}`;
      });
      const uniqueKeys = new Set(playerKeys);
      if (playerKeys.length !== uniqueKeys.size) {
        return { valid: false, error: 'Duplicate players are not allowed in the same group' };
      }
      
      return { valid: true };
    },

    // Estimate wait time in minutes for a group at a specific position
    estimateWaitMinutes({ position, courts = [], now, avgGame = 75 }) {
      if (typeof position !== 'number' || position < 1) {
        throw new Error('Position must be a positive number');
      }
      if (!Array.isArray(courts)) {
        throw new Error('Courts must be an array');
      }
      if (!now || !Date.prototype.isPrototypeOf(now)) {
        throw new Error('Invalid current time provided');
      }
      if (typeof avgGame !== 'number' || avgGame <= 0) {
        throw new Error('Average game time must be a positive number');
      }
      
      // If first in line, check for immediate availability
      if (position === 1) {
        // Count courts that will be available soon
        const availabilityTimes = [];
        
        for (let i = 0; i < courts.length; i++) {
          const court = courts[i];
          
          if (!court) {
            // Court is currently free
            return 0;
          }
          
          let endTime = null;
          
          // Check new structure (court.current)
          if (court.current && court.current.endTime) {
            endTime = new Date(court.current.endTime);
          }
          // Check old structure (court.endTime)
          else if (court.endTime) {
            endTime = new Date(court.endTime);
          }
          
          if (endTime && endTime > now) {
            const waitMinutes = Math.ceil((endTime.getTime() - now.getTime()) / (60 * 1000));
            availabilityTimes.push(waitMinutes);
          } else {
            // Court should be available now (may be overtime)
            return 0;
          }
        }
        
        // Return shortest wait time
        return availabilityTimes.length > 0 ? Math.min(...availabilityTimes) : 0;
      }
      
      // For positions beyond first, estimate based on court turnover
      const totalCourts = Math.max(courts.length, 1);
      const rounds = Math.ceil(position / totalCourts);
      const baseWait = (rounds - 1) * avgGame;
      
      // Add estimated wait for current games to finish
      let averageCurrentWait = 0;
      let occupiedCourts = 0;
      
      for (let i = 0; i < courts.length; i++) {
        const court = courts[i];
        
        if (court) {
          let endTime = null;
          
          // Check new structure (court.current)
          if (court.current && court.current.endTime) {
            endTime = new Date(court.current.endTime);
          }
          // Check old structure (court.endTime)
          else if (court.endTime) {
            endTime = new Date(court.endTime);
          }
          
          if (endTime && endTime > now) {
            const waitMinutes = Math.ceil((endTime.getTime() - now.getTime()) / (60 * 1000));
            averageCurrentWait += waitMinutes;
            occupiedCourts++;
          }
        }
      }
      
      if (occupiedCourts > 0) {
        averageCurrentWait = averageCurrentWait / occupiedCourts;
      } else {
        averageCurrentWait = 0;
      }
      
      return Math.max(0, Math.ceil(baseWait + averageCurrentWait));
    }
  };

  /**
   * estimateWaitForPositions({
   *   positions,            // array of positive integers: [1,2,3,...]
   *   currentFreeCount,     // number of courts free "now"
   *   nextFreeTimes,        // Date[] length = Config.Courts.TOTAL_COUNT (index n-1 -> court n)
   *   avgGameMinutes        // optional; default Tennis.Config.Timing.AVG_GAME
   * }) -> number[]          // minutes until playable for each position (rounded up, >= 0)
   *
   * Method: simulate court availability with a min-heap of next-available times.
   *   - Build an array of times:
   *       * push `now` for each currently free court (currentFreeCount times)
   *       * for remaining courts, push the corresponding nextFreeTimes[i]
   *   - For each seat in 1..max(positions):
   *       * pop the earliest time `t`
   *       * ETA for that seat is max(0, ceil((t - now)/60000))
   *       * push back `t + avgGameMinutes`
   *   - Return ETAs indexed by order of `positions`
   */
  function estimateWaitForPositions({ positions, currentFreeCount, nextFreeTimes, avgGameMinutes }) {
    const now = new Date();
    const avg = Number.isFinite(avgGameMinutes) && avgGameMinutes > 0
      ? Math.floor(avgGameMinutes) : (window.Tennis?.Config?.Timing?.AVG_GAME || 75);
    const total = window.Tennis?.Config?.Courts?.TOTAL_COUNT || (nextFreeTimes?.length || 12);
    const times = [];
    
    // Build array of court availability times
    // First, add 'now' for each currently free court
    for (let i = 0; i < Math.min(currentFreeCount, total); i++) {
      times.push(now);
    }
    
    // Then add the actual next free times for all courts
    // We need ALL courts in the times array, not just occupied ones
    if (nextFreeTimes && Array.isArray(nextFreeTimes)) {
      for (let courtIdx = 0; courtIdx < total; courtIdx++) {
        const nextFreeTime = nextFreeTimes[courtIdx] ? new Date(nextFreeTimes[courtIdx]) : now;
        
        // Skip courts we already added as "free now"
        // Free courts should have nextFreeTime = now, but occupied courts have future times
        if (nextFreeTime > now) {
          times.push(nextFreeTime);
        }
      }
    }
    
    // If we don't have enough times, pad with 'now'
    while (times.length < total) {
      times.push(now);
    }
    // simple min-heap via array ops (n is small)
    const popMinIdx = () => {
      let mi = 0;
      for (let i = 1; i < times.length; i++) if (times[i] < times[mi]) mi = i;
      return mi;
    };
    const maxP = Math.max(...positions);
    const seatTimes = new Array(maxP);
    for (let seat = 0; seat < maxP; seat++) {
      const i = popMinIdx();
      const t = times[i];
      seatTimes[seat] = new Date(t);
      // advance that court by one average game
      times[i] = new Date(t.getTime() + avg * 60000);
    }
    return positions.map(p => {
      const t = seatTimes[p - 1] || now;
      const diff = Math.max(0, t.getTime() - now.getTime());
      return Math.ceil(diff / 60000);
    });
  }

  // Add new function to existing Waitlist object
  Waitlist.estimateWaitForPositions = estimateWaitForPositions;

  // Attach to window.Tennis.Domain
  window.Tennis.Domain.Waitlist = Waitlist;

  // Backward compatibility: keep existing single-position helper (if present)
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};
  (function(API){
    API.estimateWaitForPositions = API.estimateWaitForPositions || estimateWaitForPositions;
    // legacy alias: estimateWaitMinutes(position, ...) -> minutes
    if (!API.estimateWaitMinutes) {
      API.estimateWaitMinutes = function({ position=1, currentFreeCount, nextFreeTimes, avgGameMinutes }) {
        return estimateWaitForPositions({ positions:[position], currentFreeCount, nextFreeTimes, avgGameMinutes })[0];
      };
    }
  })(window.Tennis.Domain.waitlist || (window.Tennis.Domain.waitlist = (window.Tennis.Domain.Waitlist || {})));

})();