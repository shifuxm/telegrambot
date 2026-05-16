const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');

// Bot singleton - index.js dan keladi
let _bot = null;
function getBot() {
  if (!_bot) {
    const { Telegraf } = require('telegraf');
    _bot = new Telegraf(process.env.BOT_TOKEN);
  }
  return _bot;
}

function fmt(n) {
  return Number(n).toLocaleString('ru-RU') + " so'm";
}

// ===== GET /debtors =====
router.get('/', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { monthYear, maxAmount } = req.query;
    if (!monthYear) return res.status(400).json({ error: 'Oy kerak' });

    const groupStudents = await prisma.groupStudent.findMany({
      where: { status: 'active' },
      include: {
        group: { include: { subject: true } },
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
      }
    });

    const result = {};
    for (const gs of groupStudents) {
      const groupPayments = gs.student.payments.filter(p => p.groupId === gs.groupId);
      const paidAmount = groupPayments.reduce((s, p) => s + p.amount, BigInt(0));
      const targetAmount = groupPayments.find(p => p.targetAmount)?.targetAmount || null;
      const isDebtor = maxAmount
        ? paidAmount < BigInt(maxAmount)
        : paidAmount === BigInt(0);

      if (isDebtor) {
        const key = gs.groupId;
        if (!result[key]) {
          result[key] = {
            groupId: gs.groupId,
            groupName: gs.group.name,
            subjectName: gs.group.subject.name,
            students: []
          };
        }
        result[key].students.push({
          studentId: gs.student.id,
          firstName: gs.student.applicant.firstName,
          lastName: gs.student.applicant.lastName,
          phoneSelf: gs.student.applicant.phoneSelf,
          phoneFather: gs.student.applicant.phoneFather,
          paidAmount: paidAmount.toString(),
          targetAmount: targetAmount?.toString() || null,
          remainingAmount: targetAmount ? (targetAmount - paidAmount).toString() : null
        });
      }
    }
    res.json(Object.values(result));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== POST /debtors/notify =====
// Har bir qarzdor o'quvchiga SHAXSIY xabar yuboradi (kanal emas)
router.post('/notify', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { groupId, monthYear, maxAmount } = req.body;
    if (!groupId || !monthYear) return res.status(400).json({ error: 'groupId va monthYear kerak' });

    const bot = getBot();

    // Oy nomini formatlash
    const [y, m] = monthYear.split('-');
    const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
    const monthLabel = MONTHS[parseInt(m) - 1] + ' ' + y;

    const group = await prisma.group.findUnique({
      where: { id: parseInt(groupId) },
      include: { subject: true }
    });
    if (!group) return res.status(404).json({ error: 'Guruh topilmadi' });

    // Barcha aktiv o'quvchilar + to'lov ma'lumotlari
    const groupStudents = await prisma.groupStudent.findMany({
      where: { groupId: parseInt(groupId), status: 'active' },
      include: {
        student: {
          include: {
            applicant: {
              select: {
                firstName: true, lastName: true,
                phoneSelf: true, phoneFather: true, phoneMother: true,
                telegramId: true
              }
            },
            payments: { where: { groupId: parseInt(groupId), monthYear } }
          }
        }
      }
    });

    // Qarzdorlarni filtrlash
    const debtors = groupStudents.filter(gs => {
      const paid = gs.student.payments.reduce((s, p) => s + p.amount, BigInt(0));
      return maxAmount ? paid < BigInt(maxAmount) : paid === BigInt(0);
    });

    if (!debtors.length) return res.status(400).json({ error: "Qarzdorlar yo'q" });

    let sent = 0;
    let noTelegram = 0;

    for (const gs of debtors) {
      const a = gs.student.applicant;
      const paid = gs.student.payments.reduce((s, p) => s + p.amount, BigInt(0));

      // Botga ulangan telegramId larni topamiz
      // O'quvchining o'zi, otasi yoki onasi ulangan bo'lishi mumkin
      // Hozir applicant.telegramId - bu /start bosgan raqam
      const tgId = a.telegramId;

      if (!tgId) {
        noTelegram++;
        continue;
      }

      const payStr = paid > BigInt(0)
        ? `\n💰 To'langan: ${fmt(paid)}`
        : '';

      const text = `⚠️ To'lov eslatmasi\n\n` +
        `Hurmatli ${a.firstName} ${a.lastName},\n\n` +
        `📚 Fan: ${group.subject.name}\n` +
        `📅 Oy: ${monthLabel}${payStr}\n\n` +
        `To'lovni amalga oshirish uchun qabulxonaga murojaat qiling.`;

      try {
        await bot.telegram.sendMessage(tgId.toString(), text);
        sent++;
      } catch (e) {
        console.error(`Xabar yuborilmadi (${tgId}):`, e.message);
      }
    }

    res.json({
      success: true,
      sent,
      noTelegram,
      total: debtors.length,
      message: `${sent} ta o'quvchiga xabar yuborildi` + (noTelegram > 0 ? `, ${noTelegram} ta botga ulanmagan` : '')
    });

  } catch (e) {
    console.error('Debtors notify xatolik:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
