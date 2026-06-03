// auth.js
const { Router } = require('express');
const prisma = require('../../db');
const authRouter = Router();

authRouter.get('/me', async (req, res) => {
  try {
    const telegramId = req.headers['x-telegram-id'];
    if (!telegramId) return res.status(401).json({ error: 'Telegram ID kerak' });
    if (process.env.ADMIN_TELEGRAM_ID && telegramId === String(process.env.ADMIN_TELEGRAM_ID).trim())
      return res.json({ id: 0, role: 'admin', firstName: 'Admin', lastName: '' });

    let user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (user) return res.json({ ...user, telegramId: user.telegramId.toString() });

    return res.status(404).json({ error: 'Foydalanuvchi topilmadi. Botdan /start bosing.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// subjects.js
const subRouter = Router();

subRouter.get('/', async (req, res) => {
  const s = await prisma.subject.findMany({ orderBy: { name: 'asc' } });
  res.json(s);
});
subRouter.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Fan nomi kerak' });
    const s = await prisma.subject.create({ data: { name: name.trim() } });
    res.json(s);
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Bu fan allaqachon mavjud' });
    res.status(500).json({ error: e.message });
  }
});
subRouter.delete('/:id', async (req, res) => {
  await prisma.subject.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// staff.js
const staffRouter = Router();
const roleCheck = require('../middleware/roleCheck');

staffRouter.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { role } = req.query;
  const where = role ? { role } : { role: { in: ['teacher', 'receptionist'] } };
  const staff = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(staff.map(s => ({ ...s, telegramId: s.telegramId?.toString() ?? null })));
});

staffRouter.get('/teachers', roleCheck('admin', 'receptionist'), async (req, res) => {
  const { subject } = req.query;
  const where = { role: 'teacher' };
  if (subject) where.subject = { equals: subject, mode: 'insensitive' };
  const teachers = await prisma.user.findMany({ where, orderBy: { firstName: 'asc' } });
  res.json(teachers.map(t => ({ ...t, telegramId: t.telegramId?.toString() ?? null })));
});

staffRouter.post('/', roleCheck('admin'), async (req, res) => {
  try {
    const { telegramId, role, firstName, lastName, phone, subject } = req.body;
    if (!telegramId || !role || !firstName || !lastName) return res.status(400).json({ error: 'Barcha maydonlar kerak' });
    if (role === 'teacher' && !subject) return res.status(400).json({ error: 'Fan kerak' });
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: { role, firstName, lastName, phone, subject },
      create: { telegramId: BigInt(telegramId), role, firstName, lastName, phone, subject }
    });
    res.json({ ...user, telegramId: user.telegramId?.toString() ?? null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

staffRouter.put('/:id', roleCheck('admin'), async (req, res) => {
  const { firstName, lastName, phone, subject, role } = req.body;
  const user = await prisma.user.update({ where: { id: parseInt(req.params.id) }, data: { firstName, lastName, phone, subject, role } });
  res.json({ ...user, telegramId: user.telegramId?.toString() ?? null });
});

staffRouter.delete('/:id', roleCheck('admin'), async (req, res) => {
  const { action } = req.query;
  if (action === 'delete') {
    await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
  }
  res.json({ success: true });
});

// settings.js
const settingsRouter = Router();

settingsRouter.get('/', async (req, res) => {
  const settings = await prisma.settings.findMany();
  const result = {};
  settings.forEach(s => result[s.key] = s.value);
  res.json(result);
});

settingsRouter.put('/', roleCheck('admin'), async (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    if (value === '' || value === null || value === undefined) {
      // Bo'sh qiymat — o'chiramiz
      await prisma.settings.deleteMany({ where: { key } });
    } else {
      await prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    }
  }
  res.json({ success: true });
});

// ── POST /settings/run-deduction — qo'lda oylik yechish ──────────────────────
settingsRouter.post('/run-deduction', roleCheck('admin'), async (req, res) => {
  try {
    const { runMonthlyDeduction } = require('../../services/cronService');
    await runMonthlyDeduction();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const count = await prisma.payment.count({
      where: { monthYear: currentMonth, note: 'auto_deduction' }
    });
    res.json({ success: true, processed: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// pricing.js — Narxlar bo'limi
//
// Narx Settings jadvalida saqlanadi:
//   kalit: "price:{studentId}:{groupId}:{monthYear}"  (masalan "price:42:7:2026-05")
//   qiymat: "300000"
//
// Auto-carry-forward mantiq:
//   Agar joriy oy uchun narx topilmasa — oldingi oylardan eng so'nggisi olinadi.
//   Bu backend da GET /pricing/student/:id da amalga oshiriladi.
// ═══════════════════════════════════════════════════════════════════════
const pricingRouter = Router();

// Narx kaliti yasash
function priceKey(studentId, groupId, monthYear) {
  return `price:${studentId}:${groupId}:${monthYear}`;
}

// ── GET /pricing/student/:studentId
// O'quvchining barcha aktiv guruhlari uchun joriy oy narxlarini qaytaradi.
// Agar joriy oy uchun narx yo'q bo'lsa — eng so'nggi belgilangan narxni qaytaradi.
pricingRouter.get('/student/:studentId', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { monthYear } = req.query;
    const targetMonth = monthYear || (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    })();

    // O'quvchining aktiv guruhlari
    const groupStudents = await prisma.groupStudent.findMany({
      where: { studentId, status: 'active' },
      include: { group: { include: { subject: { select: { name: true } } } } }
    });

    // Barcha narx sozlamalarini olamiz (price: prefiksli)
    const allPriceSettings = await prisma.settings.findMany({
      where: { key: { startsWith: `price:${studentId}:` } }
    });

    const result = groupStudents.map(gs => {
      const groupId = gs.groupId;

      // Joriy oy uchun narx
      const currentKey = priceKey(studentId, groupId, targetMonth);
      const currentSetting = allPriceSettings.find(s => s.key === currentKey);

      let price = currentSetting ? parseInt(currentSetting.value) : null;
      let priceMonth = currentSetting ? targetMonth : null;

      // Carry-forward: agar joriy oy yo'q bo'lsa — oldingi oylardan topamiz
      if (!price) {
        const groupPrices = allPriceSettings
          .filter(s => s.key.startsWith(`price:${studentId}:${groupId}:`))
          .map(s => {
            const parts = s.key.split(':');
            return { month: parts[3], amount: parseInt(s.value) };
          })
          .filter(p => p.month < targetMonth)
          .sort((a, b) => b.month.localeCompare(a.month));

        if (groupPrices.length > 0) {
          price = groupPrices[0].amount;
          priceMonth = groupPrices[0].month;
        }
      }

      return {
        groupStudentId: gs.id,
        groupId,
        groupName: gs.group.name,
        subjectName: gs.group.subject.name,
        price,
        priceMonth,       // narx qaysi oydan olingan (carry-forward bo'lsa)
        isCarriedForward: priceMonth !== null && priceMonth !== targetMonth,
        targetMonth
      };
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /pricing/group/:groupId?monthYear=2026-05
// Guruh bo'yicha barcha o'quvchilar narxlarini qaytaradi
pricingRouter.get('/group/:groupId', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { monthYear } = req.query;
    const targetMonth = monthYear || (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    })();

    // Guruhning aktiv o'quvchilari
    const groupStudents = await prisma.groupStudent.findMany({
      where: { groupId, status: 'active' },
      include: {
        student: {
          include: { applicant: { select: { firstName: true, lastName: true } } }
        }
      },
      orderBy: { student: { applicant: { firstName: 'asc' } } }
    });

    // Bu guruh + bu oy uchun barcha narxlar
    const prices = await prisma.settings.findMany({
      where: { key: { contains: `:${groupId}:` } }
    });

    const result = groupStudents.map(gs => {
      const sid = gs.studentId;
      const currentKey = priceKey(sid, groupId, targetMonth);
      const currentSetting = prices.find(s => s.key === currentKey);

      let price = currentSetting ? parseInt(currentSetting.value) : null;
      let priceMonth = currentSetting ? targetMonth : null;

      // Carry-forward
      if (!price) {
        const studentPrices = prices
          .filter(s => s.key.startsWith(`price:${sid}:${groupId}:`))
          .map(s => {
            const parts = s.key.split(':');
            return { month: parts[3], amount: parseInt(s.value) };
          })
          .filter(p => p.month < targetMonth)
          .sort((a, b) => b.month.localeCompare(a.month));

        if (studentPrices.length > 0) {
          price = studentPrices[0].amount;
          priceMonth = studentPrices[0].month;
        }
      }

      return {
        studentId: sid,
        groupStudentId: gs.id,
        firstName: gs.student.applicant.firstName,
        lastName: gs.student.applicant.lastName,
        price,
        priceMonth,
        isCarriedForward: priceMonth !== null && priceMonth !== targetMonth,
        targetMonth
      };
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /pricing/set  { studentId, groupId, monthYear, price }
// O'quvchi + guruh + oy uchun narx belgilaydi
pricingRouter.post('/set', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { studentId, groupId, monthYear, price } = req.body;
    if (!studentId || !groupId || !monthYear || price === undefined || price === null) {
      return res.status(400).json({ error: 'studentId, groupId, monthYear, price kerak' });
    }
    if (parseInt(price) < 0) {
      return res.status(400).json({ error: 'Narx manfiy bo\'lishi mumkin emas' });
    }

    const key = priceKey(parseInt(studentId), parseInt(groupId), monthYear);
    await prisma.settings.upsert({
      where: { key },
      update: { value: String(parseInt(price)) },
      create: { key, value: String(parseInt(price)) }
    });

    res.json({ success: true, key, price: parseInt(price) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /pricing/set-bulk  { groupId, monthYear, prices: [{studentId, price}] }
// Guruh uchun barcha o'quvchilar narxini bir vaqtda belgilash
pricingRouter.post('/set-bulk', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { groupId, monthYear, prices } = req.body;
    if (!groupId || !monthYear || !Array.isArray(prices)) {
      return res.status(400).json({ error: 'groupId, monthYear, prices[] kerak' });
    }

    const ops = prices.map(({ studentId, price }) => {
      const key = priceKey(parseInt(studentId), parseInt(groupId), monthYear);
      return prisma.settings.upsert({
        where: { key },
        update: { value: String(parseInt(price)) },
        create: { key, value: String(parseInt(price)) }
      });
    });

    await prisma.$transaction(ops);
    res.json({ success: true, count: prices.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /pricing/remove  { studentId, groupId, monthYear }
// Narxni o'chirish (carry-forward ishlaydi keyingi oy uchun)
pricingRouter.delete('/remove', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { studentId, groupId, monthYear } = req.body;
    const key = priceKey(parseInt(studentId), parseInt(groupId), monthYear);
    await prisma.settings.deleteMany({ where: { key } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { authRouter, subRouter, staffRouter, settingsRouter, pricingRouter };
