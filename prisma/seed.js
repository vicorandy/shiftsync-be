const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Clear existing data (in reverse order of dependencies)
  console.log('Clearing existing data...');
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.swapRequest.deleteMany({});
  await prisma.shiftAssignment.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.availability.deleteMany({});
  await prisma.staffProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.skill.deleteMany({});

  // 1. Create Skills
  console.log('Creating skills...');
  const cashier = await prisma.skill.upsert({
    where: { name: 'Cashier' },
    update: {},
    create: { name: 'Cashier' },
  });

  const barista = await prisma.skill.upsert({
    where: { name: 'Barista' },
    update: {},
    create: { name: 'Barista' },
  });

  // 2. Create Locations
  console.log('Creating locations...');
  const downtown = await prisma.location.create({
    data: {
      name: 'Downtown Café',
      timezone: 'Europe/London',
    },
  });

  const uptown = await prisma.location.create({
    data: {
      name: 'Uptown Bistro',
      timezone: 'Europe/London',
    },
  });

  // 3. Create Admin
  console.log('Creating admin...');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@shiftsync.com' },
    update: {},
    create: {
      email: 'admin@shiftsync.com',
      password: hashedPassword,
      name: 'Main Admin',
      role: 'ADMIN',
    },
  });

  // 4. Create Manager
  console.log('Creating manager...');
  const manager = await prisma.user.upsert({
    where: { email: 'manager@shiftsync.com' },
    update: {},
    create: {
      email: 'manager@shiftsync.com',
      password: hashedPassword,
      name: 'Jane Manager',
      role: 'MANAGER',
      managedLocations: {
        connect: [{ id: downtown.id }]
      }
    },
  });

  // 5. Create Staff
  console.log('Creating staff...');
  const staff1 = await prisma.user.upsert({
    where: { email: 'staff1@shiftsync.com' },
    update: {},
    create: {
      email: 'staff1@shiftsync.com',
      password: hashedPassword,
      name: 'John Staff',
      role: 'STAFF',
      staffProfile: {
        create: {
          desiredHoursPerWeek: 20
        }
      }
    },
    include: { staffProfile: true }
  });

  const staff2 = await prisma.user.upsert({
    where: { email: 'staff2@shiftsync.com' },
    update: {},
    create: {
      email: 'staff2@shiftsync.com',
      password: hashedPassword,
      name: 'Alice Staff',
      role: 'STAFF',
      staffProfile: {
        create: {
          desiredHoursPerWeek: 30
        }
      }
    },
    include: { staffProfile: true }
  });

  // Connect staff to locations and skills
  await prisma.staffProfile.update({
    where: { id: staff1.staffProfile.id },
    data: {
      skills: { connect: [{ id: cashier.id }] },
      locations: { connect: [{ id: downtown.id }] }
    }
  });

  await prisma.staffProfile.update({
    where: { id: staff2.staffProfile.id },
    data: {
      skills: { connect: [{ id: barista.id }] },
      locations: { connect: [{ id: downtown.id }, { id: uptown.id }] }
    }
  });

  // 6. Create Availability
  console.log('Creating availability...');
  // Staff 1 is available Mon-Fri, 9-5
  for (let day = 1; day <= 5; day++) {
    await prisma.availability.create({
      data: {
        staffProfileId: staff1.staffProfile.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00'
      }
    });
  }

  // Staff 2 is available Mon, Wed, Fri from 10-6
  for (let day of [1, 3, 5]) {
    await prisma.availability.create({
      data: {
        staffProfileId: staff2.staffProfile.id,
        dayOfWeek: day,
        startTime: '10:00',
        endTime: '18:00'
      }
    });
  }

  // 7. Create Shifts (Next 7 days + Past 7 days)
  console.log('Creating shifts and assignments...');
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const pastWeek = new Date();
  pastWeek.setDate(pastWeek.getDate() - 7);
  pastWeek.setHours(9, 0, 0, 0);

  const downtownShifts = [];
  const uptownShifts = [];
  const pastShifts = [];

  // Upcoming Downtown
  for (let i = 0; i < 7; i++) {
    const shiftDate = new Date(tomorrow);
    shiftDate.setDate(shiftDate.getDate() + i);
    const shift = await prisma.shift.create({
      data: {
        locationId: downtown.id,
        skillId: cashier.id,
        startTime: new Date(shiftDate),
        endTime: new Date(shiftDate.getTime() + 8 * 60 * 60 * 1000),
        headcount: 1,
        isPublished: true
      }
    });
    downtownShifts.push(shift);
    if (i < 3) {
      await prisma.shiftAssignment.create({
        data: { shiftId: shift.id, staffProfileId: staff1.staffProfile.id }
      });
    }
  }

  // Upcoming Uptown
  for (let i = 0; i < 5; i++) {
    const shiftDate = new Date(tomorrow);
    shiftDate.setDate(shiftDate.getDate() + i);
    const shift = await prisma.shift.create({
      data: {
        locationId: uptown.id,
        skillId: barista.id,
        startTime: new Date(shiftDate),
        endTime: new Date(shiftDate.getTime() + 6 * 60 * 60 * 1000),
        headcount: 1,
        isPublished: true
      }
    });
    uptownShifts.push(shift);
    if (i < 2) {
      await prisma.shiftAssignment.create({
        data: { shiftId: shift.id, staffProfileId: staff2.staffProfile.id }
      });
    }
  }

  // Past Shifts
  for (let i = 0; i < 7; i++) {
    const shiftDate = new Date(pastWeek);
    shiftDate.setDate(shiftDate.getDate() + i);
    const shift = await prisma.shift.create({
      data: {
        locationId: downtown.id,
        skillId: cashier.id,
        startTime: new Date(shiftDate),
        endTime: new Date(shiftDate.getTime() + 8 * 60 * 60 * 1000),
        headcount: 1,
        isPublished: true
      }
    });
    pastShifts.push(shift);
  }

  // 8. Create Swap Requests
  console.log('Creating swap requests...');
  // Pending Swap
  await prisma.swapRequest.create({
    data: {
      shiftId: downtownShifts[0].id,
      requesterId: staff1.staffProfile.id,
      status: 'PENDING_ACCEPTANCE',
      type: 'SWAP',
    }
  });

  // Pending Approval
  await prisma.swapRequest.create({
    data: {
      shiftId: downtownShifts[1].id,
      requesterId: staff1.staffProfile.id,
      accepterId: staff2.staffProfile.id,
      status: 'PENDING_APPROVAL',
      type: 'SWAP',
    }
  });

  // Approved/Completed Swap
  await prisma.swapRequest.create({
    data: {
      shiftId: pastShifts[0].id,
      requesterId: staff1.staffProfile.id,
      accepterId: staff2.staffProfile.id,
      status: 'APPROVED',
      type: 'SWAP',
    }
  });

  // Rejected Swap
  await prisma.swapRequest.create({
    data: {
      shiftId: downtownShifts[2].id,
      requesterId: staff2.staffProfile.id,
      status: 'REJECTED',
      type: 'SWAP',
      managerComment: 'Minimum staffing level must be maintained.'
    }
  });

  // 9. Create Notifications
  console.log('Creating notifications...');
  await prisma.notification.create({
    data: {
      userId: staff1.id,
      title: 'Swap Request Update',
      message: 'Your swap request for the Downtown Café shift has been approved.'
    }
  });

  await prisma.notification.create({
    data: {
      userId: staff2.id,
      title: 'New Shift Available',
      message: 'A new Barista shift is available at Uptown Bistro.'
    }
  });

  // 10. Audit Logs
  console.log('Creating audit logs...');
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SYSTEM_INITIALIZATION',
      after: 'Database seeded with sample data.'
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: manager.id,
      shiftId: downtownShifts[0].id,
      action: 'SHIFT_MODIFIED',
      before: 'Unpublished',
      after: 'Published'
    }
  });

  console.log('Database seeded successfully!');
  console.log('Credentials:');
  console.log('- Admin: admin@shiftsync.com / password123');
  console.log('- Manager: manager@shiftsync.com / password123');
  console.log('- Staff 1: staff1@shiftsync.com / password123');
  console.log('- Staff 2: staff2@shiftsync.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
