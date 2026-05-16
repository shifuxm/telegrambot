// Notification service — bot singleton, kanal xabarlari, o'quvchi xabarlari
require('dotenv').config();
const prisma = require('../db');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

// Singleton bot (index.js dan inject qilinadi)
let _bot = null;
function getBot() {
  if (_bot) return _bot;
  try { const { Telegraf } = require('telegraf'); return new Telegraf(process.env.BOT_TOKEN); }
  catch(e) { return null; }
}
function setNotifBot(b) { _bot = b; }

function fmt(n) { return Number(n).toLocaleString('ru-RU') + " so'm"; }
function ts() { return moment().tz(TZ).format('HH:mm | DD.MM.YYYY'); }

async function getBalance() {
  const [payments, expenses, conversions] = await Promise.all([
    prisma.payment.findMany({ select: { amount: true, paymentType: true } }),
    prisma.expense.findMany({ select: { amount: true, paymentType: true } }),
    prisma.conversion.findMany()
  ]);
  let cash = BigInt(0), card = BigInt(0);
  for (const p of payments) p.paymentType === 'cash' ? (cash += p.amount) : (card += p.amount);
  for (const e of expenses) e.paymentType === 'cash' ? (cash -= e.amount) : (card -= e.amount);
  for (const c of conversions) {
    if (c.type === 'cash_to_card') { cash -= c.fromAmount; card += c.toAmount; }
    else { card -= c.fromAmount; cash += c.toAmount; }
  }
  return { cash, card, total: cash + card };
}

async function getChannelId(key) {
  const s = await prisma.settings.findUnique({ where: { key } });
  return s?.value || null;
}

// ── TO'LOV HISOBOTI (kanal) ───────────────────────────────────
async function sendPaymentReport({ studentId, groupId, monthYear, amount, paymentType, note }) {
  try {
    const bot = getBot(); if (!bot) return;
    const channelId = await getChannelId('report_channel_id');
    if (!channelId) return;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { applicant: true, payments: { where: { groupId, monthYear }, orderBy: { createdAt: 'asc' } } }
    });
    const group = groupId ? await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } }) : null;
    const balance = await getBalance();

    const fullName = `${student.applicant.firstName} ${student.applicant.lastName}`;
    const totalMonth = student.payments.reduce((s, p) => s + p.amount, BigInt(0));

    let text = `💰 <b>To'lov qabul qilindi</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `👤 O'quvchi: <b>${fullName}</b>\n`;
    if (group) text += `📚 Fan: ${group.subject.name} | Guruh: ${group.name}\n`;
    if (monthYear) text += `📅 Oy: ${monthYear}\n`;
    text += `💵 Summa: <b>${fmt(amount)}</b> (${paymentType === 'cash' ? 'Naqd' : 'Karta'})\n`;
    if (note) text += `📝 Izoh: ${note}\n`;
    if (student.payments.length > 1) text += `📊 Jami shu oy: <b>${fmt(totalMonth)}</b>\n`;
    text += `\n💼 Balans: Naqd ${fmt(balance.cash)} | Karta ${fmt(balance.card)} | <b>Jami ${fmt(balance.total)}</b>`;
    text += `\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Payment report xatolik:', e.message); }
}

// ── CHIQIM HISOBOTI ───────────────────────────────────────────
async function sendExpenseReport({ category, subcategory, staffName, monthYear, amount, paymentType, note }) {
  try {
    const bot = getBot(); if (!bot) return;
    const channelId = await getChannelId('report_channel_id');
    if (!channelId) return;
    const balance = await getBalance();

    let catStr = category === 'staff' ? `Hodim maoshi: ${staffName}` : category === 'communal' ? `Komunal: ${subcategory}` : 'Boshqa';
    let text = `📤 <b>Chiqim amalga oshirildi</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `📋 Tur: ${catStr}\n`;
    if (monthYear) text += `📅 Oy: ${monthYear}\n`;
    text += `💵 Summa: <b>${fmt(amount)}</b> (${paymentType === 'cash' ? 'Naqd' : 'Karta'})\n`;
    if (note) text += `📝 Izoh: ${note}\n`;
    text += `\n💼 Balans: Naqd ${fmt(balance.cash)} | Karta ${fmt(balance.card)} | <b>Jami ${fmt(balance.total)}</b>`;
    text += `\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Expense report xatolik:', e.message); }
}

// ── KONVERSIYA HISOBOTI ───────────────────────────────────────
async function sendConversionReport({ type, fromAmount, toAmount }) {
  try {
    const bot = getBot(); if (!bot) return;
    const channelId = await getChannelId('report_channel_id');
    if (!channelId) return;
    const balance = await getBalance();

    const typeStr = type === 'cash_to_card' ? 'Naqd → Karta' : 'Karta → Naqd';
    let text = `🔄 <b>Konversiya</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `Tur: ${typeStr}\n`;
    text += `Berildi: ${fmt(fromAmount)} | Olindi: ${fmt(toAmount)}\n`;
    text += `💼 Balans: Naqd ${fmt(balance.cash)} | Karta ${fmt(balance.card)}\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Conversion report xatolik:', e.message); }
}

// ── DAVOMAT HISOBOTI (kanal) ─────────────────────────────────
async function sendAttendanceReport({ groupId, scheduleId, teacherName, lessonDate }) {
  try {
    const bot = getBot(); if (!bot) return;
    const channelId = await getChannelId('attendance_channel_id');
    if (!channelId) return;

    const atts = await prisma.attendance.findMany({
      where: { scheduleId },
      include: { groupStudent: { include: { student: { include: { applicant: { select: { firstName: true, lastName: true } } } } } } }
    });
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } });
    const present = atts.filter(a => a.isPresent);
    const absent = atts.filter(a => !a.isPresent);
    const dateStr = moment(lessonDate).tz(TZ).format('DD.MM.YYYY');

    let text = `📋 <b>Davomat hisoboti</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `📚 ${group.subject.name} | ${group.name}\n`;
    text += `👨‍🏫 O'qituvchi: ${teacherName}\n`;
    text += `📅 Sana: ${dateStr}\n`;
    text += `✅ Keldi: <b>${present.length}</b> | ❌ Kelmadi: <b>${absent.length}</b>\n`;

    if (absent.length > 0 && absent.length <= 10) {
      text += `\n❌ Kelmadi:\n`;
      absent.forEach(a => { text += `• ${a.groupStudent.student.applicant.firstName} ${a.groupStudent.student.applicant.lastName}\n`; });
    }
    text += `🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Attendance report xatolik:', e.message); }
}

// ── O'QUVCHIGA DAVOMAT XABARI ────────────────────────────────
async function sendAttendanceNotifToStudent({ groupStudentId, scheduleId, isPresent }) {
  try {
    const bot = getBot(); if (!bot) return;
    const gs = await prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      include: {
        student: { include: { applicant: { select: { telegramId: true, firstName: true } } } },
        group: { include: { subject: true } }
      }
    });
    if (!gs?.student.applicant.telegramId) return;

    const sch = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    const dateStr = moment(sch.lessonDate).tz(TZ).format('DD.MM.YYYY');
    const status = isPresent ? '✅ Keldingiz' : '❌ Kelmadingiz';

    const text = `${status}\n📚 ${gs.group.subject.name} — ${gs.group.name}\n📅 ${dateStr} ${sch.startTime}`;
    await bot.telegram.sendMessage(gs.student.applicant.telegramId.toString(), text).catch(() => {});
  } catch(e) {}
}

// ── O'QUVCHIGA TO'LOV XABARI ─────────────────────────────────
async function sendPaymentNotifToStudent({ studentId, groupId, monthYear, amount, paymentType }) {
  try {
    const bot = getBot(); if (!bot) return;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { applicant: { select: { telegramId: true, firstName: true } } }
    });
    if (!student?.applicant.telegramId) return;

    const group = groupId ? await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } }) : null;
    let text = `💰 To'lov qabul qilindi!\n`;
    if (group) text += `📚 ${group.subject.name} — ${group.name}\n`;
    if (monthYear) text += `📅 Oy: ${monthYear}\n`;
    text += `💵 Summa: <b>${fmt(amount)}</b> (${paymentType === 'cash' ? 'Naqd' : 'Karta'})`;

    await bot.telegram.sendMessage(student.applicant.telegramId.toString(), text, { parse_mode: 'HTML' }).catch(() => {});
  } catch(e) {}
}

