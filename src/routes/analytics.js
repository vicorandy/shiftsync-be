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

module.exports = router;
