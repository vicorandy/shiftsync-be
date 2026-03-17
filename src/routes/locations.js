const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/locations - Admins see all, Managers see assigned
router.get('/', authenticate, async (req, res) => {
  const prisma = req.prisma;
  const { role, userId } = req.user;

  try {
    let locations;
    if (role === 'ADMIN') {
      locations = await prisma.location.findMany({
        include: { managers: { select: { id: true, name: true, email: true } } }
      });
    } else if (role === 'MANAGER') {
      locations = await prisma.location.findMany({
        where: { managers: { some: { id: userId } } },
        include: { managers: { select: { id: true, name: true, email: true } } }
      });
    } else {
      // Staff see locations they are certified for
      locations = await prisma.location.findMany({
        where: { staff: { some: { userId: userId } } }
      });
    }
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch locations', details: error.message });
  }
});

// POST /api/locations - Admin only
router.post('/', authenticate, authorize(['ADMIN']), async (req, res) => {
  const { name, timezone } = req.body;
  const prisma = req.prisma;

  try {
    const location = await prisma.location.create({
      data: { name, timezone }
    });
    res.status(201).json(location);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create location', details: error.message });
  }
});

module.exports = router;
