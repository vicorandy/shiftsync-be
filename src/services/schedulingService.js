const { DateTime } = require('luxon');

class SchedulingService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async validateAssignment(staffProfileId, shiftId) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { location: true, skill: true }
    });

    const staffProfile = await this.prisma.staffProfile.findUnique({
      where: { id: staffProfileId },
      include: {
        user: true,
        skills: true,
        locations: true,
        availabilities: true,
        assignments: {
          include: { shift: true }
        }
      }
    });

    if (!shift || !staffProfile) {
      throw new Error('Shift or Staff Profile not found');
    }

    const errors = [];

    // 1. Skill match
    const hasSkill = staffProfile.skills.some(s => s.id === shift.skillId);
    if (!hasSkill) {
      errors.push(`Staff ${staffProfile.user.name} does not have the required skill: ${shift.skill.name}`);
    }

    // 2. Location certification
    const isCertified = staffProfile.locations.some(l => l.id === shift.locationId);
    if (!isCertified) {
      errors.push(`Staff ${staffProfile.user.name} is not certified to work at ${shift.location.name}`);
    }

    // 3. Double-booking (overlapping shifts)
    const newShiftStart = DateTime.fromJSDate(shift.startTime);
    const newShiftEnd = DateTime.fromJSDate(shift.endTime);

    const overlapping = staffProfile.assignments.find(a => {
      const existingStart = DateTime.fromJSDate(a.shift.startTime);
      const existingEnd = DateTime.fromJSDate(a.shift.endTime);
      return (newShiftStart < existingEnd && newShiftEnd > existingStart);
    });

    if (overlapping) {
      errors.push(`Staff ${staffProfile.user.name} is already booked for an overlapping shift: ${overlapping.shift.startTime.toISOString()} to ${overlapping.shift.endTime.toISOString()}`);
    }

    // 4. 10-hour rest rule
    const tooClose = staffProfile.assignments.find(a => {
      const existingStart = DateTime.fromJSDate(a.shift.startTime);
      const existingEnd = DateTime.fromJSDate(a.shift.endTime);
      
      const diffAfter = newShiftStart.diff(existingEnd, 'hours').hours;
      const diffBefore = existingStart.diff(newShiftEnd, 'hours').hours;
      
      return (diffAfter >= 0 && diffAfter < 10) || (diffBefore >= 0 && diffBefore < 10);
    });

    if (tooClose) {
      errors.push(`Staff must have at least 10 hours of rest between shifts. Overlap found with shift at ${tooClose.shift.startTime.toISOString()}`);
    }

    // 5. Availability
    const isAvailable = this.checkAvailability(staffProfile, shift);
    if (!isAvailable) {
      errors.push(`Staff ${staffProfile.user.name} is not available during the requested shift time`);
    }

    // 6. Overtime & Compliance
    const compliance = await this.checkCompliance(staffProfile, shift);
    errors.push(...compliance.errors);

    return {
      valid: errors.length === 0,
      warnings: compliance.warnings,
      errors
    };
  }

  async checkCompliance(staffProfile, shift) {
    const shiftStart = DateTime.fromJSDate(shift.startTime);
    const shiftEnd = DateTime.fromJSDate(shift.endTime);
    const shiftHours = shiftEnd.diff(shiftStart, 'hours').hours;

    const warnings = [];
    const errors = [];

    // All assignments for the relevant week (Monday start)
    const weekStart = shiftStart.startOf('week');
    const weekEnd = weekStart.endOf('week');
    
    const weekAssignments = staffProfile.assignments.filter(a => {
      const start = DateTime.fromJSDate(a.shift.startTime);
      return start >= weekStart && start <= weekEnd;
    });

    // Weekly hours
    const weeklyHours = weekAssignments.reduce((sum, a) => {
      const s = DateTime.fromJSDate(a.shift.startTime);
      const e = DateTime.fromJSDate(a.shift.endTime);
      return sum + e.diff(s, 'hours').hours;
    }, 0) + shiftHours;

    if (weeklyHours >= 40) {
      warnings.push(`Weekly hours will reach ${weeklyHours.toFixed(1)} (Overtime)`);
    } else if (weeklyHours >= 35) {
      warnings.push(`Weekly hours approaching 40 (${weeklyHours.toFixed(1)} so far)`);
    }

    // Daily hours
    const dayAssignments = weekAssignments.filter(a => {
      return DateTime.fromJSDate(a.shift.startTime).hasSame(shiftStart, 'day');
    });
    const dailyHours = dayAssignments.reduce((sum, a) => {
      const s = DateTime.fromJSDate(a.shift.startTime);
      const e = DateTime.fromJSDate(a.shift.endTime);
      return sum + e.diff(s, 'hours').hours;
    }, 0) + shiftHours;

    if (dailyHours > 12) {
      errors.push(`Daily hours cannot exceed 12 (Projected: ${dailyHours.toFixed(1)})`);
    } else if (dailyHours > 8) {
      warnings.push(`Daily hours exceeding 8 (Projected: ${dailyHours.toFixed(1)})`);
    }

    // Consecutive days
    const workedDays = new Set(weekAssignments.map(a => DateTime.fromJSDate(a.shift.startTime).toISODate()));
    workedDays.add(shiftStart.toISODate());
    
    if (workedDays.size === 7) {
      warnings.push('7th consecutive day worked in a week (Requires manager override)');
    } else if (workedDays.size === 6) {
      warnings.push('6th consecutive day worked in a week');
    }

    return { warnings, errors };
  }

  checkAvailability(staffProfile, shift) {
    const shiftStart = DateTime.fromJSDate(shift.startTime);
    const shiftEnd = DateTime.fromJSDate(shift.endTime);
    const shiftDay = shiftStart.weekday % 7; // Convert to 0-6 (Sunday is 0 in Luxon weekday is 1-7, Mon-Sun)
    // Actually Luxon weekday is 1-7 (Mon-Sun). My schema used 0-6.
    const schemaDay = (shiftStart.weekday === 7) ? 0 : shiftStart.weekday;

    // Check one-off exceptions first
    const exceptions = staffProfile.availabilities.filter(a => !a.isRecurring);
    for (const ex of exceptions) {
      const exStart = DateTime.fromJSDate(ex.startDate);
      const exEnd = DateTime.fromJSDate(ex.endDate);
      if (shiftStart >= exStart && shiftEnd <= exEnd) return true;
    }

    // Check recurring
    const recurring = staffProfile.availabilities.find(a => a.isRecurring && a.dayOfWeek === schemaDay);
    if (recurring) {
      const [startH, startM] = recurring.startTime.split(':');
      const [endH, endM] = recurring.endTime.split(':');
      
      const availStart = shiftStart.set({ hour: parseInt(startH), minute: parseInt(startM) });
      let availEnd = shiftStart.set({ hour: parseInt(endH), minute: parseInt(endM) });
      
      if (availEnd < availStart) availEnd = availEnd.plus({ days: 1 }); // Overnight availability

      return shiftStart >= availStart && shiftEnd <= availEnd;
    }

    return false;
  }

  async suggestStaff(shiftId) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { location: true, skill: true }
    });

    const potentialStaff = await this.prisma.staffProfile.findMany({
      where: {
        skills: { some: { id: shift.skillId } },
        locations: { some: { id: shift.locationId } }
      },
      include: { user: true }
    });

    const suggestions = [];
    for (const staff of potentialStaff) {
      const validation = await this.validateAssignment(staff.id, shiftId);
      if (validation.valid) {
        suggestions.push({
          id: staff.id,
          name: staff.user.name
        });
      }
    }

    return suggestions;
  }
}

module.exports = SchedulingService;
