const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/auth/register - Seed/Register users
router.post('/register', async (req, res) => {
  const { email, password, name, role } = req.body;
  const prisma = req.prisma;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role, // ADMIN, MANAGER, STAFF
      },
    });

    // If STAFF, create staff profile
    if (role === 'STAFF') {
      await prisma.staffProfile.create({
        data: {
          userId: user.id
        }
      });
    }

    res.status(201).json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    res.status(400).json({ error: 'User registration failed', details: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const prisma = req.prisma;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { staffProfile: true }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, staffProfileId: user.staffProfile?.id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffProfileId: user.staffProfile?.id
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

module.exports = router;
