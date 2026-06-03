const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');

// Bot singleton
let _bot = null;
function getBot() {
  if (!_bot) {
    const { Telegraf } = require('telegraf');
    _bot = new Telegraf(process.env.BOT_TOKEN);
  }
  return _bot;
}

function fmt(n) { return Number(n).toLocaleString('ru-RU') + " so'm"; }

// Pricing carry-forward helper
async function getPriceForMonth(studentId, groupId, monthYear) {
  const key = `price:${studentId}:${groupId}:${monthYear}`;
  const setting = await prisma.settings.findUnique({ where: { key } });
  if (setting) return parseInt(setting.value);
  // carry-forward
  const all = await prisma.settings.findMany({
    where: { key: { startsWith: `price:${studentId}:${groupId}:` } }
  });
  const prev = all
    .map(s => { const parts = s.key.split(':'); return { month: parts[3], amount: parseInt(s.value) }; })
    .filter(p => p.month < monthYear)
    .sort((a, b) => b.month.localeCompare(a.month));
  return prev.length > 0 ? prev[0].amount : null;
}

// ═══════════════════════════════════════════════════════════════
// GET /debtors
// Guruh bo'yicha, o'quvchilar + oy uchun qancha to'lagani
// Query: ?monthYear=2026-05  (qaysi oy ko'rilsin)
// ═══════════════════════════════════════════════════════════════
router.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { monthYear } = req.query;
    if (!monthYear) return res.status(400).json({ error: 'monthYear kerak (YYYY-MM)' });

    const groupStudents = await prisma.groupStudent.findMany({
      where: { status: 'active' },
      include: {
        group: {
          include: {
            subject: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } }
          }
        },
        student: {
          include: {
            applicant: {
              select: {
                firstName: true, lastName: true,
                phoneSelf: true, phoneFather: true, phoneMother: true,
                telegramId: true
              }
            },
            payments: { where: { monthYear } }
          }
        }
      },
      orderBy: { student: { applicant: { firstName: 'asc' } } }
    });

    // Guruh bo'yicha guruhlash
    const result = {};
    for (const gs of groupStudents) {
      const gid = gs.groupId;
      const sid = gs.student.id;

      // Bu guruh, bu oy uchun to'lov
      const groupPayments = gs.student.payments.filter(p => p.groupId === gid);
      const paidAmount = groupPayments.reduce((s, p) => s + Number(p.amount), 0);

      // Bu oy uchun narx (pricing + carry-forward)
      const price = await getPriceForMonth(sid, gid, monthYear);

      // Qarzdorlik holati:
      // - Narx belgilangan bo'lsa: to'lagan < narx
      // - Narx belgilanmagan: umuman to'lamagan
      const targetAmount = price || (groupPayments.find(p => p.targetAmount)?.targetAmount ? Number(groupPayments.find(p => p.targetAmount).targetAmount) : null);
      const isDebtor = targetAmount
        ? paidAmount < targetAmount
        : paidAmount === 0;

      const remaining = targetAmount && paidAmount < targetAmount
        ? targetAmount - paidAmount
        : (paidAmount === 0 && targetAmount ? targetAmount : null);

      if (!isDebtor) continue;

      if (!result[gid]) {
        result[gid] = {
          groupId: gid,
          groupName: gs.group.name,
          subjectName: gs.group.subject.name,
          teacherName: gs.group.teacher
            ? `${gs.group.teacher.firstName} ${gs.group.teacher.lastName}`
            : null,
          students: []
        };
      }

      result[gid].students.push({
        studentId: sid,
        firstName: gs.student.applicant.firstName,
        lastName: gs.student.applicant.lastName,
        phoneSelf: gs.student.applicant.phoneSelf,
        phoneFather: gs.student.applicant.phoneFather,
        phoneMother: gs.student.applicant.phoneMother,
        hasTelegram: !!gs.student.applicant.telegramId,
        paidAmount,
        targetAmount,   // narx (pricing dan)
        remainingAmount: remaining,
        noPay: paidAmount === 0
      });
    }

    // Har guruhda: avval to'lamaganlar
    const groups = Object.values(result).map(g => ({
      ...g,
      students: g.students.sort((a, b) => {
        if (a.noPay && !b.noPay) return -1;
        if (!a.noPay && b.noPay) return 1;
        return 0;
      }),
      totalDebt: g.students.reduce((s, st) => s + (st.remainingAmount || 0), 0)
    }));

    res.json(groups);
  } catch (e) {
    console.error('Debtors xatolik:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /debtors/notify
// Guruh + oy bo'yicha qarzdorlarga shaxsiy xabar
// Body: { groupId, monthYear, maxAmount? }
// ═══════════════════════════════════════════════════════════════
router.post('/notify', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { groupId, monthYear, maxAmount } = req.body;
    if (!groupId || !monthYear) return res.status(400).json({ error: 'groupId va monthYear kerak' });

    const bot = getBot();

    const [y, m] = monthYear.split('-');
    const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
    const monthLabel = MONTHS[parseInt(m) - 1] + ' ' + y;

    const group = await prisma.group.findUnique({
      where: { id: parseInt(groupId) },
      include: { subject: true }
    });
    if (!group) return res.status(404).json({ error: 'Guruh topilmadi' });

    const groupStudents = await prisma.groupStudent.findMany({
      where: { groupId: parseInt(groupId), status: 'active' },
      include: {
        student: {
          include: {
            applicant: {
              select: {
                firstName: true, lastName: true,
                telegramId: true
              }
            },
            payments: { where: { groupId: parseInt(groupId), monthYear } }
          }
        }
      }
    });

    let sent = 0, noTelegram = 0;

    for (const gs of groupStudents) {
      const paid = gs.student.payments.reduce((s, p) => s + Number(p.amount), 0);
      const price = await getPriceForMonth(gs.student.id, parseInt(groupId), monthYear);
      const isDebtor = maxAmount ? paid < parseInt(maxAmount) : (price ? paid < price : paid === 0);
      if (!isDebtor) continue;

      const a = gs.student.applicant;
      if (!a.telegramId) { noTelegram++; continue; }

      const remaining = price ? price - paid : null;
      const text = `⚠️ To'lov eslatmasi\n\n` +
        `Hurmatli ${a.firstName} ${a.lastName},\n\n` +
        `📚 Fan: ${group.subject.name} (${group.name})\n` +
        `📅 Oy: ${monthLabel}\n` +
        (paid > 0 ? `💰 To'langan: ${fmt(paid)}\n` : '') +
        (remaining ? `💸 Qoldiq: ${fmt(remaining)}\n` : '') +
        `\nTo'lovni amalga oshirish uchun qabulxonaga murojaat qiling.`;

      try {
        await bot.telegram.sendMessage(a.telegramId.toString(), text);
        sent++;
      } catch (e) {
        console.error(`Xabar yuborilmadi (${a.telegramId}):`, e.message);
      }
    }

    res.json({
      success: true, sent, noTelegram,
      message: `${sent} ta xabar yuborildi` + (noTelegram ? `, ${noTelegram} ta botga ulanmagan` : '')
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
