const router = require('express').Router();
const prisma = require('../../db');
const roleCheck = require('../middleware/roleCheck');
const { sendDebtNotif } = require('../../services/notificationService');
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

// Qarzdorga xabar yuborish
router.post('/debt', roleCheck('admin', 'receptionist'), async (req, res) => {
  try {
    const { studentId, groupId, monthYear, remainingAmount } = req.body;
    await sendDebtNotif({
      studentId: parseInt(studentId),
      groupId: parseInt(groupId),
      monthYear,
      remainingAmount: remainingAmount && remainingAmount !== '0' ? parseInt(remainingAmount) : null
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Guruh bo'yicha barcha qarzdorlarga xabar
router.post('/debt/group', roleCheck('admin'), async (req, res) => {
  try {
    const { groupId, monthYear } = req.body;
    const groupStudents = await prisma.groupStudent.findMany({
      where: { groupId: parseInt(groupId), status: 'active' },
      include: {
        student: { include: { applicant: true } }
      }
    });
    let sent = 0;
    for (const gs of groupStudents) {
      const payments = await prisma.payment.findMany({
        where: { studentId: gs.student.id, groupId: parseInt(groupId), monthYear }
      });
      const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
      if (paid === 0) {
        await sendDebtNotif({ studentId: gs.student.id, groupId: parseInt(groupId), monthYear, remainingAmount: null });
        sent++;
      }
    }
    res.json({ success: true, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
