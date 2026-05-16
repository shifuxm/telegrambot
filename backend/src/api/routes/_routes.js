const { Router } = require('express');
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');
const { sendPaymentReport, sendExpenseReport, sendConversionReport, sendAttendanceReport, getBalance, sendPaymentNotifToStudent, sendAttendanceNotifToStudent, sendDebtNotif } = require('../../services/notificationService');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

// ========== ATTENDANCE ==========
const attRouter = Router();

attRouter.get('/sheet/:scheduleId', roleCheck('teacher'), async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId);
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return res.status(404).json({ error: 'Jadval topilmadi' });

  const groupStudents = await prisma.groupStudent.findMany({
    where: { groupId: schedule.groupId, status: 'active' },
    include: {
      student: { include: { applicant: { select: { firstName: true, lastName: true } } } },
      attendances: { where: { scheduleId } }
    },
    orderBy: { student: { applicant: { firstName: 'asc' } } }
  });

  const alreadyTaken = groupStudents.some(gs => gs.attendances.length > 0);
  let students = groupStudents.map(gs => ({
    groupStudentId: gs.id,
    studentId: gs.student.id,
    firstName: gs.student.applicant.firstName,
    lastName: gs.student.applicant.lastName,
    isPresent: gs.attendances[0]?.isPresent ?? null
  }));

  // allStudents - BARCHA o'quvchilar (2-marta davomat uchun teacher.html ishlatadi)
  const allStudents = students;
  // filteredStudents - 2-marta olganda faqat kelmagan (eski compat)
  const filteredStudents = alreadyTaken ? students.filter(s => s.isPresent !== true) : students;
  res.json({ students: filteredStudents, allStudents, alreadyTaken });
});

