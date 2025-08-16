(function() {
  'use strict';

  // Ensure window.Tennis namespace exists
  window.Tennis = window.Tennis || {};

  // Self-test utilities for domain modules
  const selfTest = {
    runAll() {
      console.group('🧪 Tennis Domain Self-Tests');
      
      let totalTests = 0;
      let passedTests = 0;
      let failedTests = 0;
      
      const assert = (condition, message) => {
        totalTests++;
        if (condition) {
          console.log(`✅ ${message}`);
          passedTests++;
        } else {
          console.error(`❌ ${message}`);
          failedTests++;
        }
      };

      try {
        // Test Time module
        if (window.Tennis.Domain && window.Tennis.Domain.Time) {
          console.group('⏰ Time Module Tests');
          const Time = window.Tennis.Domain.Time;
          
          const now = new Date();
          const future = Time.addMinutes(now, 30);
          assert(future.getTime() > now.getTime(), 'addMinutes adds time correctly');
          assert(future.getTime() - now.getTime() === 30 * 60 * 1000, 'addMinutes adds correct amount');
          
          assert(Time.durationForGroupSize(2) === 60, 'Singles duration is 60 minutes');
          assert(Time.durationForGroupSize(4) === 90, 'Doubles duration is 90 minutes');
          
          const past = new Date(now.getTime() - 60000);
          assert(Time.isOverTime(now, past) === true, 'isOverTime detects overtime correctly');
          assert(Time.isOverTime(past, now) === false, 'isOverTime detects non-overtime correctly');
          
          assert(typeof Time.formatTime(now) === 'string', 'formatTime returns string');
          assert(typeof Time.formatDate(now) === 'string', 'formatDate returns string');
          
          console.groupEnd();
        }

        // Test Availability module
        if (window.Tennis.Domain && window.Tennis.Domain.Availability) {
          console.group('🏟️ Availability Module Tests');
          const Availability = window.Tennis.Domain.Availability;
          
          const testData = { courts: [null, null, { players: [{ name: 'Test' }] }] };
          const freeCourts = Availability.getFreeCourts({ data: testData, now: new Date(), blocks: [] });
          assert(Array.isArray(freeCourts), 'getFreeCourts returns array');
          assert(freeCourts.includes(1) && freeCourts.includes(2), 'getFreeCourts finds free courts');
          assert(!freeCourts.includes(3), 'getFreeCourts excludes occupied courts');
          
          const hasConflict = Availability.hasSoonBlockConflict({
            courtNumber: 1,
            now: new Date(),
            blocks: [],
            requiredMinutes: 60
          });
          assert(typeof hasConflict === 'boolean', 'hasSoonBlockConflict returns boolean');
          
          console.groupEnd();
        }

        // Test Waitlist module
        if (window.Tennis.Domain && window.Tennis.Domain.Waitlist) {
          console.group('📋 Waitlist Module Tests');
          const Waitlist = window.Tennis.Domain.Waitlist;
          
          const validGroup = [{ name: 'Player 1', id: 'p1' }, { name: 'Player 2', id: 'p2' }];
          const validation = Waitlist.validateGroup(validGroup);
          assert(validation.valid === true, 'validateGroup accepts valid group');
          
          const invalidGroup = [{ name: 'Player 1', id: 'p1' }, { name: 'Player 2', id: 'p1' }];
          const invalidValidation = Waitlist.validateGroup(invalidGroup);
          assert(invalidValidation.valid === false, 'validateGroup rejects duplicate IDs');
          
          const waitTime = Waitlist.estimateWaitMinutes({
            position: 1,
            courts: [],
            now: new Date(),
            avgGame: 75
          });
          assert(typeof waitTime === 'number', 'estimateWaitMinutes returns number');
          assert(waitTime >= 0, 'estimateWaitMinutes returns non-negative number');
          
          console.groupEnd();
        }

        // Test Blocks module
        if (window.Tennis.Domain && window.Tennis.Domain.Blocks) {
          console.group('🚫 Blocks Module Tests');
          const Blocks = window.Tennis.Domain.Blocks;
          
          const template = {
            id: 'test-template',
            name: 'Test Block',
            reason: 'Testing',
            duration: 60,
            courts: [1, 2]
          };
          const blocks = Blocks.applyTemplate({ template, now: new Date() });
          assert(Array.isArray(blocks), 'applyTemplate returns array');
          assert(blocks.length === 2, 'applyTemplate creates block for each court');
          assert(blocks[0].courtNumber === 1, 'applyTemplate sets correct court numbers');
          
          const periodA = { startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T11:00:00Z' };
          const periodB = { startTime: '2024-01-01T10:30:00Z', endTime: '2024-01-01T11:30:00Z' };
          const periodC = { startTime: '2024-01-01T12:00:00Z', endTime: '2024-01-01T13:00:00Z' };
          
          assert(Blocks.overlaps(periodA, periodB) === true, 'overlaps detects overlapping periods');
          assert(Blocks.overlaps(periodA, periodC) === false, 'overlaps detects non-overlapping periods');
          
          console.groupEnd();
        }

        // Test WetCourts module
        if (window.Tennis.Domain && window.Tennis.Domain.WetCourts) {
          console.group('💧 WetCourts Module Tests');
          const WetCourts = window.Tennis.Domain.WetCourts;
          
          const wetSet = new Set();
          assert(WetCourts.isWet(1, wetSet) === false, 'isWet returns false for dry court');
          
          WetCourts.markWet(wetSet, 1);
          assert(WetCourts.isWet(1, wetSet) === true, 'markWet sets court as wet');
          
          WetCourts.clearWet(wetSet, 1);
          assert(WetCourts.isWet(1, wetSet) === false, 'clearWet removes wet status');
          
          WetCourts.markWet(wetSet, 2);
          WetCourts.markWet(wetSet, 3);
          const wetList = WetCourts.getAllWet(wetSet);
          assert(Array.isArray(wetList) && wetList.length === 2, 'getAllWet returns correct list');
          
          assert(WetCourts.hasWetCourts(wetSet) === true, 'hasWetCourts detects wet courts');
          
          const toggled = WetCourts.toggleWet(wetSet, 4);
          assert(toggled === true && WetCourts.isWet(4, wetSet), 'toggleWet marks dry court as wet');
          
          console.groupEnd();
        }

        // Test getNextFreeTimes
        if (window.Tennis.Domain && window.Tennis.Domain.Availability && window.Tennis.Domain.Availability.getNextFreeTimes) {
          console.group('⏭️ NextFreeTimes Tests');
          const Availability = window.Tennis.Domain.Availability;
          const now = new Date();
          
          // Test 1: All courts empty/no blocks → every entry ≈ now (±2s)
          const emptyData = { courts: Array(12).fill(null) };
          const emptyResult = Availability.getNextFreeTimes({ data: emptyData, now: now, blocks: [] });
          assert(Array.isArray(emptyResult) && emptyResult.length === 12, 'getNextFreeTimes returns array of 12');
          let allNearNow = true;
          for (let i = 0; i < emptyResult.length; i++) {
            const diff = Math.abs(emptyResult[i].getTime() - now.getTime());
            if (diff > 2000) {
              allNearNow = false;
              break;
            }
          }
          assert(allNearNow, 'All courts empty → all entries ≈ now (±2s)');
          
          // Test 2: Court 3 occupied until now+30m → entry for index 2 ≥ now+30m
          const occupiedData = {
            courts: [
              null, null,
              { current: { endTime: new Date(now.getTime() + 30 * 60 * 1000) } },
              ...Array(9).fill(null)
            ]
          };
          const occupiedResult = Availability.getNextFreeTimes({ data: occupiedData, now: now, blocks: [] });
          const court3Time = occupiedResult[2];
          assert(court3Time >= new Date(now.getTime() + 30 * 60 * 1000), 'Court 3 occupied until now+30m → entry ≥ now+30m');
          
          // Test 3: Court 5 has a block covering now..now+45m → entry for index 4 ≥ now+45m
          const blockData = { courts: Array(12).fill(null) };
          const blocks = [{
            courtNumber: 5,
            startTime: now.toISOString(),
            endTime: new Date(now.getTime() + 45 * 60 * 1000).toISOString()
          }];
          const blockResult = Availability.getNextFreeTimes({ data: blockData, now: now, blocks: blocks });
          const court5Time = blockResult[4];
          assert(court5Time >= new Date(now.getTime() + 45 * 60 * 1000), 'Court 5 blocked until now+45m → entry ≥ now+45m');
          
          console.groupEnd();
        }

        // Test estimateWaitForPositions
        if (window.Tennis.Domain && window.Tennis.Domain.Waitlist && window.Tennis.Domain.Waitlist.estimateWaitForPositions) {
          console.group('⏱️ Waitlist ETA Tests');
          const Waitlist = window.Tennis.Domain.Waitlist;
          const now = new Date();
          
          // Case 1: all 12 courts free now → ETAs for [1,2,3] are all 0
          const allFreeResult = Waitlist.estimateWaitForPositions({
            positions: [1, 2, 3],
            currentFreeCount: 12,
            nextFreeTimes: Array(12).fill(now),
            avgGameMinutes: 75
          });
          assert(allFreeResult.length === 3, 'estimateWaitForPositions returns correct array length');
          assert(allFreeResult.every(eta => eta === 0), 'All courts free → ETAs for [1,2,3] are all 0');
          
          // Case 2: 2 courts free now, 10 courts next free at now+30m, avg=75 → ETAs for [1,2,3,4] are [0,0,30,30] (±1 min tolerance)
          const future30 = new Date(now.getTime() + 30 * 60 * 1000);
          const nextFreeTimes = [future30, future30, ...Array(10).fill(future30)];
          const mixedResult = Waitlist.estimateWaitForPositions({
            positions: [1, 2, 3, 4],
            currentFreeCount: 2,
            nextFreeTimes: nextFreeTimes,
            avgGameMinutes: 75
          });
          assert(mixedResult.length === 4, 'Mixed availability returns correct array length');
          assert(mixedResult[0] === 0 && mixedResult[1] === 0, 'First 2 positions get immediate play (0 wait)');
          assert(Math.abs(mixedResult[2] - 30) <= 1, 'Position 3 waits ~30 min (±1 tolerance)');
          assert(Math.abs(mixedResult[3] - 30) <= 1, 'Position 4 waits ~30 min (±1 tolerance)');
          
          // Case 3: one court next free at now+45m with others free → ETAs for [1,2] are [0,0], for [13] grows appropriately
          const future45 = new Date(now.getTime() + 45 * 60 * 1000);
          const oneDelayedTimes = [future45, ...Array(11).fill(now)];
          const oneDelayedResult = Waitlist.estimateWaitForPositions({
            positions: [1, 2, 13],
            currentFreeCount: 11,
            nextFreeTimes: oneDelayedTimes,
            avgGameMinutes: 75
          });
          assert(oneDelayedResult[0] === 0 && oneDelayedResult[1] === 0, 'First 2 positions play immediately');
          assert(oneDelayedResult[2] >= 45, 'Position 13 waits ≥45 min due to turnover');
          
          console.groupEnd();
        }

        // Test getFreeCourtsInfo
        if (window.Tennis.Domain && window.Tennis.Domain.Availability && window.Tennis.Domain.Availability.getFreeCourtsInfo) {
          console.group('🧩 getFreeCourtsInfo Tests');
          const Availability = window.Tennis.Domain.Availability;
          const now = new Date();
          
          // Test 1: Empty data / no wetSet - total count and free+occupied = total
          const emptyData = { courts: Array(12).fill(null) };
          const info1 = Availability.getFreeCourtsInfo({ data: emptyData, now: now, blocks: [], wetSet: new Set() });
          const configTotal = window.Tennis?.Config?.Courts?.TOTAL_COUNT || 12;
          assert(info1.meta.total === configTotal, 'info.meta.total === Config.Courts.TOTAL_COUNT');
          assert(info1.free.length + info1.occupied.length === info1.meta.total, 'info.free.length + info.occupied.length === total');
          
          // Test 2: Mark wetSet = new Set([2,5]) - assert 2 & 5 are in info.wet and not in info.free
          const wetSet = new Set([2, 5]);
          const info2 = Availability.getFreeCourtsInfo({ data: emptyData, now: now, blocks: [], wetSet: wetSet });
          assert(info2.wet.includes(2) && info2.wet.includes(5), '2 & 5 are in info.wet');
          assert(!info2.free.includes(2) && !info2.free.includes(5), '2 & 5 are not in info.free');
          
          // Test 3: One court occupied - assert it's in info.occupied
          const occupiedData = { courts: [null, { current: { players: [{ name: 'Test' }], endTime: new Date(now.getTime() + 60000) } }, ...Array(10).fill(null)] };
          const info3 = Availability.getFreeCourtsInfo({ data: occupiedData, now: now, blocks: [], wetSet: new Set() });
          assert(info3.occupied.includes(2), 'Occupied court is in info.occupied');
          
          console.groupEnd();
        }

        // Test overtime detection
        if (window.Tennis.Domain && window.Tennis.Domain.Availability && window.Tennis.Domain.Availability.getFreeCourtsInfo) {
          console.group('⏳ Overtime detection tests');
          const Availability = window.Tennis.Domain.Availability;
          const now = new Date();
          
          // Case 1: total=4, set court 2 with current.endTime = now - 5m, others empty → info.overtime contains 2 and meta.overtimeCount === 1
          const past5Min = new Date(now.getTime() - 5 * 60 * 1000);
          const overtimeData = { 
            courts: [
              null, 
              { current: { endTime: past5Min } }, 
              null, 
              null
            ]
          };
          const info1 = Availability.getFreeCourtsInfo({ data: overtimeData, now: now, blocks: [], wetSet: new Set() });
          assert(info1.overtime.includes(2), 'Court 2 with past endTime is in overtime');
          assert(info1.meta.overtimeCount === 1, 'meta.overtimeCount equals 1');
          
          // Case 2: flip court 2 to now + 5m → info.overtime is empty and overtimeCount === 0
          const future5Min = new Date(now.getTime() + 5 * 60 * 1000);
          const futureData = { 
            courts: [
              null, 
              { current: { endTime: future5Min } }, 
              null, 
              null
            ]
          };
          const info2 = Availability.getFreeCourtsInfo({ data: futureData, now: now, blocks: [], wetSet: new Set() });
          assert(info2.overtime.length === 0, 'Court with future endTime not in overtime');
          assert(info2.meta.overtimeCount === 0, 'meta.overtimeCount equals 0 for future endTime');
          
          console.groupEnd();
        }

        // Test getSelectableCourts
        if (window.Tennis.Domain && window.Tennis.Domain.Availability && window.Tennis.Domain.Availability.getSelectableCourts) {
          console.group('🎯 Selectable courts tests');
          const Availability = window.Tennis.Domain.Availability;
          const now = new Date();
          
          // Case A: one true free court exists → getSelectableCourts returns exactly that free court (and ignores overtime)
          const freeData = { courts: [null, null, null, null] };
          const selectable1 = Availability.getSelectableCourts({ data: freeData, now: now, blocks: [], wetSet: new Set() });
          assert(selectable1.length > 0, 'Free courts available returns non-empty selectable list');
          assert(selectable1.includes(1) || selectable1.includes(2) || selectable1.includes(3) || selectable1.includes(4), 'Selectable contains at least one free court');
          
          // Case B: no free, one overtime → returns that overtime court
          const past10Min = new Date(now.getTime() - 10 * 60 * 1000);
          const overtimeData = { 
            courts: [
              { current: { endTime: past10Min } }, 
              { current: { endTime: past10Min } }, 
              { current: { endTime: past10Min } }, 
              { current: { endTime: past10Min } }
            ]
          };
          const selectable2 = Availability.getSelectableCourts({ data: overtimeData, now: now, blocks: [], wetSet: new Set() });
          assert(selectable2.length > 0, 'Overtime courts become selectable when no free courts');
          assert(selectable2.includes(1) && selectable2.includes(2) && selectable2.includes(3) && selectable2.includes(4), 'All overtime courts are selectable');
          
          // Case C: wet courts are excluded
          const wetSet = new Set([2]);
          const selectable3 = Availability.getSelectableCourts({ data: freeData, now: now, blocks: [], wetSet: wetSet });
          assert(!selectable3.includes(2), 'Wet courts excluded from selectable list');
          
          // Case C: blocked courts are excluded
          const activeBlock = [{ courtNumber: 3, startTime: new Date(now.getTime() - 1000), endTime: new Date(now.getTime() + 60000) }];
          const selectable4 = Availability.getSelectableCourts({ data: freeData, now: now, blocks: activeBlock, wetSet: new Set() });
          assert(!selectable4.includes(3), 'Blocked courts excluded from selectable list');
          
          console.log('✅ selectable courts tests passed');
          console.groupEnd();
        }

        // Test Selection Policy
        if (window.Tennis.Domain && window.Tennis.Domain.Availability && window.Tennis.Domain.Availability.getSelectableCourts) {
          console.group('🎯 Selection Policy Tests');
          const Av = window.Tennis.Domain.availability || window.Tennis.Domain.Availability;
          const now = new Date();
          
          // Case A: free exists - Courts: 1 idle, others in-progress → expect selectable = [1] (free only)
          const freeExistsData = {
            courts: [
              { current: undefined }, // Court 1: idle (free)
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 2: in-progress
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }, // Court 3: in-progress
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p3', name: 'Player 3' }] } }  // Court 4: in-progress
            ]
          };
          const selectableA = Av.getSelectableCourts({ data: freeExistsData, now: now, blocks: [], wetSet: new Set() });
          const infoA = Av.getFreeCourtsInfo({ data: freeExistsData, now: now, blocks: [], wetSet: new Set() });
          assert(selectableA.length === 1 && selectableA.includes(1), 'Case A: When free courts exist, returns only free courts');
          assert(infoA.overtime.length === 0, 'Case A: No overtime courts when games are in progress');
          
          // Case B: no free, overtime exists - Courts: all in overtime except 1 in-progress → expect selectable = [overtime courts]
          const overtimeExistsData = {
            courts: [
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 1: overtime
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }, // Court 2: overtime
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p3', name: 'Player 3' }] } }, // Court 3: overtime
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p4', name: 'Player 4' }] } }  // Court 4: in-progress
            ]
          };
          const selectableB = Av.getSelectableCourts({ data: overtimeExistsData, now: now, blocks: [], wetSet: new Set() });
          const infoB = Av.getFreeCourtsInfo({ data: overtimeExistsData, now: now, blocks: [], wetSet: new Set() });
          assert(selectableB.length === 3 && selectableB.includes(1) && selectableB.includes(2) && selectableB.includes(3), 'Case B: When no free courts, returns overtime courts');
          assert(infoB.free.length === 0, 'Case B: No free courts available');
          
          // Case C: wet excluded - Courts: 1 idle but wet, 2 idle and not wet, others in-progress → expect selectable = [2]
          const wetExcludedData = {
            courts: [
              { current: undefined }, // Court 1: idle but will be wet
              { current: undefined }, // Court 2: idle and not wet
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 3: in-progress
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }  // Court 4: in-progress
            ]
          };
          const wetSet = new Set([1]); // Court 1 is wet
          const selectableC = Av.getSelectableCourts({ data: wetExcludedData, now: now, blocks: [], wetSet: wetSet });
          assert(selectableC.length === 1 && selectableC.includes(2) && !selectableC.includes(1), 'Case C: Wet courts are excluded from selection');
          
          // Case D: blocked excluded - Courts: 1 idle but blocked, 2 idle and not blocked, others in-progress → expect selectable = [2]
          const blockedExcludedData = {
            courts: [
              { current: undefined }, // Court 1: idle but will be blocked
              { current: undefined }, // Court 2: idle and not blocked
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 3: in-progress
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }  // Court 4: in-progress
            ]
          };
          const blocks = [{
            courtNumber: 1,
            startTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
            endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
            isWetCourt: false
          }];
          const selectableD = Av.getSelectableCourts({ data: blockedExcludedData, now: now, blocks: blocks, wetSet: new Set() });
          assert(selectableD.length === 1 && selectableD.includes(2) && !selectableD.includes(1), 'Case D: Blocked courts are excluded from selection');
          
          // Case E: fallback to overtime with exclusions - Courts: no free; overtime [1,2], but 2 is wet → expect selectable = [1]
          const overtimeWithExclusionsData = {
            courts: [
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 1: overtime
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }, // Court 2: overtime but wet
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p3', name: 'Player 3' }] } }, // Court 3: in-progress
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p4', name: 'Player 4' }] } }  // Court 4: in-progress
            ]
          };
          const wetSetE = new Set([2]); // Court 2 is wet
          const selectableE = Av.getSelectableCourts({ data: overtimeWithExclusionsData, now: now, blocks: [], wetSet: wetSetE });
          assert(selectableE.length === 1 && selectableE.includes(1) && !selectableE.includes(2), 'Case E: Wet overtime courts are excluded, returns only available overtime');
          
          console.groupEnd();
        }

        // Test Court Statuses
        if (window.Tennis.Domain && window.Tennis.Domain.Availability && window.Tennis.Domain.Availability.getCourtStatuses) {
          console.group('🏛️ Court Statuses Tests');
          const Availability = window.Tennis.Domain.Availability;
          const now = new Date();
          
          // Test 1: With one truly free court → that court's status === 'free' and selectable === true
          const oneFreeData = {
            courts: [
              { current: undefined }, // Court 1: free
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 2: occupied
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }, // Court 3: occupied
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p3', name: 'Player 3' }] } }  // Court 4: occupied
            ]
          };
          const statuses1 = Availability.getCourtStatuses({ data: oneFreeData, now: now, blocks: [], wetSet: new Set() });
          const court1 = statuses1.find(s => s.courtNumber === 1);
          const court2 = statuses1.find(s => s.courtNumber === 2);
          assert(court1.status === 'free' && court1.selectable === true, 'Free court has status "free" and selectable true');
          assert(court2.status === 'occupied' && court2.selectable === false, 'Occupied court has status "occupied" and selectable false');
          
          // Test 2: With no free, two overtime → both have status === 'overtime' and selectable === true
          const overtimeData = {
            courts: [
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 1: overtime
              { current: { endTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }, // Court 2: overtime
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p3', name: 'Player 3' }] } }, // Court 3: occupied
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p4', name: 'Player 4' }] } }  // Court 4: occupied
            ]
          };
          const statuses2 = Availability.getCourtStatuses({ data: overtimeData, now: now, blocks: [], wetSet: new Set() });
          const overtime1 = statuses2.find(s => s.courtNumber === 1);
          const overtime2 = statuses2.find(s => s.courtNumber === 2);
          assert(overtime1.status === 'overtime' && overtime1.selectable === true, 'Overtime court has status "overtime" and selectable true when no free courts');
          assert(overtime2.status === 'overtime' && overtime2.selectable === true, 'Second overtime court also selectable when no free courts');
          
          // Test 3: Wet court has selectable === false and status 'wet'
          const wetData = {
            courts: [
              { current: undefined }, // Court 1: would be free but wet
              { current: undefined }, // Court 2: free
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 3: occupied
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }  // Court 4: occupied
            ]
          };
          const wetSet = new Set([1]);
          const statuses3 = Availability.getCourtStatuses({ data: wetData, now: now, blocks: [], wetSet: wetSet });
          const wetCourt = statuses3.find(s => s.courtNumber === 1);
          const freeCourt = statuses3.find(s => s.courtNumber === 2);
          assert(wetCourt.status === 'wet' && wetCourt.selectable === false, 'Wet court has status "wet" and selectable false');
          assert(freeCourt.status === 'free' && freeCourt.selectable === true, 'Non-wet free court remains selectable');
          
          // Test 4: Blocked court has selectable === false and status 'blocked'
          const blockedData = {
            courts: [
              { current: undefined }, // Court 1: would be free but blocked
              { current: undefined }, // Court 2: free
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p1', name: 'Player 1' }] } }, // Court 3: occupied
              { current: { endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), players: [{ id: 'p2', name: 'Player 2' }] } }  // Court 4: occupied
            ]
          };
          const blocks = [{
            courtNumber: 1,
            startTime: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
            endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
            isWetCourt: false
          }];
          const statuses4 = Availability.getCourtStatuses({ data: blockedData, now: now, blocks: blocks, wetSet: new Set() });
          const blockedCourt = statuses4.find(s => s.courtNumber === 1);
          const freeCourt2 = statuses4.find(s => s.courtNumber === 2);
          assert(blockedCourt.status === 'blocked' && blockedCourt.selectable === false, 'Blocked court has status "blocked" and selectable false');
          assert(freeCourt2.status === 'free' && freeCourt2.selectable === true, 'Non-blocked free court remains selectable');
          
          console.groupEnd();
        }

      } catch (error) {
        console.error('❌ Error during self-tests:', error);
        failedTests++;
      }

      console.log(`\n📊 Self-Test Results:`);
      console.log(`   Total Tests: ${totalTests}`);
      console.log(`   ✅ Passed: ${passedTests}`);
      console.log(`   ❌ Failed: ${failedTests}`);
      console.log(`   Success Rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);
      
      console.groupEnd();
      
      return {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: totalTests > 0 ? (passedTests / totalTests) : 0
      };
    }
  };

  // Attach to window.Tennis
  window.Tennis.selfTest = selfTest;

})();