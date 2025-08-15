(function() {
  'use strict';

  // Ensure window.Tennis.Domain namespace exists
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};

  // Wet court management utilities
  const WetCourts = {
    // Check if a court is currently marked as wet
    isWet(courtNumber, wetSet) {
      if (typeof courtNumber !== 'number' || courtNumber < 1) {
        throw new Error('Invalid court number provided');
      }
      if (!wetSet || typeof wetSet.has !== 'function') {
        throw new Error('wetSet must be a Set or Set-like object');
      }
      
      return wetSet.has(courtNumber);
    },

    // Mark a court as wet
    markWet(wetSet, courtNumber) {
      if (!wetSet || typeof wetSet.add !== 'function') {
        throw new Error('wetSet must be a Set or Set-like object with add method');
      }
      if (typeof courtNumber !== 'number' || courtNumber < 1) {
        throw new Error('Invalid court number provided');
      }
      
      wetSet.add(courtNumber);
      return wetSet;
    },

    // Clear wet status from a court
    clearWet(wetSet, courtNumber) {
      if (!wetSet || typeof wetSet.delete !== 'function') {
        throw new Error('wetSet must be a Set or Set-like object with delete method');
      }
      if (typeof courtNumber !== 'number' || courtNumber < 1) {
        throw new Error('Invalid court number provided');
      }
      
      wetSet.delete(courtNumber);
      return wetSet;
    },

    // Get all wet courts as an array
    getAllWet(wetSet) {
      if (!wetSet || typeof wetSet.values !== 'function') {
        throw new Error('wetSet must be a Set or Set-like object');
      }
      
      return Array.from(wetSet).sort((a, b) => a - b);
    },

    // Clear all wet courts
    clearAllWet(wetSet) {
      if (!wetSet || typeof wetSet.clear !== 'function') {
        throw new Error('wetSet must be a Set or Set-like object with clear method');
      }
      
      wetSet.clear();
      return wetSet;
    },

    // Check if any courts are wet
    hasWetCourts(wetSet) {
      if (!wetSet || typeof wetSet.size !== 'number') {
        throw new Error('wetSet must be a Set or Set-like object');
      }
      
      return wetSet.size > 0;
    },

    // Toggle wet status of a court
    toggleWet(wetSet, courtNumber) {
      if (!wetSet || typeof wetSet.has !== 'function' || typeof wetSet.add !== 'function' || typeof wetSet.delete !== 'function') {
        throw new Error('wetSet must be a Set or Set-like object');
      }
      if (typeof courtNumber !== 'number' || courtNumber < 1) {
        throw new Error('Invalid court number provided');
      }
      
      if (wetSet.has(courtNumber)) {
        wetSet.delete(courtNumber);
        return false; // Court is now dry
      } else {
        wetSet.add(courtNumber);
        return true; // Court is now wet
      }
    }
  };

  // Attach to window.Tennis.Domain
  window.Tennis.Domain.WetCourts = WetCourts;

})();