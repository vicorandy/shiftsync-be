const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const SchedulingService = require('../services/schedulingService');

// POST /api/swaps/request - Create a swap or drop request
router.post('/request', authenticate, authorize(['STAFF']), async (req, res) => {
  const { shiftId, type, accepterProfileId } = req.body; // type: SWAP or DROP
  const prisma = req.prisma;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({ where: { userId: req.user.userId } });
    
    // Check limit: 3 pending requests
    const pendingCount = await prisma.swapRequest.count({
      where: { requesterId: staffProfile.id, status: { in: ['PENDING_ACCEPTANCE', 'PENDING_APPROVAL'] } }
    });
    if (pendingCount >= 3) return res.status(400).json({ error: 'Max 3 pending swap/drop requests allowed' });

    const request = await prisma.swapRequest.create({
      data: {
        shiftId,
        requesterId: staffProfile.id,
        accepterId: accepterProfileId,
        type,
        status: type === 'DROP' ? 'PENDING_APPROVAL' : 'PENDING_ACCEPTANCE'
      }
    });

    // Notify relevant parties
    if (type === 'SWAP' && accepterProfileId) {
      const accepter = await prisma.staffProfile.findUnique({ where: { id: accepterProfileId }, include: { user: true } });
      const notification = await prisma.notification.create({
        data: { userId: accepter.userId, title: 'Shift Swap Request', message: `You have a new shift swap request from ${req.user.name}` }
      });
      req.io.to(`user_${accepter.userId}`).emit('notification', notification);
    }

    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ error: 'Request failed', details: error.message });
  }
});

// POST /api/swaps/:id/accept - Accept a swap request (Staff B)
router.post('/:id/accept', authenticate, authorize(['STAFF']), async (req, res) => {
  const requestId = req.params.id;
  const prisma = req.prisma;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({ where: { userId: req.user.userId } });
    const request = await prisma.swapRequest.findUnique({
      where: { id: requestId },
      include: { shift: true }
    });

    if (!request || request.accepterId !== staffProfile.id) return res.status(404).json({ error: 'Request not found or not for you' });

    // Validate that Staff B is qualified
    const schedulingService = new SchedulingService(prisma);
    const validation = await schedulingService.validateAssignment(staffProfile.id, request.shiftId);
    if (!validation.valid) return res.status(400).json({ error: 'You are not qualified or available for this shift', details: validation.errors });

    await prisma.swapRequest.update({
      where: { id: requestId },
      data: { status: 'PENDING_APPROVAL' }
    });

    // Notify Manager
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER', managedLocations: { some: { id: request.shift.locationId } } }
    });
    for (const manager of managers) {
      await prisma.notification.create({
        data: { userId: manager.id, title: 'Swap Approval Needed', message: 'A shift swap is waiting for your approval' }
      });
    }

    res.json({ message: 'Swap accepted, awaiting manager approval' });
  } catch (error) {
    res.status(400).json({ error: 'Acceptance failed', details: error.message });
  }
});

// POST /api/swaps/:id/approve - Approve/Reject (Manager/Admin)
router.post('/:id/approve', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  const requestId = req.params.id;
  const { action, comment } = req.body; // action: APPROVE or REJECT
  const prisma = req.prisma;

  try {
    const request = await prisma.swapRequest.findUnique({
      where: { id: requestId },
      include: { shift: true, requester: { include: { user: true } }, accepter: { include: { user: true } } }
    });

    if (action === 'APPROVE') {
      // 1. Remove original assignment
      await prisma.shiftAssignment.delete({
        where: { shiftId_staffProfileId: { shiftId: request.shiftId, staffProfileId: request.requesterId } }
      });

      // 2. Add new assignment if SWAP
      if (request.type === 'SWAP' && request.accepterId) {
        await prisma.shiftAssignment.create({
          data: { shiftId: request.shiftId, staffProfileId: request.accepterId }
        });
      }

      await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', managerComment: comment }
      });
      
      // Notify both
      [request.requester, request.accepter].forEach(async (p) => {
        if (p) {
          const n = await prisma.notification.create({
            data: { userId: p.userId, title: 'Shift Change Approved', message: `Your ${request.type} request was approved.` }
          });
          req.io.to(`user_${p.userId}`).emit('notification', n);
        }
      });

    } else {
      await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', managerComment: comment }
      });
    }

    res.json({ message: `Request ${action === 'APPROVE' ? 'approved' : 'rejected'}` });
  } catch (error) {
    res.status(400).json({ error: 'Action failed', details: error.message });
  }
});

module.exports = router;
