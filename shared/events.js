(function() {
  'use strict';

  // Ensure window.Tennis namespace exists
  window.Tennis = window.Tennis || {};

  // Circular debug log for tracking events
  class CircularDebugLog {
    constructor(maxSize = 10) {
      this.maxSize = maxSize;
      this.events = [];
      this.enabled = false;
      
      // Check for debug mode
      try {
        const params = new URLSearchParams(window.location.search);
        this.enabled = params.get('debug') === '1';
      } catch {}
    }

    add(type, eventName, data) {
      if (!this.enabled) return;
      
      const entry = {
        timestamp: new Date().toISOString(),
        type: type,
        eventName: eventName,
        data: data
      };
      
      this.events.push(entry);
      
      // Keep only last N events
      if (this.events.length > this.maxSize) {
        this.events.shift();
      }
      
      console.debug(`[Tennis.Events] ${type}: ${eventName}`, data);
    }

    getAll() {
      return [...this.events];
    }

    clear() {
      this.events = [];
    }
  }

  // Create debug log instance
  const debugLog = new CircularDebugLog(10);

  // Events module
  window.Tennis.Events = {
    // Message types constants
    MessageTypes: {
      REGISTER: 'register',
      SUCCESS: 'registration:success',
      HIGHLIGHT: 'highlight'
    },

    // DOM Event handlers (CustomEvent wrapper)
    onDom: function(eventName, handler, options) {
      try {
        window.addEventListener(eventName, handler, options);
        debugLog.add('DOM_LISTENER_ADDED', eventName, { hasOptions: !!options });
      } catch (e) {
        console.error('Error adding DOM event listener:', e);
      }
      
      // Return unsubscribe function
      return function() {
        try {
          window.removeEventListener(eventName, handler, options);
          debugLog.add('DOM_LISTENER_REMOVED', eventName, null);
        } catch {}
      };
    },

    emitDom: function(eventName, detail) {
      try {
        const event = new CustomEvent(eventName, { detail: detail });
        window.dispatchEvent(event);
        debugLog.add('DOM_EVENT_EMITTED', eventName, detail);
      } catch (e) {
        console.error('Error emitting DOM event:', e);
      }
    },

    // PostMessage handlers
    onMessage: function(handler, targetOrigin = '*') {
      const wrappedHandler = function(event) {
        // Security check if origin specified
        if (targetOrigin !== '*' && event.origin !== targetOrigin) {
          return;
        }
        
        debugLog.add('MESSAGE_RECEIVED', event.data?.type || 'unknown', event.data);
        handler(event);
      };
      
      try {
        window.addEventListener('message', wrappedHandler);
        debugLog.add('MESSAGE_LISTENER_ADDED', 'message', { targetOrigin });
      } catch (e) {
        console.error('Error adding message listener:', e);
      }
      
      // Return unsubscribe function
      return function() {
        try {
          window.removeEventListener('message', wrappedHandler);
          debugLog.add('MESSAGE_LISTENER_REMOVED', 'message', null);
        } catch {}
      };
    },

    emitMessage: function(target, message, targetOrigin = '*') {
      try {
        if (!target || !target.postMessage) {
          throw new Error('Invalid target for postMessage');
        }
        
        target.postMessage(message, targetOrigin);
        debugLog.add('MESSAGE_SENT', message.type || 'unknown', message);
      } catch (e) {
        console.error('Error sending message:', e);
      }
    },

    // Debug utilities
    debug: {
      getLog: function() {
        return debugLog.getAll();
      },
      
      clearLog: function() {
        debugLog.clear();
      },
      
      isEnabled: function() {
        return debugLog.enabled;
      }
    }
  };

})();