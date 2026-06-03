// backend/src/api/routes/students.js
// 7-modul: arxivlashda narx muhrlash, to'g'ridan o'chirishni bloklash,
// to'lov qidiruvida arxivlanganlar ham chiqishi

const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

// ── Pricing helpers ─────────────────────────────────────────────────────────
async function getStudentGroupPrice(studentId, groupId, monthYear) {
  const key = `price:${studentId}:${groupId}:${monthYear}`;
  const setting = await prisma.settings.findUnique({ where: { key } });
  if (setting) return parseInt(setting.value);
  const all = await prisma.settings.findMany({
    where: { key: { startsWith: `price:${studentId}:${groupId}:` } }
  });
  const prev = all
    .map(s => { const parts = s.key.split(':'); return { month: parts[3], amount: parseInt(s.value) }; })
    .filter(p => p.month < monthYear)
    .sort((a, b) => b.month.localeCompare(a.month));
  return prev.length > 0 ? prev[0].amount : null;
}

// Narxni joriy oy uchun muhrlaymiz (arxivlashda chaqiriladi)
// Qaytaradi: { key, price } | null
async function lockPriceSnapshot(studentId, groupId) {
  const now = moment().tz(TZ);
  const monthYear = now.format('YYYY-MM');
  const key = `price:${studentId}:${groupId}:${monthYear}`;

  // Allaqachon muhrlangan?
  const existing = await prisma.settings.findUnique({ where: { key } });
  if (existing) return { key, price: parseInt(existing.value) };

  // Carry-forward dan topamiz
  const all = await prisma.settings.findMany({
    where: { key: { startsWith: `price:${studentId}:${groupId}:` } }
  });
  const prev = all
    .map(s => { const parts = s.key.split(':'); return { month: parts[3], amount: parseInt(s.value) }; })
    .filter(p => p.month <= monthYear)
    .sort((a, b) => b.month.localeCompare(a.month));

  if (prev.length === 0) return null;

  const price = prev[0].amount;
  // Joriy oy uchun muhrlaymiz
  await prisma.settings.upsert({
    where: { key },
    update: { value: String(price) },
    create: { key, value: String(price) }
  });
  return { key, price };
}

// ── Balans hisoblash ───────────────────────────────────────────────────────
async function computeStudentBalance(studentId) {
  const now = moment().tz(TZ);
  const currentMonth = now.format('YYYY-MM');

  const payments = await prisma.payment.findMany({
    where: { studentId },
    include: { group: { include: { subject: { select: { name: true } } } } }
  });

  // Faqat haqiqiy to'lovlar (auto_deduction emas)
  const realPayments = payments.filter(p => p.note !== 'auto_deduction');
  const totalPaid = realPayments.reduce((s, p) => s + Number(p.amount), 0);

  const groupStudents = await prisma.groupStudent.findMany({
    where: { studentId },
    include: { group: { include: { subject: { select: { name: true } } } } }
  });

  let totalCharged = 0;
  const groupDetails = [];

  for (const gs of groupStudents) {
    const gid = gs.groupId;
    const enrolledAt = gs.joinedAt;

    const months = [];
    const start = moment(enrolledAt).format('YYYY-MM');
    let cur = moment(start, 'YYYY-MM');
    // Faol bo'lsa joriy oygacha, arxivlangan bo'lsa arxivlangan oygacha
    const endMonth = gs.status === 'active' ? currentMonth : moment(gs.updatedAt || gs.joinedAt).format('YYYY-MM');
    while (cur.format('YYYY-MM') <= endMonth) {
      months.push(cur.format('YYYY-MM'));
      cur.add(1, 'month');
    }

    let groupCharged = 0;
    const monthDetails = [];

    for (const m of months) {
      const price = await getStudentGroupPrice(studentId, gid, m);
      if (price) {
        groupCharged += price;
        const monthPayments = realPayments.filter(p => p.groupId === gid && p.monthYear === m);
        const monthPaid = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
        monthDetails.push({ month: m, price, paid: monthPaid, diff: monthPaid - price });
      }
    }
    totalCharged += groupCharged;

    const currentPrice = gs.status === 'active'
      ? await getStudentGroupPrice(studentId, gid, currentMonth)
      : null;
    const currentMonthPayments = realPayments.filter(p => p.groupId === gid && p.monthYear === currentMonth);
    const currentMonthPaid = currentMonthPayments.reduce((s, p) => s + Number(p.amount), 0);

    groupDetails.push({
      groupId: gid,
      groupName: gs.group.name,
      subjectName: gs.group.subject.name,
      status: gs.status,
      currentMonthPrice: currentPrice,
      currentMonthPaid,
      monthDetails
    });
  }

  return {
    totalPaid,
    totalCharged,
    balance: totalPaid - totalCharged,
    currentMonth,
    groupDetails
  };
}

// ════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════

