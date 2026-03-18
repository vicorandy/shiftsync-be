const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const SchedulingService = require('../services/schedulingService');
const { DateTime } = require('luxon');

// GET /api/shifts - Get shifts for a location/date range
router.get('/', authenticate, async (req, res) => {
  const { locationId, start, end } = req.query;
  const prisma = req.prisma;

  try {
    const where = {
      startTime: { lt: new Date(end) },
      endTime: { gt: new Date(start) }
    };
    
    if (locationId) {
      where.locationId = locationId;
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        assignments: { include: { staffProfile: { include: { user: { select: { name: true } } } } } },
        skill: true,
        location: true
      }
    });
    console.log(`[Backend] GET /api/shifts`, { count: shifts.length, locationId, start, end });
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// GET /api/shifts/me - Get upcoming shifts for the current staff member
router.get('/me', authenticate, authorize(['STAFF']), async (req, res) => {
  const prisma = req.prisma;
  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId: req.user.userId }
    });

    if (!staffProfile) return res.status(404).json({ error: 'Staff profile not found' });

    const now = new Date();
    const shifts = await prisma.shift.findMany({
      where: {
        assignments: {
          some: {
            staffProfileId: staffProfile.id
          }
        },
        startTime: { gte: now }
      },
      include: {
        assignments: { include: { staffProfile: { include: { user: { select: { name: true } } } } } },
        skill: true,
        location: true
      },
      orderBy: { startTime: 'asc' }
    });
    console.log(`[Backend] GET /api/shifts/me for user ${req.user.userId}`, { 
      count: shifts.length,
      shifts: shifts.map(s => ({ id: s.id, start: s.startTime }))
    });
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch your shifts' });
  }
});


// POST /api/shifts - Create a shift (Manager/Admin)
router.post('/', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const { locationId, startTime, endTime, skillId, headcount } = req.body;
  const prisma = req.prisma;

  try {
    const shift = await prisma.shift.create({
      data: {
        locationId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        skillId,
        headcount: headcount || 1
      },
      include: { skill: true, location: true }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        shiftId: shift.id,
        action: 'CREATE_SHIFT',
        after: JSON.stringify(shift)
      }
    });
    res.status(201).json(shift);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create shift', details: error.message });
  }
});

// PUT /api/shifts/:id - Update shift
router.put('/:id', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const shiftId = req.params.id;
  const prisma = req.prisma;

  try {
    const originalShift = await prisma.shift.findUnique({ where: { id: shiftId } });
    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: req.body
    });

    // Requirement: Cancel pending swaps on edit
    const cancelledSwaps = await prisma.swapRequest.updateMany({
      where: { shiftId, status: { in: ['PENDING_ACCEPTANCE', 'PENDING_APPROVAL'] } },
      data: { status: 'CANCELLED' }
    });

    if (cancelledSwaps.count > 0) {
      // Notify requesters (simplified)
      const swaps = await prisma.swapRequest.findMany({ where: { shiftId, status: 'CANCELLED' } });
      for (const swap of swaps) {
        await prisma.notification.create({
          data: { userId: swap.requesterId, title: 'Swap Cancelled', message: 'The shift was modified by a manager, cancelling your swap request.' }
        });
      }
    }

    res.json(updatedShift);
  } catch (error) {
    res.status(400).json({ error: 'Update failed' });
  }
});

// POST /api/shifts/:id/assign - Assign staff to shift
router.post('/:id/assign', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const shiftId = req.params.id;
  const { staffProfileId } = req.body;
  const prisma = req.prisma;
  const schedulingService = new SchedulingService(prisma);

  try {
    const validation = await schedulingService.validateAssignment(staffProfileId, shiftId);
    if (!validation.valid) {
      const suggestions = await schedulingService.suggestStaff(shiftId);
      return res.status(400).json({ 
        error: 'Constraint violation', 
        details: validation.errors,
        suggestions 
      });
    }

    const assignment = await prisma.shiftAssignment.create({
      data: { shiftId, staffProfileId }
    });

    // Real-time notification if published
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (shift.isPublished) {
      const profile = await prisma.staffProfile.findUnique({ where: { id: staffProfileId }, include: { user: true } });
      req.io.to(`location_${shift.locationId}`).emit('shift_assigned', { shiftId, staffName: profile.user.name });
    }

    res.status(201).json(assignment);
  } catch (error) {
    res.status(400).json({ error: 'Assignment failed', details: error.message });
  }
});

// POST /api/shifts/publish - Publish shifts for a week
router.post('/publish', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const { locationId, start, end } = req.body;
  const prisma = req.prisma;

  try {
    await prisma.shift.updateMany({
      where: {
        locationId,
        startTime: { gte: new Date(start) },
        endTime: { lte: new Date(end) }
      },
      data: { isPublished: true }
    });

    req.io.to(`location_${locationId}`).emit('schedule_published', { locationId, start, end });
    res.json({ message: 'Schedule published successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to publish schedule' });
  }
});

module.exports = router;
