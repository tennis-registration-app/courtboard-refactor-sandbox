(function() {
  'use strict';

  // Ensure window.Tennis.Domain namespace exists
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};

  // Time utilities for tennis court management
  const Time = {
    // Add minutes to a date
    addMinutes(date, minutes) {
      if (!date || !Date.prototype.isPrototypeOf(date)) {
        throw new Error('Invalid date provided');
      }
      if (typeof minutes !== 'number' || isNaN(minutes)) {
        throw new Error('Invalid minutes provided');
      }
      
      const result = new Date(date.getTime());
      result.setMinutes(result.getMinutes() + minutes);
      return result;
    },

    // Calculate duration based on group size (singles vs doubles)
    durationForGroupSize(groupSize, singlesMinutes = 60, doublesMinutes = 90) {
      if (typeof groupSize !== 'number' || groupSize < 1) {
        throw new Error('Invalid group size');
      }
      
      return groupSize >= 4 ? doublesMinutes : singlesMinutes;
    },

    // Check if current time is past the end time (overtime)
    isOverTime(now, endTime) {
      if (!now || !Date.prototype.isPrototypeOf(now)) {
        throw new Error('Invalid current time provided');
      }
      if (!endTime || !Date.prototype.isPrototypeOf(endTime)) {
        throw new Error('Invalid end time provided');
      }
      
      return now.getTime() > endTime.getTime();
    },

    // Format time for display (e.g., "2:30 PM")
    formatTime(date) {
      if (!date || !Date.prototype.isPrototypeOf(date)) {
        throw new Error('Invalid date provided');
      }
      
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    },

    // Format date for display (e.g., "Mon, Jan 15")
    formatDate(date) {
      if (!date || !Date.prototype.isPrototypeOf(date)) {
        throw new Error('Invalid date provided');
      }
      
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  // Attach to window.Tennis.Domain (both capitalized and lowercase for compatibility)
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};
  (function(API) {
    // idempotent dual exports
    if (!window.Tennis.Domain.time) window.Tennis.Domain.time = API;
    if (!window.Tennis.Domain.Time) window.Tennis.Domain.Time = API;
  })(Time);

})();