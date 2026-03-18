const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { DateTime } = require('luxon');

// GET /api/analytics/fairness - Multi-location distribution report
router.get('/fairness', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const { locationId, start, end } = req.query;
  const prisma = req.prisma;

  try {
    const shifts = await prisma.shift.findMany({
      where: {
        locationId,
        startTime: { gte: new Date(start) },
        endTime: { lte: new Date(end) }
      },
      include: { assignments: { include: { staffProfile: { include: { user: true } } } } }
    });

    const staffStats = {};

    shifts.forEach(shift => {
      const isPremium = shift.startTime.getDay() === 5 || shift.startTime.getDay() === 6; // Fri/Sat
      const hours = (shift.endTime - shift.startTime) / (1000 * 60 * 60);

      shift.assignments.forEach(assign => {
        const staffId = assign.staffProfileId;
        if (!staffStats[staffId]) {
          staffStats[staffId] = {
            name: assign.staffProfile.user.name,
            totalHours: 0,
            premiumShifts: 0,
            desiredHours: assign.staffProfile.desiredHoursPerWeek
          };
        }
        staffStats[staffId].totalHours += hours;
        if (isPremium) staffStats[staffId].premiumShifts += 1;
      });
    });

    res.json({
      locationId,
      period: { start, end },
      report: Object.values(staffStats)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// GET /api/analytics/on-duty - Live dashboard
router.get('/on-duty', authenticate, async (req, res) => {
  const prisma = req.prisma;
  const now = new Date();

  try {
    const activeAssignments = await prisma.shiftAssignment.findMany({
      where: {
        shift: {
          startTime: { lte: now },
          endTime: { gte: now }
        }
      },
      include: {
        shift: { include: { location: true } },
        staffProfile: { include: { user: true } }
      }
    });

    const report = activeAssignments.map(a => ({
      location: a.shift.location.name,
      staff: a.staffProfile.user.name,
      shiftEnd: a.shift.endTime
    }));

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch on-duty status' });
  }
});

// GET /api/analytics/compliance - Compliance health metrics
router.get('/compliance', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const { locationId, start, end } = req.query;
  const prisma = req.prisma;

  try {
    const shifts = await prisma.shift.findMany({
      where: {
        locationId,
        startTime: { gte: new Date(start) },
        endTime: { lte: new Date(end) }
      },
      include: { 
        assignments: { 
          include: { 
            staffProfile: { 
              include: { 
                assignments: { 
                  include: { shift: true } 
                } 
              } 
            } 
          } 
        } 
      }
    });

    let totalAssignedShifts = 0;
    let compliantRestShifts = 0;
    let nonOvertimeShifts = 0;
    
    const staffWeeklyHours = new Map(); // staffId -> { weekKey -> hours }
    const uniqueStaff = new Set();
    const staffUnderLimit = new Set();

    shifts.forEach(shift => {
      const shiftStart = DateTime.fromJSDate(shift.startTime);
      const shiftEnd = DateTime.fromJSDate(shift.endTime);
      const hours = shiftEnd.diff(shiftStart, 'hours').hours;

      shift.assignments.forEach(assign => {
        totalAssignedShifts++;
        const staff = assign.staffProfile;
        uniqueStaff.add(staff.id);

        // 1. Rest Rule (11 hours)
        const otherShifts = staff.assignments
          .map(a => a.shift)
          .filter(s => s.id !== shift.id);
        
        const isRestCompliant = !otherShifts.some(s => {
          const sStart = DateTime.fromJSDate(s.startTime);
          const sEnd = DateTime.fromJSDate(s.endTime);
          const diffAfter = shiftStart.diff(sEnd, 'hours').hours;
          const diffBefore = sStart.diff(shiftEnd, 'hours').hours;
          return (diffAfter >= 0 && diffAfter < 11) || (diffBefore >= 0 && diffBefore < 11);
        });
        if (isRestCompliant) compliantRestShifts++;

        // 2 & 3. Weekly Limit & Overtime Prevention
        const weekKey = shiftStart.startOf('week').toISODate();
        if (!staffWeeklyHours.has(staff.id)) staffWeeklyHours.set(staff.id, {});
        const staffWeeks = staffWeeklyHours.get(staff.id);
        if (!staffWeeks[weekKey]) staffWeeks[weekKey] = 0;
        
        // Check if this shift starts when they are already over 40 OR if it's the one that pushes them over
        if (staffWeeks[weekKey] + hours <= 40) {
          nonOvertimeShifts++;
        }
        staffWeeks[weekKey] += hours;
      });
    });

    // Calculate Weekly Limit Compliance (percentage of staff who stayed under 40 in all involved weeks)
    uniqueStaff.forEach(staffId => {
      const weeks = staffWeeklyHours.get(staffId);
      const allWeeksUnder = Object.values(weeks).every(h => h <= 40);
      if (allWeeksUnder) staffUnderLimit.add(staffId);
    });

    res.json({
      locationId,
      period: { start, end },
      metrics: {
        restRule: totalAssignedShifts ? Math.round((compliantRestShifts / totalAssignedShifts) * 100) : 100,
        weeklyLimit: uniqueStaff.size ? Math.round((staffUnderLimit.size / uniqueStaff.size) * 100) : 100,
        overtimePrevention: totalAssignedShifts ? Math.round((nonOvertimeShifts / totalAssignedShifts) * 100) : 100
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate compliance metrics', details: error.message });
  }
});

module.exports = router;
