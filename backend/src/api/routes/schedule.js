const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

// Today's schedule
router.get('/today', roleCheck('admin', 'teacher', 'receptionist'), async (req, res) => {
  const today = moment().tz(TZ).startOf('day').toDate();
  const todayEnd = moment().tz(TZ).endOf('day').toDate();

  const where = { lessonDate: { gte: today, lte: todayEnd } };
  if (req.user.role === 'teacher') {
    where.group = { teacherId: req.user.id };
  }

  const schedules = await prisma.schedule.findMany({
    where,
    include: {
      group: {
        include: {
          subject: true,
          teacher: { select: { firstName: true, lastName: true } },
          _count: { select: { groupStudents: { where: { status: 'active' } } } }
        }
      }
    },
    orderBy: { startTime: 'asc' }
  });
  res.json(schedules);
});

// Weekly schedule (Mon-Sun)
router.get('/week', roleCheck('admin', 'teacher', 'receptionist'), async (req, res) => {
  const startOfWeek = moment().tz(TZ).startOf('isoWeek').toDate();
  const endOfWeek = moment().tz(TZ).endOf('isoWeek').toDate();

  const where = { lessonDate: { gte: startOfWeek, lte: endOfWeek } };
  if (req.user.role === 'teacher') {
    where.group = { teacherId: req.user.id };
  }

  const schedules = await prisma.schedule.findMany({
    where,
    include: {
      group: { include: { subject: true, teacher: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: [{ lessonDate: 'asc' }, { startTime: 'asc' }]
  });

  // Group by day
  const byDay = {};
  const days = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  for (let i = 0; i < 7; i++) {
    const d = moment(startOfWeek).add(i, 'days');
    byDay[d.format('YYYY-MM-DD')] = { day: days[i], date: d.format('YYYY-MM-DD'), schedules: [] };
  }
  schedules.forEach(s => {
    const key = moment(s.lessonDate).format('YYYY-MM-DD');
    if (byDay[key]) byDay[key].schedules.push(s);
  });

  res.json(Object.values(byDay));
});

// Group schedule
router.get('/group/:groupId', roleCheck('admin', 'teacher'), async (req, res) => {
  const { month } = req.query;
  const where = { groupId: parseInt(req.params.groupId) };
  if (month) {
    const [y, m] = month.split('-').map(Number);
    where.lessonDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }
  const s = await prisma.schedule.findMany({ where, orderBy: { lessonDate: 'asc' } });
  res.json(s);
});

// Today for specific group
router.get('/today/:groupId', roleCheck('teacher'), async (req, res) => {
  const today = moment().tz(TZ).startOf('day').toDate();
  const todayEnd = moment().tz(TZ).endOf('day').toDate();
  const schedule = await prisma.schedule.findFirst({
    where: { groupId: parseInt(req.params.groupId), lessonDate: { gte: today, lte: todayEnd } }
  });
  res.json(schedule ? { hasLesson: true, schedule } : { hasLesson: false });
});

router.post('/group/:groupId', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { dates, startTime, endTime } = req.body;
    const today = moment().tz(TZ).startOf('day').toDate();
    const groupId = parseInt(req.params.groupId);

    const invalid = dates.filter(d => new Date(d) < today);
    if (invalid.length) return res.status(400).json({ error: `O'tgan kunlarga ruxsat yo'q: ${invalid.join(', ')}` });

    const ops = dates.map(date => prisma.schedule.upsert({
      where: { groupId_lessonDate: { groupId, lessonDate: new Date(date) } },
      update: { startTime, endTime },
      create: { groupId, lessonDate: new Date(date), startTime, endTime }
    }));
    await prisma.$transaction(ops);
    res.json({ success: true, count: dates.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', roleCheck('admin'), async (req, res) => {
  await prisma.schedule.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

module.exports = router;
