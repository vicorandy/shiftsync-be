const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/staff - List all staff profiles (ADMIN/MANAGER/STAFF)
router.get('/', authenticate, authorize(['ADMIN', 'MANAGER', 'STAFF']), async (req, res) => {
  const prisma = req.prisma;
  try {
    const staff = await prisma.staffProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        skills: true,
        locations: true
      }
    });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch staff list' });
  }
});

// GET /api/staff/me - Get current staff profile
router.get('/me', authenticate, async (req, res) => {
  const prisma = req.prisma;
  try {
    const profile = await prisma.staffProfile.findUnique({
      where: { userId: req.user.userId },
      include: {
        skills: true,
        locations: true,
        availabilities: true
      }
    });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// POST /api/staff/availability - Manage availability
router.post('/availability', authenticate, async (req, res) => {
  const { dayOfWeek, startTime, endTime, startDate, endDate, isRecurring } = req.body;
  const prisma = req.prisma;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId: req.user.userId }
    });

    if (!staffProfile) return res.status(404).json({ error: 'Staff profile not found' });

    const availability = await prisma.availability.create({
      data: {
        staffProfileId: staffProfile.id,
        dayOfWeek,
        startTime,
        endTime,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isRecurring: isRecurring ?? true
      }
    });

    res.status(201).json(availability);
  } catch (error) {
    res.status(400).json({ error: 'Failed to set availability', details: error.message });
  }
});

// POST /api/staff/:id/certify - Manager/Admin certify staff for skill/location
router.post('/:id/certify', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const { skillIds, locationIds } = req.body;
  const staffProfileId = req.params.id;
  const prisma = req.prisma;

  try {
    const updateData = {};
    if (skillIds) {
      updateData.skills = { set: skillIds.map(id => ({ id })) };
    }
    if (locationIds) {
      updateData.locations = { set: locationIds.map(id => ({ id })) };
    }

    const profile = await prisma.staffProfile.update({
      where: { id: staffProfileId },
      data: updateData,
      include: { skills: true, locations: true }
    });

    res.json(profile);
  } catch (error) {
    res.status(400).json({ error: 'Failed to certify staff', details: error.message });
  }
});

module.exports = router;
