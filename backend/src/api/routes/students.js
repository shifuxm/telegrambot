const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

// All students list
router.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { search } = req.query;
  const where = { groupStudents: { some: { status: 'active' } } };
  const applicantWhere = {};
  if (search) applicantWhere.OR = [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } }
  ];

  const students = await prisma.student.findMany({
    where: {
      ...where,
      applicant: Object.keys(applicantWhere).length ? applicantWhere : undefined
    },
    include: {
      applicant: true,
      groupStudents: {
        where: { status: 'active' },
        include: { group: { include: { subject: true } } }
      }
    },
    orderBy: { applicant: { firstName: 'asc' } }
  });
  res.json(students);
});

// Student profile - groups, attendance, payments
router.get('/:id/profile', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        applicant: true,
        groupStudents: {
          include: {
            group: { include: { subject: true } },
          }
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { group: { include: { subject: true } } }
        }
      }
    });

    if (!student) return res.status(404).json({ error: 'O\'quvchi topilmadi' });

    // Attendance stats for last 3 months
    const now = moment().tz(TZ);
    const attendanceStats = [];
    for (let i = 2; i >= 0; i--) {
      const monthMoment = now.clone().subtract(i, 'months');
      const monthStart = monthMoment.clone().startOf('month').toDate();
      const monthEnd = monthMoment.clone().endOf('month').toDate();

      const schedules = await prisma.schedule.findMany({
        where: {
          lessonDate: { gte: monthStart, lte: monthEnd },
          group: { groupStudents: { some: { studentId, status: 'active' } } }
        }
      });

      const totalLessons = schedules.length;
      const presentCount = totalLessons > 0 ? await prisma.attendance.count({
        where: {
          scheduleId: { in: schedules.map(s => s.id) },
          groupStudent: { studentId },
          isPresent: true
        }
      }) : 0;

      // Kelmagan kunlar
      const absentAttendances = totalLessons > 0 ? await prisma.attendance.findMany({
        where: {
          scheduleId: { in: schedules.map(s => s.id) },
          groupStudent: { studentId },
          isPresent: false
        },
        include: { schedule: { select: { lessonDate: true } } }
      }) : [];
      const absentList = absentAttendances.map(a => {
        const d = new Date(a.schedule.lessonDate);
        return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0');
      });

      attendanceStats.push({
        month: monthMoment.format('YYYY-MM'),
        monthLabel: monthMoment.format('MMMM YYYY'),
        total: totalLessons,
        present: presentCount,
        absent: totalLessons - presentCount,
        percent: totalLessons > 0 ? Math.round((presentCount / totalLessons) * 100) : 0,
        absentList
      });
    }

    res.json({
      ...student,
      attendanceStats
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { firstName, lastName, phoneSelf, phoneFather, phoneMother } = req.body;
  const st = await prisma.student.findUnique({ where: { id: parseInt(req.params.id) }, select: { applicantId: true } });
  if (!st) return res.status(404).json({ error: 'Topilmadi' });
  const updated = await prisma.applicant.update({
    where: { id: st.applicantId },
    data: { firstName, lastName, phoneSelf, phoneFather, phoneMother }
  });
  res.json(updated);
});

// Add to new group (without removing from current)
router.post('/:id/groups', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { groupId } = req.body;
    const studentId = parseInt(req.params.id);
    await prisma.groupStudent.upsert({
      where: { groupId_studentId: { groupId: parseInt(groupId), studentId } },
      update: { status: 'active' },
      create: { groupId: parseInt(groupId), studentId }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:studentId/groups/:groupId', roleCheck('admin', 'receptionist'), async (req, res) => {
  await prisma.groupStudent.update({
    where: { groupId_studentId: { groupId: parseInt(req.params.groupId), studentId: parseInt(req.params.studentId) } },
    data: { status: 'archived' }
  });
  res.json({ success: true });
});

router.put('/:studentId/groups/:groupId/move', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { newGroupId } = req.body;
  await prisma.$transaction([
    prisma.groupStudent.update({
      where: { groupId_studentId: { groupId: parseInt(req.params.groupId), studentId: parseInt(req.params.studentId) } },
      data: { status: 'archived' }
    }),
    prisma.groupStudent.upsert({
      where: { groupId_studentId: { groupId: parseInt(newGroupId), studentId: parseInt(req.params.studentId) } },
      update: { status: 'active' },
      create: { groupId: parseInt(newGroupId), studentId: parseInt(req.params.studentId) }
    })
  ]);
  res.json({ success: true });
});

router.delete('/:id', roleCheck('admin'), async (req, res) => {
  const { action } = req.query;
  if (action === 'archive') {
    await prisma.groupStudent.updateMany({ where: { studentId: parseInt(req.params.id) }, data: { status: 'archived' } });
  } else {
    await prisma.student.delete({ where: { id: parseInt(req.params.id) } });
  }
  res.json({ success: true });
});

module.exports = router;