// ── QARZDORLARGA XABAR ────────────────────────────────────────
async function sendDebtNotif(groupId, monthYear) {
  try {
    const bot = getBot(); if (!bot) return;
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } });
    const gs = await prisma.groupStudent.findMany({
      where: { groupId, status: 'active' },
      include: {
        student: {
          include: {
            applicant: { select: { telegramId: true, firstName: true, lastName: true } },
            payments: { where: { groupId, monthYear } }
          }
        }
      }
    });

    let sent = 0, noTelegram = 0;
    for (const g of gs) {
      const paid = g.student.payments.reduce((s, p) => s + p.amount, BigInt(0));
      if (paid > BigInt(0)) continue; // To'lagan

      if (!g.student.applicant.telegramId) { noTelegram++; continue; }

      const text = `⚠️ ${g.student.applicant.firstName}, ${monthYear} oyiga ${group.subject.name} darsi uchun to'lov kutilmoqda.\nIltimos, to'lovni amalga oshiring.`;
      try {
        await bot.telegram.sendMessage(g.student.applicant.telegramId.toString(), text);
        sent++;
      } catch(e) {}
    }
    return { sent, noTelegram };
  } catch(e) { return { sent: 0, noTelegram: 0 }; }
}

// ── QABUL HISOBOTI ────────────────────────────────────────────
async function sendApplicantsReport() {
  try {
    const bot = getBot(); if (!bot) return;
    const channelId = await getChannelId('applicant_channel_id');
    if (!channelId) return;

    const total = await prisma.applicant.count({ where: { status: 'waiting' } });
    if (total === 0) return;

    const text = `📋 <b>Kutayotgan o'quvchilar: ${total} ta</b>\n🕐 ${ts()}`;
    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch(e) {}
}

module.exports = {
  setNotifBot, getBot, getBalance,
  sendPaymentReport, sendExpenseReport, sendConversionReport,
  sendAttendanceReport, sendAttendanceNotifToStudent,
  sendPaymentNotifToStudent, sendDebtNotif, sendApplicantsReport
};
