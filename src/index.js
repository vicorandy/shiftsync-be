const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join_location', (locationId) => {
    socket.join(`location_${locationId}`);
    console.log(`User ${socket.id} joined location_${locationId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Middleware to inject prisma and io into requests
app.use((req, res, next) => {
  req.prisma = prisma;
  req.io = io;
  next();
});

// Basic route
app.get('/', (req, res) => {
  res.send('ShiftSync API is running');
});

// Route imports
const authRoutes = require('./routes/auth');
const shiftRoutes = require('./routes/shifts');
const locationRoutes = require('./routes/locations');
const skillRoutes = require('./routes/skills');
const staffRoutes = require('./routes/staff');
const swapRoutes = require('./routes/swaps');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/swaps', swapRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
