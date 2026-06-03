require('dotenv').config();
const { Telegraf } = require('telegraf');
const prisma = require('../db');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

const bot = new Telegraf(process.env.BOT_TOKEN);

function fmt(n) { return Number(n).toLocaleString('ru-RU') + " so'm"; }
function ts() { return moment().tz(TZ).format('HH:mm | DD.MM.YYYY'); }

async function getBalance() {
  const [payments, expenses, conversions] = await Promise.all([
    prisma.payment.findMany({ select: { amount: true, paymentType: true } }),
    prisma.expense.findMany({ select: { amount: true, paymentType: true } }),
    prisma.conversion.findMany()
  ]);
  let cash = BigInt(0), card = BigInt(0);
  for (const p of payments) {
    if (p.paymentType === 'cash') cash += p.amount;
    else if (p.paymentType === 'card') card += p.amount;
  }
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

async function sendPaymentReport({ studentId, groupId, monthYear, amount, paymentType, note }) {
  try {
    const channelId = await getChannelId('report_channel_id');
    if (!channelId) return;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        applicant: true,
        payments: { where: { groupId, monthYear }, orderBy: { createdAt: 'asc' } }
      }
    });
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } });
    const balance = await getBalance();

    const fullName = `${student.applicant.firstName} ${student.applicant.lastName}`;
    const prevPayments = student.payments.slice(0, -1);
    const totalMonth = student.payments.reduce((s, p) => s + p.amount, BigInt(0));

    let text = `💰 <b>To'lov qabul qilindi</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `👤 O'quvchi: <b>${fullName}</b>\n`;
    text += `📚 Fan: ${group.subject.name} | Guruh: ${group.name}\n`;
    text += `📅 Oy: ${monthYear}\n`;
    text += `💵 Summa: <b>${fmt(amount)}</b> (${paymentType === 'cash' ? 'Naqd' : 'Karta'})\n`;
    if (note) text += `📝 Izoh: ${note}\n`;
    if (prevPayments.length > 0) {
      text += `\n📋 <b>Oldingi to'lovlar (${monthYear}):</b>\n`;
      for (const p of prevPayments) {
        text += `  • ${moment(p.createdAt).tz(TZ).format('DD.MM HH:mm')} — ${fmt(p.amount)}\n`;
      }
      text += `📊 Jami shu oy: <b>${fmt(totalMonth)}</b>\n`;
    }
    text += `\n💼 <b>Joriy balans:</b>\n`;
    text += `  Naqd: ${fmt(balance.cash)} | Karta: ${fmt(balance.card)} | Jami: <b>${fmt(balance.total)}</b>\n`;
    text += `\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Payment report xatolik:', e.message); }
}

async function sendExpenseReport({ category, subcategory, staffName, monthYear, amount, paymentType, note }) {
  try {
    const channelId = await getChannelId('report_channel_id');
    if (!channelId) return;
    const balance = await getBalance();

    let catStr = category === 'staff' ? `Hodim maoshi: ${staffName}` : category === 'communal' ? `Komunal: ${subcategory}` : 'Boshqa';
    let text = `📤 <b>Chiqim amalga oshirildi</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `🗂 Tur: ${catStr}\n`;
    if (monthYear) text += `📅 Oy: ${monthYear}\n`;
    text += `💸 Summa: <b>${fmt(amount)}</b> (${paymentType === 'cash' ? 'Naqd' : 'Karta'})\n`;
    if (note) text += `📝 Izoh: ${note}\n`;
    text += `\n💼 <b>Joriy balans:</b>\n`;
    text += `  Naqd: ${fmt(balance.cash)} | Karta: ${fmt(balance.card)} | Jami: <b>${fmt(balance.total)}</b>\n`;
    text += `\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Expense report xatolik:', e.message); }
}

async function sendConversionReport({ type, fromAmount, toAmount }) {
  try {
    const channelId = await getChannelId('report_channel_id');
    if (!channelId) return;
    const balance = await getBalance();
    const isCTC = type === 'cash_to_card';

    let text = `🔄 <b>Konversiya amalga oshirildi</b>\n━━━━━━━━━━━━━━━━\n`;
    text += isCTC
      ? `📤 Naqd berildi: <b>${fmt(fromAmount)}</b>\n📥 Karta qabul: <b>${fmt(toAmount)}</b>\n`
      : `📤 Kartadan olindi: <b>${fmt(fromAmount)}</b>\n📥 Naqd olindi: <b>${fmt(toAmount)}</b>\n`;
    text += `\n💼 <b>Yangi balans:</b>\n`;
    text += `  Naqd: ${fmt(balance.cash)} | Karta: ${fmt(balance.card)} | Jami: <b>${fmt(balance.total)}</b>\n`;
    text += `\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Conversion report xatolik:', e.message); }
}

