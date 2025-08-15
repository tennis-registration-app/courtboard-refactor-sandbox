(function() {
  'use strict';

  // Ensure window.Tennis.Domain namespace exists
  window.Tennis = window.Tennis || {};
  window.Tennis.Domain = window.Tennis.Domain || {};

  // Court blocking utilities
  const Blocks = {
    // Apply a template to create actual block instances
    applyTemplate({ template, now }) {
      if (!template || typeof template !== 'object') {
        throw new Error('Invalid template provided');
      }
      if (!now || !Date.prototype.isPrototypeOf(now)) {
        throw new Error('Invalid current time provided');
      }
      
      const { name, reason, duration, courts } = template;
      
      if (!name || typeof name !== 'string') {
        throw new Error('Template must have a valid name');
      }
      if (!reason || typeof reason !== 'string') {
        throw new Error('Template must have a valid reason');
      }
      if (typeof duration !== 'number' || duration <= 0) {
        throw new Error('Template must have a valid duration in minutes');
      }
      if (!Array.isArray(courts) || courts.length === 0) {
        throw new Error('Template must specify at least one court');
      }
      
      const blocks = [];
      const endTime = new Date(now.getTime() + (duration * 60 * 1000));
      
      courts.forEach(courtNumber => {
        if (typeof courtNumber !== 'number' || courtNumber < 1) {
          throw new Error('Invalid court number in template');
        }
        
        blocks.push({
          id: `${template.id || Date.now()}-${courtNumber}`,
          courtNumber: courtNumber,
          reason: reason,
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
          createdAt: new Date().toISOString(),
          templateName: name,
          templateId: template.id
        });
      });
      
      return blocks;
    },

    // Expand a recurrence rule to create multiple block instances
    expandRecurrence({ rule, start, end }) {
      if (!rule || typeof rule !== 'object') {
        throw new Error('Invalid recurrence rule provided');
      }
      if (!start || !Date.prototype.isPrototypeOf(start)) {
        throw new Error('Invalid start date provided');
      }
      if (!end || !Date.prototype.isPrototypeOf(end)) {
        throw new Error('Invalid end date provided');
      }
      if (start >= end) {
        throw new Error('Start date must be before end date');
      }
      
      const { pattern, frequency = 1, template } = rule;
      
      if (!pattern || !['daily', 'weekly', 'monthly'].includes(pattern)) {
        throw new Error('Recurrence pattern must be daily, weekly, or monthly');
      }
      if (typeof frequency !== 'number' || frequency < 1) {
        throw new Error('Frequency must be a positive number');
      }
      if (!template) {
        throw new Error('Recurrence rule must include a template');
      }
      
      const blocks = [];
      let currentDate = new Date(start);
      
      while (currentDate < end) {
        // Apply template at current date
        try {
          const templateBlocks = this.applyTemplate({ template, now: currentDate });
          blocks.push(...templateBlocks);
        } catch (error) {
          console.warn(`Failed to apply template at ${currentDate.toISOString()}:`, error.message);
        }
        
        // Advance to next occurrence
        switch (pattern) {
          case 'daily':
            currentDate.setDate(currentDate.getDate() + frequency);
            break;
          case 'weekly':
            currentDate.setDate(currentDate.getDate() + (7 * frequency));
            break;
          case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + frequency);
            break;
        }
      }
      
      return blocks;
    },

    // Check if two time periods overlap
    overlaps(periodA, periodB) {
      if (!periodA || typeof periodA !== 'object') {
        throw new Error('Invalid period A provided');
      }
      if (!periodB || typeof periodB !== 'object') {
        throw new Error('Invalid period B provided');
      }
      
      const { startTime: startA, endTime: endA } = periodA;
      const { startTime: startB, endTime: endB } = periodB;
      
      if (!startA || !endA) {
        throw new Error('Period A must have startTime and endTime');
      }
      if (!startB || !endB) {
        throw new Error('Period B must have startTime and endTime');
      }
      
      const startTimeA = new Date(startA);
      const endTimeA = new Date(endA);
      const startTimeB = new Date(startB);
      const endTimeB = new Date(endB);
      
      // Validate dates
      if (isNaN(startTimeA.getTime()) || isNaN(endTimeA.getTime())) {
        throw new Error('Invalid dates in period A');
      }
      if (isNaN(startTimeB.getTime()) || isNaN(endTimeB.getTime())) {
        throw new Error('Invalid dates in period B');
      }
      if (startTimeA >= endTimeA || startTimeB >= endTimeB) {
        throw new Error('Start time must be before end time in both periods');
      }
      
      // Check for overlap: periods overlap if start of one is before end of other AND vice versa
      return startTimeA < endTimeB && startTimeB < endTimeA;
    }
  };

  // Attach to window.Tennis.Domain
  window.Tennis.Domain.Blocks = Blocks;

})();