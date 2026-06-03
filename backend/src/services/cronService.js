// backend/src/services/cronService.js
// 7-modul: Avtomatik oylik narx yechish cron + qabul hisoboti

const cron = require('node-cron');
const prisma = require('../db');
const { sendApplicantsReport } = require('./notificationService');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

// ── Pricing carry-forward helper ───────────────────────────────────────────────
async function getPrice(studentId, groupId, monthYear) {
  const key = `price:${studentId}:${groupId}:${monthYear}`;
  const s = await prisma.settings.findUnique({ where: { key } });
  if (s) return parseInt(s.value);
  // carry-forward: oldingi oylardan eng so'nggisi
  const all = await prisma.settings.findMany({
    where: { key: { startsWith: `price:${studentId}:${groupId}:` } }
  });
  const prev = all
    .map(x => { const p = x.key.split(':'); return { month: p[3], amount: parseInt(x.value) }; })
    .filter(x => x.month < monthYear)
    .sort((a, b) => b.month.localeCompare(a.month));
  return prev.length > 0 ? prev[0].amount : null;
}

// ── Oy uchun narxni muhrlaash (lock) ─────────────────────────────────────────
// Agar shu oy uchun narx allaqachon belgilangan bo'lsa — o'zgarmaydi.
// Belgilanmagan bo'lsa — carry-forward qiymatni joriy oy sifatida yozadi.
async function lockPriceForMonth(studentId, groupId, monthYear) {
  const key = `price:${studentId}:${groupId}:${monthYear}`;
  const existing = await prisma.settings.findUnique({ where: { key } });
  if (existing) return parseInt(existing.value); // allaqachon muhrlangan

  // Carry-forward dan olamiz
  const all = await prisma.settings.findMany({
    where: { key: { startsWith: `price:${studentId}:${groupId}:` } }
  });
  const prev = all
    .map(x => { const p = x.key.split(':'); return { month: p[3], amount: parseInt(x.value) }; })
    .filter(x => x.month < monthYear)
    .sort((a, b) => b.month.localeCompare(a.month));

  if (prev.length === 0) return null; // hech qanday narx yo'q

  const lockedPrice = prev[0].amount;
  // Joriy oy uchun muhrlaymiz
  await prisma.settings.create({ data: { key, value: String(lockedPrice) } });
  return lockedPrice;
}

// ── Avtomatik oylik balans yechish ────────────────────────────────────────────
// Bu funksiya har oyning belgilangan sanasida ishga tushadi.
// Har bir faol groupStudent uchun:
//   1. Joriy oy narxini muhrlaymiz (lock)
//   2. Bu oy uchun allaqachon payment bor emasligini tekshiramiz
//   3. Agar narx belgilangan bo'lsa va to'lov qilinmagan bo'lsa —
//      "auto_deduction" turida payment yozamiz (virtual, balansdan ayirish uchun)
async function runMonthlyDeduction() {
  const now = moment().tz(TZ);
  const currentMonth = now.format('YYYY-MM');

  console.log(`[CRON] Oylik narx yechish boshlandi: ${currentMonth}`);

  try {
    // Barcha faol groupStudentlar
    const groupStudents = await prisma.groupStudent.findMany({
      where: { status: 'active' },
      include: {
        student: { select: { id: true } },
        group: { select: { id: true, subjectId: true } }
      }
    });

    let processed = 0, skipped = 0, errors = 0;

    for (const gs of groupStudents) {
      try {
        const sid = gs.student.id;
        const gid = gs.groupId;

        // Narxni muhrlaymiz
        const price = await lockPriceForMonth(sid, gid, currentMonth);
        if (!price) { skipped++; continue; }

        // Bu oy uchun allaqachon to'lov bor emasligini tekshiramiz
        const existingPayment = await prisma.payment.findFirst({
          where: {
            studentId: sid,
            groupId: gid,
            monthYear: currentMonth,
            note: 'auto_deduction'
          }
        });
        if (existingPayment) { skipped++; continue; }

        // Balansdan yechish uchun "payment" yozamiz
        // (Bu haqiqiy to'lov emas — balansni kamaytirish uchun)
        // Agar haqiqiy to'lov qilingan bo'lsa, duplicate bo'lmaydi
        // chunki haqiqiy to'lovlar note:'auto_deduction' bo'lmaydi
        await prisma.payment.create({
          data: {
            studentId: sid,
            groupId: gid,
            monthYear: currentMonth,
            amount: BigInt(price),
            paymentType: 'balance_deduction', // virtual
            isPartial: false,
            note: 'auto_deduction'
          }
        });
        processed++;
      } catch (e) {
        console.error(`[CRON] Student ${gs.student.id} guruh ${gs.groupId} xatolik:`, e.message);
        errors++;
      }
    }

    console.log(`[CRON] Oylik yechish tugadi: ${processed} ta yechildi, ${skipped} ta o'tkazib yuborildi, ${errors} ta xatolik`);
  } catch (e) {
    console.error('[CRON] Oylik yechish xatolik:', e.message);
  }
}

// ── Cron start ────────────────────────────────────────────────────────────────
function start() {
  // Qabul hisoboti: har kuni 08:00 va 16:00
  cron.schedule('0 8 * * *', async () => {
    console.log('Cron 08:00: qabul hisoboti...');
    await sendApplicantsReport();
  }, { timezone: TZ });

  cron.schedule('0 16 * * *', async () => {
    console.log('Cron 16:00: qabul hisoboti...');
    await sendApplicantsReport();
  }, { timezone: TZ });

  // Oylik narx yechish: har kuni soat 00:05 da tekshiriladi.
  // Faqat Settings da belgilangan sana kelganda ishlaydi.
  cron.schedule('5 0 * * *', async () => {
    try {
      // Belgilangan sanani settings dan olamiz
      const setting = await prisma.settings.findUnique({
        where: { key: 'monthly_deduction_day' }
      });
      if (!setting) return; // sana sozlanmagan

      const deductionDay = parseInt(setting.value);
      if (isNaN(deductionDay) || deductionDay < 1 || deductionDay > 28) return;

      const today = moment().tz(TZ).date();
      if (today === deductionDay) {
        console.log(`[CRON] Oylik yechish sanasi keldi (${deductionDay}-san). Ishga tushirilmoqda...`);
        await runMonthlyDeduction();
      }
    } catch (e) {
      console.error('[CRON] Oylik yechish trigger xatolik:', e.message);
    }
  }, { timezone: TZ });

  console.log('✅ Cron service ishga tushdi');
}

module.exports = { start, runMonthlyDeduction, lockPriceForMonth };
