const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/skills
router.get('/', authenticate, async (req, res) => {
  try {
    const skills = await req.prisma.skill.findMany();
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// POST /api/skills - Admin only
router.post('/', authenticate, authorize(['ADMIN']), async (req, res) => {
  const { name } = req.body;
  try {
    const skill = await req.prisma.skill.create({ data: { name } });
    res.status(201).json(skill);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create skill' });
  }
});

module.exports = router;
