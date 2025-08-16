(function() {
  'use strict';

  // Ensure window.Tennis namespace exists
  window.Tennis = window.Tennis || {};

  // Configuration constants for the tennis court system
  window.Tennis.Config = {
    // Court configuration
    Courts: {
      TOTAL_COUNT: 12,
      TOP_ROW: [1, 2, 3, 4, 5, 6, 7, 8],
      BOTTOM_ROW: [12, 11, 10, 9]
    },

    // Timing configuration (in minutes)
    Timing: {
      SINGLES: 60,
      DOUBLES: 90,
      MAX_PLAY: 210,
      AVG_GAME: 75,
      AUTO_CLEAR_MIN: 180 // minutes; auto-clear sessions older than this
    },

    // Display configuration
    Display: {
      MAX_WAITING_DISPLAY: 6
    }
  };

})();