async function sendAttendanceReport({ groupId, scheduleId, teacherName, lessonDate }) {
  try {
    const channelId = await getChannelId('attendance_channel_id');
    if (!channelId) return;

    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } });
    const attendances = await prisma.attendance.findMany({
      where: { scheduleId },
      include: { groupStudent: { include: { student: { include: { applicant: true } } } } }
    });

    const present = attendances.filter(a => a.isPresent);
    const absent = attendances.filter(a => !a.isPresent);

    let text = `📋 <b>Davomat olindi</b>\n━━━━━━━━━━━━━━━━\n`;
    text += `📚 Guruh: <b>${group.name}</b> (${group.subject.name})\n`;
    text += `👤 O'qituvchi: ${teacherName}\n`;
    text += `📅 Sana: ${moment(lessonDate).tz(TZ).format('DD.MM.YYYY')}\n`;
    text += `\n✅ Keldi: <b>${present.length} ta</b>\n`;
    text += `❌ Kelmadi: <b>${absent.length} ta</b>\n`;
    text += `👥 Jami: ${attendances.length} ta\n`;

    if (absent.length > 0) {
      text += `\n❌ <b>Kelmagan o'quvchilar:</b>\n`;
      absent.forEach((a, i) => {
        const n = `${a.groupStudent.student.applicant.firstName} ${a.groupStudent.student.applicant.lastName}`;
        text += `  ${i + 1}. ${n}\n`;
      });
    }
    text += `\n🕐 ${ts()}`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });

  } catch (e) { console.error('Attendance report xatolik:', e.message); }
}

async function sendApplicantsReport() {
  try {
    const channelId = await getChannelId('applicant_channel_id');
    if (!channelId) return;

    const applicants = await prisma.applicant.findMany({
      where: { status: 'waiting' },
      include: { applicantSubjects: { include: { subject: true } } },
      orderBy: { createdAt: 'desc' }
    });
    if (!applicants.length) return;

    let text = `📌 <b>Guruhga biriktirilmagan o'quvchilar</b>\n🕐 ${ts()}\n━━━━━━━━━━━━━━━━\n\n`;
    applicants.forEach((a, i) => {
      const phone = a.phoneSelf || a.phoneFather || a.phoneMother || '—';
      const subs = a.applicantSubjects.map(s => s.subject.name).join(', ');
      text += `${i + 1}. <b>${a.firstName} ${a.lastName}</b>\n   📚 ${subs}\n   📞 ${phone}\n\n`;
    });
    text += `👥 Jami: <b>${applicants.length} ta</b> o'quvchi kutmoqda`;

    await bot.telegram.sendMessage(channelId, text, { parse_mode: 'HTML' });
  } catch (e) { console.error('Applicants report xatolik:', e.message); }
}

// O'quvchiga to'lov haqida bot xabari
async function sendPaymentNotifToStudent({ studentId, groupId, monthYear, amount, paymentType }) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { applicant: true }
    });
    const group = await prisma.group.findUnique({
      where: { id: groupId }, include: { subject: true }
    });
    if (!student || !group) return;
    const a = student.applicant;
    const tgIds = [a.telegramId].filter(Boolean);
    if (!tgIds.length) return;

    const text = `To'lov qabul qilindi!\n\n` +
      `O'quvchi: ${a.firstName} ${a.lastName}\n` +
      `Fan: ${group.subject.name} | Guruh: ${group.name}\n` +
      `Oy: ${monthYear}\n` +
      `Summa: ${fmt(amount)} (${paymentType === 'cash' ? 'Naqd' : 'Karta'})\n\n` +
      `Rahmat! Savollar uchun qabulxonaga murojaat qiling.`;

    for (const tgId of tgIds) {
      try { await bot.telegram.sendMessage(tgId.toString(), text); } catch(e) {}
    }
  } catch (e) { console.error('Student payment notif xatolik:', e.message); }
}

