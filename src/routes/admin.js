const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/notifications - Get user's notifications
router.get('/', authenticate, async (req, res) => {
  const prisma = req.prisma;
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id/read - Mark as read
router.patch('/:id/read', authenticate, async (req, res) => {
  const prisma = req.prisma;
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id, userId: req.user.userId },
      data: { isRead: true }
    });
    res.json(notification);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update notification' });
  }
});

// GET /api/audit - Admin/Manager view audit logs
router.get('/audit', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const { shiftId, locationId, userId } = req.query;
  const prisma = req.prisma;

  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        shiftId: shiftId || undefined,
        shift: locationId ? { locationId } : undefined,
        userId: userId || undefined
      },
      include: { user: { select: { name: true } }, shift: true },
      orderBy: { timestamp: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