// GET /students — faol o'quvchilar
router.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { search } = req.query;
  const applicantWhere = search ? {
    OR: [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } }
    ]
  } : {};

  const students = await prisma.student.findMany({
    where: {
      groupStudents: { some: { status: 'active' } },
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

// GET /students/search-with-balance — qidiruv + balans (arxivlanganlar ham)
router.get('/search-with-balance', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    // Barcha o'quvchilar (faol ham, arxivlangan ham)
    const students = await prisma.student.findMany({
      where: {
        applicant: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } }
          ]
        }
      },
      include: {
        applicant: { select: { firstName: true, lastName: true, phoneSelf: true, phoneFather: true } },
        groupStudents: {
          include: { group: { include: { subject: { select: { name: true } } } } }
        }
      },
      take: 15
    });

    const result = await Promise.all(students.map(async s => {
      const bal = await computeStudentBalance(s.id);
      const activeGroups = s.groupStudents.filter(gs => gs.status === 'active');
      const archivedGroups = s.groupStudents.filter(gs => gs.status === 'archived');
      return {
        id: s.id,
        firstName: s.applicant.firstName,
        lastName: s.applicant.lastName,
        phone: s.applicant.phoneSelf || s.applicant.phoneFather || null,
        isArchived: activeGroups.length === 0,
        groups: s.groupStudents.map(gs => ({
          groupId: gs.groupId,
          groupName: gs.group.name,
          subjectName: gs.group.subject.name,
          status: gs.status
        })),
        activeGroups: activeGroups.map(gs => ({
          groupId: gs.groupId,
          groupName: gs.group.name,
          subjectName: gs.group.subject.name
        })),
        balance: bal.balance,
        totalPaid: bal.totalPaid,
        totalCharged: bal.totalCharged,
        groupDetails: bal.groupDetails
      };
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /students/:id/balance
router.get('/:id/balance', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const result = await computeStudentBalance(studentId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /students/:id/price-history — Narx tarixi (profil uchun)
router.get('/:id/price-history', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    // O'quvchining barcha guruhlari (faol + arxiv)
    const groupStudents = await prisma.groupStudent.findMany({
      where: { studentId },
      include: { group: { include: { subject: { select: { name: true } } } } }
    });

    // Barcha pricing settings
    const priceSettings = await prisma.settings.findMany({
      where: { key: { startsWith: `price:${studentId}:` } }
    });

    // Barcha to'lovlar
    const payments = await prisma.payment.findMany({
      where: { studentId, note: { not: 'auto_deduction' } },
      orderBy: { monthYear: 'desc' }
    });

    const history = groupStudents.map(gs => {
      const gid = gs.groupId;
      // Bu guruh uchun barcha oylik narxlar
      const groupPrices = priceSettings
        .filter(s => s.key.startsWith(`price:${studentId}:${gid}:`))
        .map(s => {
          const parts = s.key.split(':');
          const m = parts[3];
          const price = parseInt(s.value);
          const monthPayments = payments.filter(p => p.groupId === gid && p.monthYear === m);
          const paid = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
          return { month: m, price, paid, diff: paid - price };
        })
        .sort((a, b) => b.month.localeCompare(a.month));

      return {
        groupId: gid,
        groupName: gs.group.name,
        subjectName: gs.group.subject.name,
        status: gs.status,
        joinedAt: gs.joinedAt,
        months: groupPrices
      };
    });

    res.json(history);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /students/:id/profile
router.get('/:id/profile', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        applicant: true,
        groupStudents: {
          include: { group: { include: { subject: true } } },
          orderBy: { joinedAt: 'desc' }
        },
        payments: {
          where: { note: { not: 'auto_deduction' } },
          orderBy: { createdAt: 'desc' },
          include: { group: { include: { subject: true } } }
        }
      }
    });

    if (!student) return res.status(404).json({ error: 'O\'quvchi topilmadi' });

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

    const balanceInfo = await computeStudentBalance(studentId);

    res.json({ ...student, attendanceStats, balanceInfo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /students/:id
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

// POST /students/:id/groups — guruhga qo'shish (bir fandan bir guruh cheklovi)
router.post('/:id/groups', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { groupId } = req.body;
    const studentId = parseInt(req.params.id);
    const gid = parseInt(groupId);

    // Bu guruhning fanini topamiz
    const grp = await prisma.group.findUnique({ where: { id: gid }, select: { subjectId: true, name: true } });
    if (!grp) return res.status(404).json({ error: 'Guruh topilmadi' });

    // Bir xil fandagi boshqa faol guruhlarni tekshiramiz
    const sameSubjectGs = await prisma.groupStudent.findMany({
      where: { studentId, status: 'active', group: { subjectId: grp.subjectId }, groupId: { not: gid } },
      include: { group: { include: { subject: { select: { name: true } } } } }
    });

    if (sameSubjectGs.length > 0) {
      const existingGroup = sameSubjectGs[0].group;
      return res.status(400).json({
        error: `O'quvchi allaqachon "${existingGroup.subject.name}" fanidan "${existingGroup.name}" guruhida o'qiydi. Bir fandan faqat bitta guruh mumkin.`,
        conflictGroupId: sameSubjectGs[0].groupId,
        conflictGroupName: existingGroup.name
      });
    }

    await prisma.groupStudent.upsert({
      where: { groupId_studentId: { groupId: gid, studentId } },
      update: { status: 'active' },
      create: { groupId: gid, studentId }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /students/:studentId/groups/:groupId — guruhdan chiqarish (arxivlash) + narx muhrlash
router.delete('/:studentId/groups/:groupId', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const groupId = parseInt(req.params.groupId);

    // Narxni muhrlaymiz
    const locked = await lockPriceSnapshot(studentId, groupId);
    console.log(`[Archive] Student ${studentId}, Group ${groupId}: narx muhrlandi =`, locked?.price || 'topilmadi');

    // Guruhdan chiqaramiz (arxivlaymiz)
    await prisma.groupStudent.update({
      where: { groupId_studentId: { groupId, studentId } },
      data: { status: 'archived' }
    });

    res.json({ success: true, lockedPrice: locked?.price || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /students/:studentId/groups/:groupId/move
router.put('/:studentId/groups/:groupId/move', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { newGroupId } = req.body;
    const studentId = parseInt(req.params.studentId);
    const oldGroupId = parseInt(req.params.groupId);
    const newGid = parseInt(newGroupId);

    // Yangi guruhning fanini tekshiramiz (bir fandan bir guruh qoidasi)
    const [oldGrp, newGrp] = await Promise.all([
      prisma.group.findUnique({ where: { id: oldGroupId }, select: { subjectId: true } }),
      prisma.group.findUnique({ where: { id: newGid }, select: { subjectId: true, name: true } })
    ]);

    if (!newGrp) return res.status(404).json({ error: 'Yangi guruh topilmadi' });

    // Yangi fandan boshqa faol guruh bor emasligini tekshiramiz
    const conflicts = await prisma.groupStudent.findMany({
      where: {
        studentId, status: 'active',
        group: { subjectId: newGrp.subjectId },
        groupId: { not: oldGroupId }
      },
      include: { group: { include: { subject: { select: { name: true } } } } }
    });

    if (conflicts.length > 0) {
      const c = conflicts[0];
      return res.status(400).json({
        error: `O'quvchi allaqachon "${c.group.subject.name}" fanidan "${c.group.name}" guruhida o'qiydi.`
      });
    }

    // Eski guruhdan chiqarish + narx muhrlash
    await lockPriceSnapshot(studentId, oldGroupId);

    await prisma.$transaction([
      prisma.groupStudent.update({
        where: { groupId_studentId: { groupId: oldGroupId, studentId } },
        data: { status: 'archived' }
      }),
      prisma.groupStudent.upsert({
        where: { groupId_studentId: { groupId: newGid, studentId } },
        update: { status: 'active' },
        create: { groupId: newGid, studentId }
      })
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════
// DELETE /students/:id — FAQAT arxivlash, to'g'ri o'chirish taqiqlangan
// To'liq o'chirish uchun ?action=hard_delete + arxivlangan bo'lishi shart
// ════════════════════════════════════════════════════════════════════════
router.delete('/:id', roleCheck('admin'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const { action } = req.query;

    if (action === 'archive') {
      // Barcha faol guruhlardan arxivlaymiz + narx muhrlash
      const activeGs = await prisma.groupStudent.findMany({
        where: { studentId, status: 'active' }
      });
      for (const gs of activeGs) {
        await lockPriceSnapshot(studentId, gs.groupId);
      }
      await prisma.groupStudent.updateMany({
        where: { studentId, status: 'active' },
        data: { status: 'archived' }
      });
      return res.json({ success: true, action: 'archived' });
    }

    if (action === 'hard_delete') {
      // To'liq o'chirish: FAQAT arxivlangan o'quvchilar uchun
      const activeGroups = await prisma.groupStudent.count({
        where: { studentId, status: 'active' }
      });
      if (activeGroups > 0) {
        return res.status(400).json({
          error: 'O\'quvchini to\'g\'ridan o\'chirib bo\'lmaydi. Avval uni arxivlang (barcha guruhlardan chiqaring).',
          hasActiveGroups: true
        });
      }
      // Narx sozlamalarini ham o'chiramiz
      await prisma.settings.deleteMany({
        where: { key: { startsWith: `price:${studentId}:` } }
      });
      await prisma.student.delete({ where: { id: studentId } });
      return res.json({ success: true, action: 'deleted' });
    }

    // Eski action='delete' → endi taqiqlangan
    return res.status(400).json({
      error: 'O\'quvchini to\'g\'ridan o\'chirib bo\'lmaydi. Avval "Arxivlash" ni bosing, keyin arxivdan o\'chiring.',
      useArchiveFirst: true
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