attRouter.get('/student/:studentId', async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { groupId, month } = req.query;
    if (!groupId || !month) return res.status(400).json({ error: 'groupId va month kerak' });

    const [y, m] = month.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59);

    // Shu guruh uchun shu oy darslarini topamiz
    const schedules = await prisma.schedule.findMany({
      where: { groupId: parseInt(groupId), lessonDate: { gte: monthStart, lte: monthEnd } },
      orderBy: { lessonDate: 'asc' }
    });

    // O'quvchining groupStudentId si
    const gs = await prisma.groupStudent.findFirst({
      where: { studentId, groupId: parseInt(groupId) }
    });
    if (!gs) return res.json([]);

    // Davomat ma'lumotlari
    const attendances = await prisma.attendance.findMany({
      where: { scheduleId: { in: schedules.map(s => s.id) }, groupStudentId: gs.id }
    });
    const attMap = {};
    attendances.forEach(a => { attMap[a.scheduleId] = { isPresent: a.isPresent }; });

    const result = schedules.map(sch => ({
      scheduleId: sch.id,
      lessonDate: sch.lessonDate,
      startTime: sch.startTime,
      endTime: sch.endTime,
      isPresent: attMap[sch.id]?.isPresent ?? null
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

attRouter.post('/save/:scheduleId', roleCheck('teacher'), async (req, res) => {
  try {
    const { presentIds } = req.body;
    const scheduleId = parseInt(req.params.scheduleId);
    const presentSet = new Set(presentIds || []);

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { group: { include: { teacher: { select: { firstName: true, lastName: true } } } } }
    });

    const groupStudents = await prisma.groupStudent.findMany({
      where: { groupId: schedule.groupId, status: 'active' }
    });

    // Avvalgi davomat holatini saqlab olamiz (xabar o'zgarishlarni aniqlash uchun)
    const prevAttendances = await prisma.attendance.findMany({
      where: { scheduleId },
      select: { groupStudentId: true, isPresent: true }
    });
    const prevMap = new Map(prevAttendances.map(a => [a.groupStudentId, a.isPresent]));
    const isFirstTime = prevAttendances.length === 0;

    const ops = groupStudents.map(gs => prisma.attendance.upsert({
      where: { scheduleId_groupStudentId: { scheduleId, groupStudentId: gs.id } },
      update: { isPresent: presentSet.has(gs.id) },
      create: { scheduleId, groupStudentId: gs.id, teacherId: req.user.id || null, isPresent: presentSet.has(gs.id) }
    }));
    await prisma.$transaction(ops);

    const teacherName = schedule.group.teacher
      ? `${schedule.group.teacher.firstName} ${schedule.group.teacher.lastName}`
      : 'Noma\'lum';

    await sendAttendanceReport({ groupId: schedule.groupId, scheduleId, teacherName, lessonDate: schedule.lessonDate });

    // O'quvchilarga xabar:
    // 1-marta: hamma uchun
    // 2-marta: faqat holati o'zgarganlar uchun
    for (const gs of groupStudents) {
      const wasPresent = prevMap.get(gs.id);
      const isNowPresent = presentSet.has(gs.id);
      const changed = !isFirstTime && wasPresent !== isNowPresent;
      if (isFirstTime || changed) {
        // Xabar yuboramiz
        setImmediate(() => {
          sendAttendanceNotifToStudent({ groupStudentId: gs.id, scheduleId, isPresent: isNowPresent }).catch(() => {});
        });
      }
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== PAYMENTS ==========
const payRouter = Router();

payRouter.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { groupId, studentId, monthYear } = req.query;
  const where = {};
  if (groupId) where.groupId = parseInt(groupId);
  if (studentId) where.studentId = parseInt(studentId);
  if (monthYear) where.monthYear = monthYear;
  const payments = await prisma.payment.findMany({
    where,
    include: {
      student: { include: { applicant: { select: { firstName: true, lastName: true } } } },
      group: { include: { subject: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(payments.map(p => ({ ...p, amount: p.amount.toString(), targetAmount: p.targetAmount?.toString() })));
});

// Search student by name
payRouter.get('/search', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const students = await prisma.student.findMany({
    where: {
      applicant: { OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } }
      ]},
      groupStudents: { some: { status: 'active' } }
    },
    include: {
      applicant: true,
      groupStudents: {
        where: { status: 'active' },
        include: { group: { include: { subject: true } } }
      }
    },
    take: 10
  });
  res.json(students);
});

payRouter.post('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { studentId, groupId, monthYear, amount, targetAmount, isPartial, paymentType, note } = req.body;
    if (!studentId || !groupId || !monthYear || !amount || !paymentType)
      return res.status(400).json({ error: 'Barcha maydonlar kerak' });

    const payment = await prisma.payment.create({
      data: {
        studentId: parseInt(studentId),
        groupId: parseInt(groupId),
        monthYear,
        amount: BigInt(amount),
        targetAmount: targetAmount ? BigInt(targetAmount) : null,
        isPartial: !!isPartial,
        paymentType,
        note
      }
    });

    await sendPaymentReport({ studentId: parseInt(studentId), groupId: parseInt(groupId), monthYear, amount: BigInt(amount), paymentType, note });

    // O'quvchiga to'lov xabari
    setImmediate(() => {
      sendPaymentNotifToStudent({ studentId: parseInt(studentId), groupId: parseInt(groupId), monthYear, amount: BigInt(amount), paymentType }).catch(() => {});
    });

    res.json({ ...payment, amount: payment.amount.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Batch payment (multiple groups, split amount)
payRouter.post('/batch', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { studentId, groupIds, monthYear, totalAmount, targetAmount, isPartial, paymentType, note } = req.body;
    if (!studentId || !groupIds?.length || !monthYear || !totalAmount || !paymentType)
      return res.status(400).json({ error: 'Barcha maydonlar kerak' });

    const perGroup = Math.floor(parseInt(totalAmount) / groupIds.length);
    const payments = [];

    for (const groupId of groupIds) {
      const p = await prisma.payment.create({
        data: {
          studentId: parseInt(studentId),
          groupId: parseInt(groupId),
          monthYear,
          amount: BigInt(perGroup),
          targetAmount: targetAmount ? BigInt(Math.floor(parseInt(targetAmount) / groupIds.length)) : null,
          isPartial: !!isPartial,
          paymentType,
          note
        }
      });
      payments.push(p);
      await sendPaymentReport({ studentId: parseInt(studentId), groupId: parseInt(groupId), monthYear, amount: BigInt(perGroup), paymentType, note });
      setImmediate(() => {
        sendPaymentNotifToStudent({ studentId: parseInt(studentId), groupId: parseInt(groupId), monthYear, amount: BigInt(perGroup), paymentType }).catch(() => {});
      });
    }

    res.json(payments.map(p => ({ ...p, amount: p.amount.toString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== EXPENSES ==========
const expRouter = Router();

expRouter.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const expenses = await prisma.expense.findMany({
    include: { staff: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(expenses.map(e => ({ ...e, amount: e.amount.toString() })));
});

expRouter.post('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { category, subcategory, staffId, monthYear, amount, paymentType, note } = req.body;
    if (!category || !amount || !paymentType) return res.status(400).json({ error: 'Kategoriya, summa, tur kerak' });

    // Balans tekshiruvi - hisobdagi qiymatdan ko'p chiqim qilinmasin
    const balance = await getBalance();
    const expAmount = BigInt(amount);
    if (paymentType === 'cash' && expAmount > balance.cash) {
      return res.status(400).json({
        error: `Naqd balans yetarli emas. Mavjud: ${Number(balance.cash).toLocaleString('ru-RU')} so'm`
      });
    }
    if (paymentType === 'card' && expAmount > balance.card) {
      return res.status(400).json({
        error: `Karta balans yetarli emas. Mavjud: ${Number(balance.card).toLocaleString('ru-RU')} so'm`
      });
    }

    let staffName = '';
    if (staffId) {
      const s = await prisma.user.findUnique({ where: { id: parseInt(staffId) } });
      if (s) staffName = `${s.firstName} ${s.lastName}`;
    }

    const expense = await prisma.expense.create({
      data: { category, subcategory, staffId: staffId ? parseInt(staffId) : null, monthYear, amount: expAmount, paymentType, note }
    });

    await sendExpenseReport({ category, subcategory, staffName, monthYear, amount: expAmount, paymentType, note });

    res.json({ ...expense, amount: expense.amount.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CONVERSIONS ==========
const convRouter = Router();

convRouter.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const list = await prisma.conversion.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(list.map(c => ({ ...c, fromAmount: c.fromAmount.toString(), toAmount: c.toAmount.toString() })));
});

convRouter.post('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { type, fromAmount, toAmount } = req.body;
    if (!type || !fromAmount || !toAmount) return res.status(400).json({ error: 'Barcha maydonlar kerak' });
    const conv = await prisma.conversion.create({ data: { type, fromAmount: BigInt(fromAmount), toAmount: BigInt(toAmount) } });
    await sendConversionReport({ type, fromAmount: BigInt(fromAmount), toAmount: BigInt(toAmount) });
    res.json({ ...conv, fromAmount: conv.fromAmount.toString(), toAmount: conv.toAmount.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== BALANCE ==========
const balRouter = Router();

balRouter.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const balance = await getBalance();
  res.json({ cash: balance.cash.toString(), card: balance.card.toString(), total: balance.total.toString() });
});

// ========== STATISTICS ==========
const statRouter = Router();
const MIN_MONTH = '2026-04';

statRouter.get('/', roleCheck('admin'), async (req, res) => {
  try {
    const { monthYear } = req.query;
    const target = monthYear || moment().tz(TZ).format('YYYY-MM');
    if (target < MIN_MONTH) return res.json({ noData: true });

    const [y, m] = target.split('-').map(Number);

    const [groupsCount, totalStudents, totalStudentsActive, income, expense] = await Promise.all([
      prisma.group.count({ where: { status: 'active' } }),
      // Shu oy to'lov qilgan unique o'quvchilar
      prisma.payment.findMany({ where: { monthYear: target }, select: { studentId: true }, distinct: ['studentId'] }),
      // Jami faol o'quvchilar
      prisma.groupStudent.findMany({ where: { status: 'active' }, select: { studentId: true }, distinct: ['studentId'] }),
      prisma.payment.groupBy({ by: ['paymentType'], where: { monthYear: target }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['paymentType'], where: { monthYear: target }, _sum: { amount: true } })
    ]);

    const [oneSubject, twoPlus] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) as count FROM (SELECT gs.student_id FROM group_students gs JOIN groups g ON g.id = gs.group_id WHERE gs.status = 'active' GROUP BY gs.student_id HAVING COUNT(DISTINCT g.subject_id) = 1) t`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM (SELECT gs.student_id FROM group_students gs JOIN groups g ON g.id = gs.group_id WHERE gs.status = 'active' GROUP BY gs.student_id HAVING COUNT(DISTINCT g.subject_id) >= 2) t`
    ]);

    const parseGroupBy = arr => {
      const cash = arr.find(a => a.paymentType === 'cash')?._sum?.amount || BigInt(0);
      const card = arr.find(a => a.paymentType === 'card')?._sum?.amount || BigInt(0);
      return { cash: cash.toString(), card: card.toString(), total: (cash + card).toString() };
    };

    const prevMonth = moment(target, 'YYYY-MM').subtract(1, 'month').format('YYYY-MM');
    let prevData = null;
    if (prevMonth >= MIN_MONTH) {
      const [pInc, pExp] = await Promise.all([
        prisma.payment.aggregate({ where: { monthYear: prevMonth }, _sum: { amount: true } }),
        prisma.expense.aggregate({ where: { monthYear: prevMonth }, _sum: { amount: true } })
      ]);
      prevData = {
        month: prevMonth,
        income: (pInc._sum.amount || BigInt(0)).toString(),
        expense: (pExp._sum.amount || BigInt(0)).toString()
      };
    }

    const balance = await getBalance();

    const incParsed = parseGroupBy(income);
    const expParsed = parseGroupBy(expense);
    res.json({
      month: target,
      groupsCount,
      totalStudents: totalStudentsActive.length,
      paidStudents: totalStudents.length,
      oneSubject: Number(oneSubject[0]?.count || 0),
      twoPlus: Number(twoPlus[0]?.count || 0),
      deposits: incParsed.total,
      deducts:  expParsed.total,
      income:   incParsed,
      expense:  expParsed,
      prevMonth: prevData,
      balance: { cash: balance.cash.toString(), card: balance.card.toString(), total: balance.total.toString() }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== DEBTORS ==========
const debtRouter = Router();

debtRouter.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { monthYear, maxAmount } = req.query;
    if (!monthYear) return res.status(400).json({ error: 'Oy kerak' });

    const groupStudents = await prisma.groupStudent.findMany({
      where: { status: 'active' },
      include: {
        group: { include: { subject: true, teacher: { select: { firstName: true, lastName: true } } } },
        student: {
          include: {
            applicant: { select: { firstName: true, lastName: true, phoneSelf: true, phoneFather: true, phoneMother: true } },
            payments: { where: { monthYear } }
          }
        }
      }
    });

    const result = {};
    for (const gs of groupStudents) {
      const groupPayments = gs.student.payments.filter(p => p.groupId === gs.groupId);
      const paidAmount = groupPayments.reduce((s, p) => s + p.amount, BigInt(0));
      const targetAmount = groupPayments.find(p => p.targetAmount)?.targetAmount || null;
      const hasPartial = groupPayments.some(p => p.isPartial === true);

      // Qarzdor hisoblanishi uchun shartlar:
      // 1. maxAmount berilgan bo'lsa: to'langan summa < maxAmount
      // 2. maxAmount berilmagan bo'lsa: umuman to'lov yo'q YOKI qisman to'lov qilgan
      let isDebtor = false;
      if (maxAmount) {
        isDebtor = paidAmount < BigInt(maxAmount);
      } else {
        // Hech to'lamagan yoki qisman to'lagan (targetAmount bor va to'liq to'lamagan)
        isDebtor = paidAmount === BigInt(0) || hasPartial;
      }

      // Agar targetAmount bor va to'liq to'langan bo'lsa — qarzdor emas
      if (targetAmount && paidAmount >= targetAmount) isDebtor = false;

      if (isDebtor) {
        const key = gs.groupId;
        if (!result[key]) {
          result[key] = {
            groupId: gs.groupId,
            groupName: gs.group.name,
            subjectName: gs.group.subject.name,
            teacherName: gs.group.teacher ? `${gs.group.teacher.firstName} ${gs.group.teacher.lastName}` : null,
            students: []
          };
        }
        const remaining = targetAmount ? (targetAmount - paidAmount) : null;
        result[key].students.push({
          studentId: gs.student.id,
          firstName: gs.student.applicant.firstName,
          lastName: gs.student.applicant.lastName,
          phoneSelf: gs.student.applicant.phoneSelf,
          phoneFather: gs.student.applicant.phoneFather,
          phoneMother: gs.student.applicant.phoneMother,
          paidAmount: paidAmount.toString(),
          targetAmount: targetAmount?.toString() || null,
          remainingAmount: remaining ? remaining.toString() : null,
          isPartial: hasPartial,
          noPay: paidAmount === BigInt(0)
        });
      }
    }

    // Har bir guruhda o'quvchilarni: avval to'lamaganlar, keyin qisman to'laganlar
    const groups = Object.values(result).map(g => ({
      ...g,
      students: g.students.sort((a, b) => {
        if (a.noPay && !b.noPay) return -1;
        if (!a.noPay && b.noPay) return 1;
        return 0;
      }),
      totalDebt: g.students.reduce((sum, s) => {
        const rem = s.remainingAmount ? BigInt(s.remainingAmount) : BigInt(0);
        return sum + rem;
      }, BigInt(0)).toString()
    }));

    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== RESULTS ==========
const resRouter = Router();

resRouter.get('/', async (req, res) => {
  const { subjectId, year } = req.query;
  const where = {};
  if (subjectId) where.subjectId = parseInt(subjectId);
  if (year) where.year = parseInt(year);
  const results = await prisma.result.findMany({
    where, include: { subject: true },
    orderBy: [{ score: 'asc' }, { studentName: 'asc' }]
  });
  res.json(results);
});

resRouter.get('/years', async (req, res) => {
  const years = await prisma.result.findMany({ select: { year: true }, distinct: ['year'], orderBy: { year: 'desc' } });
  res.json(years.map(y => y.year));
});

resRouter.post('/', roleCheck('admin'), async (req, res) => {
  try {
    const { subjectId, year, studentName, score } = req.body;
    const result = await prisma.result.create({
      data: { subjectId: parseInt(subjectId), year: parseInt(year), studentName, score },
      include: { subject: true }
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

resRouter.delete('/:id', roleCheck('admin'), async (req, res) => {
  await prisma.result.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

module.exports = { attRouter, payRouter, expRouter, convRouter, balRouter, statRouter, debtRouter, resRouter };
