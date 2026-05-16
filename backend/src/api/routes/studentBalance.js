// O'quvchi balansi — moslashuvchan to'lov tizimi
// Balans + tranzaksiyalar + oylik plan + qayta to'lov
const router   = require('express').Router();
const prisma   = require('../../db');
const roleCheck = require('../middleware/roleCheck');
const moment   = require('moment-timezone');
const TZ       = 'Asia/Tashkent';

function fmt(n) { return Number(n).toLocaleString('ru-RU') + " so'm"; }

// ── Balans ma'lumotlari (PUBLIC — student ham ko'radi) ─────────
router.get('/:studentId', async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const now = moment().tz(TZ);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        groupStudents: {
          where: { status: 'active' },
          include: { group: { include: { subject: true } } }
        }
      }
    });
    if (!student) return res.status(404).json({ error: 'Topilmadi' });

    const transactions = await prisma.studentTransaction.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 30
    });

    // So'nggi 4 oy oylik plan holati
    const months = [];
    for (let i = 3; i >= 0; i--) months.push(now.clone().subtract(i, 'months').format('YYYY-MM'));

    const monthlyStatus = [];
    for (const monthYear of months) {
      for (const gs of student.groupStudents) {
        const plan = await prisma.monthlyPaymentPlan.findUnique({
          where: { studentId_groupId_monthYear: { studentId, groupId: gs.groupId, monthYear } }
        });
        monthlyStatus.push({
          monthYear,
          groupId:     gs.groupId,
          groupName:   gs.group.name,
          subjectName: gs.group.subject.name,
          defaultFee:  gs.group.monthlyPrice ? gs.group.monthlyPrice.toString() : '0',
          amount:      plan ? plan.amount.toString() : null,
          isPaid:      plan?.isPaid || false,
          paidAt:      plan?.paidAt || null,
          hasPlan:     !!plan,
        });
      }
    }

    res.json({
      balance:      student.balance.toString(),
      debtStatus:   student.debtStatus,
      groupStudents: student.groupStudents.map(gs => ({
        groupId:     gs.groupId,
        groupName:   gs.group.name,
        subjectName: gs.group.subject.name,
        defaultFee:  gs.group.monthlyPrice ? gs.group.monthlyPrice.toString() : '0',
      })),
      transactions:  transactions.map(t => ({ ...t, amount: t.amount.toString() })),
      monthlyStatus,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Balansga kirim (DEPOSIT) ────────────────────────────────────
// To'lov turi, izoh — erkin. Kassa uchun Payment ham yaratiladi.
router.post('/:studentId/deposit', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId   = parseInt(req.params.studentId);
    const { amount, paymentType = 'cash', description, note } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Summa kerak' });

    const bigAmt = BigInt(amount);

    const [updated, tx] = await prisma.$transaction([
      prisma.student.update({ where: { id: studentId }, data: { balance: { increment: bigAmt } } }),
      prisma.studentTransaction.create({
        data: { studentId, amount: bigAmt, type: 'deposit', description: description || "Balansga to'lov" }
      })
    ]);

    // Kassa hisobi uchun Payment yozuvi
    await prisma.payment.create({
      data: { studentId, groupId: null, monthYear: null, amount: bigAmt, paymentType, fromBalance: false, note: note || null }
    });

    // Telegram xabari
    try { await notifyStudent(studentId, `💰 Balansga ${fmt(bigAmt)} kirim qilindi`); } catch(e) {}

    res.json({ balance: updated.balance.toString(), transaction: { ...tx, amount: tx.amount.toString() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Oylik to'lov (balansdan ayirish + plan belgilash) ──────────
// Har qanday oylik to'lov mana shu endpoint orqali — qolip yo'q
router.post('/:studentId/pay-month', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { groupId, monthYear, amount } = req.body;
    if (!groupId || !monthYear || !amount) return res.status(400).json({ error: 'groupId, monthYear, amount kerak' });

    const fee = BigInt(amount);
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { balance: true } });
    if (!student) return res.status(404).json({ error: "O'quvchi topilmadi" });

    const group = await prisma.group.findUnique({ where: { id: parseInt(groupId) }, include: { subject: true } });

    if (student.balance < fee) {
      // Qarz — plan yozamiz, lekin balansdan ayirmaymiz
      await prisma.monthlyPaymentPlan.upsert({
        where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } },
        update: { amount: fee, isPaid: false },
        create: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, isPaid: false }
      });
      await prisma.student.update({ where: { id: studentId }, data: { debtStatus: true } });
      return res.status(400).json({
        error: `Balans yetarli emas. Balans: ${fmt(student.balance)}, Kerak: ${fmt(fee)}`,
        debt: true, balance: student.balance.toString()
      });
    }

    const desc = group ? `${group.subject.name} — ${monthYear}` : monthYear;

    // Balansdan ayiramiz + plan belgilaymiz
    const [updated, tx] = await prisma.$transaction([
      prisma.student.update({ where: { id: studentId }, data: { balance: { decrement: fee }, debtStatus: false } }),
      prisma.studentTransaction.create({
        data: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, type: 'deduct', description: desc }
      })
    ]);

    await prisma.monthlyPaymentPlan.upsert({
      where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } },
      update: { amount: fee, isPaid: true, paidAt: new Date() },
      create: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, isPaid: true, paidAt: new Date() }
    });

    // Kassa uchun Payment
    await prisma.payment.create({
      data: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, paymentType: 'cash', fromBalance: true }
    });

    // Telegram xabari
    try { await notifyStudent(studentId, `✅ ${desc} to'lovi (${fmt(fee)}) amalga oshirildi`); } catch(e) {}

    res.json({ balance: updated.balance.toString(), transaction: { ...tx, amount: tx.amount.toString() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Balansdan ayirish (qolip yo'q — har qanday sabab) ─────────
router.post('/:studentId/deduct', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { groupId, monthYear, amount, description } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Summa kerak' });

    const fee = BigInt(amount);
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { balance: true } });
    if (!student) return res.status(404).json({ error: "O'quvchi topilmadi" });

    let group = null;
    if (groupId) group = await prisma.group.findUnique({ where: { id: parseInt(groupId) }, include: { subject: true } });

    if (student.balance < fee) {
      if (groupId && monthYear) {
        await prisma.monthlyPaymentPlan.upsert({
          where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } },
          update: { amount: fee, isPaid: false },
          create: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, isPaid: false }
        });
      }
      await prisma.student.update({ where: { id: studentId }, data: { debtStatus: true } });
      return res.status(400).json({ error: `Balans yetarli emas. Balans: ${fmt(student.balance)}, Kerak: ${fmt(fee)}`, debt: true });
    }

    const desc = description || (group ? `${group.subject.name}${monthYear ? ' — '+monthYear : ''}` : 'Balansdan ayirish');

    const [updated, tx] = await prisma.$transaction([
      prisma.student.update({ where: { id: studentId }, data: { balance: { decrement: fee }, debtStatus: false } }),
      prisma.studentTransaction.create({
        data: { studentId, groupId: groupId ? parseInt(groupId) : null, monthYear: monthYear || null, amount: fee, type: 'deduct', description: desc }
      })
    ]);

    if (groupId && monthYear) {
      await prisma.monthlyPaymentPlan.upsert({
        where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } },
        update: { amount: fee, isPaid: true, paidAt: new Date() },
        create: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, isPaid: true, paidAt: new Date() }
      });
      await prisma.payment.create({
        data: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, paymentType: 'cash', fromBalance: true }
      });
    }

    res.json({ balance: updated.balance.toString(), transaction: { ...tx, amount: tx.amount.toString() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Qaytarish (refund) ─────────────────────────────────────────
router.post('/:studentId/refund', roleCheck('admin'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { amount, description } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Summa kerak' });

    const bigAmt = BigInt(amount);
    const [updated, tx] = await prisma.$transaction([
      prisma.student.update({ where: { id: studentId }, data: { balance: { increment: bigAmt } } }),
      prisma.studentTransaction.create({
        data: { studentId, amount: bigAmt, type: 'refund', description: description || 'Qaytarish' }
      })
    ]);

    res.json({ balance: updated.balance.toString(), transaction: { ...tx, amount: tx.amount.toString() } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Qarzni qayta to'lash ───────────────────────────────────────
router.post('/:studentId/retry-debt', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { groupId, monthYear, amount } = req.body;
    if (!groupId || !monthYear || !amount) return res.status(400).json({ error: 'Barcha maydonlar kerak' });

    const fee = BigInt(amount);
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { balance: true } });
    if (!student || student.balance < fee)
      return res.status(400).json({ error: 'Balans yetarli emas', debt: true });

    const group = await prisma.group.findUnique({ where: { id: parseInt(groupId) }, include: { subject: true } });
    const desc = group ? `${group.subject.name} — ${monthYear} (qarz to'landi)` : `Qarz — ${monthYear}`;

    const [updated] = await prisma.$transaction([
      prisma.student.update({ where: { id: studentId }, data: { balance: { decrement: fee }, debtStatus: false } }),
      prisma.studentTransaction.create({ data: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, type: 'deduct', description: desc } })
    ]);

    await prisma.monthlyPaymentPlan.upsert({
      where: { studentId_groupId_monthYear: { studentId, groupId: parseInt(groupId), monthYear } },
      update: { amount: fee, isPaid: true, paidAt: new Date() },
      create: { studentId, groupId: parseInt(groupId), monthYear, amount: fee, isPaid: true, paidAt: new Date() }
    });

    res.json({ balance: updated.balance.toString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Oylik plan holati ──────────────────────────────────────────
router.get('/:studentId/plans', async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { monthYear } = req.query;
    const where = { studentId };
    if (monthYear) where.monthYear = monthYear;
    const plans = await prisma.monthlyPaymentPlan.findMany({
      where,
      include: { group: { include: { subject: true } } },
      orderBy: [{ monthYear: 'desc' }, { groupId: 'asc' }]
    });
    res.json(plans.map(p => ({ ...p, amount: p.amount.toString() })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Internal: Telegram xabari ─────────────────────────────────
async function notifyStudent(studentId, text) {
  try {
    const { getBot } = require('../../bot/index');
    const bot = getBot();
    if (!bot) return;

    const applicant = await prisma.applicant.findFirst({
      where: { student: { id: studentId } },
      select: { telegramId: true }
    });
    if (!applicant?.telegramId) return;

    await bot.telegram.sendMessage(applicant.telegramId.toString(), text).catch(() => {});
  } catch(e) {}
}

module.exports = router;