// Davomat olinganidan 30 daqiqa keyin o'quvchiga xabar
async function sendAttendanceNotifToStudents(scheduleId) {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        group: {
          include: {
            subject: true,
            groupStudents: {
              where: { status: 'active' },
              include: {
                student: { include: { applicant: true } },
                attendances: { where: { scheduleId } }
              }
            }
          }
        }
      }
    });
    if (!schedule) return;

    for (const gs of schedule.group.groupStudents) {
      const att = gs.attendances[0];
      const a = gs.student.applicant;
      const tgId = a.telegramId;
      if (!tgId) continue;

      const dateStr = moment(schedule.lessonDate).tz(TZ).format('DD.MM.YYYY');
      let text;
      if (att?.isPresent) {
        text = `Davomat: ${schedule.group.name}\n\n` +
          `${a.firstName} ${a.lastName} bugun (${dateStr}) darsga keldi.\n` +
          `Fan: ${schedule.group.subject.name}\n` +
          `Vaqt: ${schedule.startTime}-${schedule.endTime}`;
      } else {
        text = `Davomat: ${schedule.group.name}\n\n` +
          `${a.firstName} ${a.lastName} bugun (${dateStr}) darsga kelmadi.\n` +
          `Fan: ${schedule.group.subject.name}\n` +
          `Vaqt: ${schedule.startTime}-${schedule.endTime}\n\n` +
          `Agar xato bo'lsa, qabulxona bilan bog'laning.`;
      }
      try { await bot.telegram.sendMessage(tgId.toString(), text); } catch(e) {}
    }
  } catch (e) { console.error('Attendance notif xatolik:', e.message); }
}

// Qarzdorlarga bot xabari
async function sendDebtNotif({ studentId, groupId, monthYear, remainingAmount }) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId }, include: { applicant: true }
    });
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { subject: true } });
    if (!student || !group) return;
    const a = student.applicant;
    if (!a.telegramId) return;

    const text = `To'lov eslatmasi\n\n` +
      `${a.firstName} ${a.lastName},\n` +
      `${group.subject.name} (${group.name}) uchun ${monthYear} oyi to'lovi qolmoqda.\n` +
      (remainingAmount ? `Qoldiq summa: ${fmt(remainingAmount)}\n` : '') +
      `\nIltimos, to'lovni amalga oshiring yoki qabulxona bilan bog'laning.`;

    try { await bot.telegram.sendMessage(a.telegramId.toString(), text); } catch(e) {}
  } catch (e) { console.error('Debt notif xatolik:', e.message); }
}

// Bitta o'quvchiga davomat xabari (groupStudentId bilan)
async function sendAttendanceNotifToStudent({ groupStudentId, scheduleId, isPresent }) {
  try {
    const gs = await prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      include: {
        student: { include: { applicant: true } },
        group: { include: { subject: true } }
      }
    });
    if (!gs) return;
    const a = gs.student.applicant;
    if (!a.telegramId) return;

    // Schedule ni groupStudent bilan birga olamiz (alohida query yo'q)
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { lessonDate: true, startTime: true, endTime: true }
    });
    if (!schedule) return;

    const dateStr = moment(schedule.lessonDate).tz(TZ).format('DD.MM.YYYY');
    const subjectName = gs.group.subject.name;

    let text;
    if (isPresent) {
      text = `✅ Davomat\n\n` +
        `${a.firstName} ${a.lastName} bugun (${dateStr}) ${subjectName} darsiga keldi.\n` +
        `Vaqt: ${schedule.startTime}–${schedule.endTime}`;
    } else {
      text = `❌ Davomat\n\n` +
        `${a.firstName} ${a.lastName} bugun (${dateStr}) ${subjectName} darsiga kelmadi.\n` +
        `Vaqt: ${schedule.startTime}–${schedule.endTime}\n\n` +
        `Agar xato bo'lsa, qabulxona bilan bog'laning.`;
    }

    try { await bot.telegram.sendMessage(a.telegramId.toString(), text); } catch(e) {}
  } catch (e) { console.error('Attendance single notif xatolik:', e.message); }
}


module.exports = {
  sendPaymentReport, sendExpenseReport, sendConversionReport,
  sendAttendanceReport, sendApplicantsReport, getBalance,
  sendPaymentNotifToStudent, sendAttendanceNotifToStudents, sendDebtNotif,
  sendAttendanceNotifToStudent
};
