require('dotenv').config();
const prisma = require('../db');

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, '').replace(/^0/, '998');
}

// Telefon orqali hodimni topish (phone field)
async function findStaffByPhone(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const last9 = norm.slice(-9);
  return await prisma.user.findFirst({
    where: {
      OR: [
        { phone: { contains: last9 } }
      ]
    }
  });
}

// Telefon orqali applicant topish
async function findApplicantByPhone(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const last9 = norm.slice(-9);
  return await prisma.applicant.findFirst({
    where: {
      OR: [
        { phoneSelf: { contains: last9 } },
        { phoneFather: { contains: last9 } },
        { phoneMother: { contains: last9 } }
      ]
    },
    include: {
      student: {
        include: {
          groupStudents: {
            where: { status: 'active' },
            include: { group: { include: { subject: true } } }
          }
        }
      }
    }
  });
}

async function sendStudentWelcome(ctx, applicant) {
  const groups = applicant.student?.groupStudents || [];
  let text = `Xush kelibsiz, ${applicant.firstName} ${applicant.lastName}!\n\n`;
  if (groups.length > 0) {
    text += `Qatnashayotgan guruhlaringiz:\n`;
    for (const gs of groups) {
      text += `• ${gs.group.name} — ${gs.group.subject.name}\n`;
    }
    text += `\nTo'lov va davomat haqida xabarlar shu botga keladi.`;
  } else {
    text += `Hozircha hech qaysi guruhga biriktirilmagansiz.\nQabulxona bilan bog'laning.`;
  }
  return ctx.reply(text);
}

function crmButton(staff) {
  const url = staff.role === 'teacher'
    ? `${process.env.MINI_APP_URL}/teacher.html`
    : `${process.env.MINI_APP_URL}/reception.html`;
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '📊 Botni ochish', web_app: { url } }]]
    }
  };
}

module.exports = function setupBot(bot) {

  bot.start(async (ctx) => {
    try {
      const tgUser = ctx.from;
      const telegramId = BigInt(tgUser.id);
      const adminId = BigInt(process.env.ADMIN_TELEGRAM_ID || '0');

      // 1. ADMIN
      if (telegramId === adminId) {
        await prisma.user.upsert({
          where: { telegramId },
          update: { firstName: tgUser.first_name, lastName: tgUser.last_name || '' },
          create: {
            telegramId, role: 'admin',
            firstName: tgUser.first_name,
            lastName: tgUser.last_name || '',
            username: tgUser.username || ''
          }
        });
        return ctx.reply(
          `Ta'lim Plus botiga xush kelibsiz!\n\nAdmin panelidan foydalanish uchun quyidagi tugmani bosing.`,
          { reply_markup: { inline_keyboard: [[{ text: '🛡 Admin panelni ochish', web_app: { url: `${process.env.MINI_APP_URL}/admin.html` } }]] } }
        );
      }

      // 2. HODIM — telegramId bilan topish
      const staffByTgId = await prisma.user.findUnique({ where: { telegramId } });
      if (staffByTgId) {
        return ctx.reply(
          `Ta'lim Plus botiga xush kelibsiz, ${staffByTgId.firstName}!\n\nCRM tizimidan foydalanish uchun bosing.`,
          crmButton(staffByTgId)
        );
      }

      // 3. APPLICANT — telegramId bilan
      const knownApplicant = await prisma.applicant.findFirst({
        where: { telegramId },
        include: {
          student: {
            include: {
              groupStudents: {
                where: { status: 'active' },
                include: { group: { include: { subject: true } } }
              }
            }
          }
        }
      });
      if (knownApplicant) {
        return sendStudentWelcome(ctx, knownApplicant);
      }

      // 4. YANGI — telefon raqam so'raymiz
      return ctx.reply(
        `Assalomu alaykum!\n\nTa'lim Plus botiga xush kelibsiz.\nDavom etish uchun telefon raqamingizni ulashing:`,
        {
          reply_markup: {
            keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    } catch (err) {
      console.error('Start xatolik:', err);
      ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.").catch(() => {});
    }
  });

  bot.on('contact', async (ctx) => {
    try {
      const contact = ctx.message.contact;
      const tgUser = ctx.from;
      const telegramId = BigInt(tgUser.id);

      // Faqat o'z raqamini ulasha oladi
      if (contact.user_id && BigInt(contact.user_id) !== telegramId) {
        return ctx.reply("Iltimos, faqat o'z raqamingizni ulashing.", {
          reply_markup: {
            keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        });
      }

      // 1. HODIM (phone field bo'yicha)
      const staffByPhone = await findStaffByPhone(contact.phone_number);
      if (staffByPhone) {
        // Eski telegramId ni tozalaymiz (agar boshqa birov ishlatgan bo'lsa)
        await prisma.user.updateMany({
          where: { telegramId, id: { not: staffByPhone.id } },
          data: { telegramId: null }
        }).catch(() => {});
        // Yangi telegramId ni bog'laymiz
        await prisma.user.update({
          where: { id: staffByPhone.id },
          data: { telegramId, username: tgUser.username || '' }
        });
        await ctx.reply('✅ Tizimga muvaffaqiyatli kirdingiz!', { reply_markup: { remove_keyboard: true } });
        return ctx.reply(
          `Ta'lim Plus botiga xush kelibsiz, ${staffByPhone.firstName}!\n\nCRM tizimidan foydalanish uchun bosing.`,
          crmButton(staffByPhone)
        );
      }

      // 2. O'QUVCHI / OTA-ONA (phoneSelf/phoneFather/phoneMother bo'yicha)
      const applicant = await findApplicantByPhone(contact.phone_number);
      if (applicant) {
        // Eski telegramId ni tozalaymiz
        await prisma.applicant.updateMany({
          where: { telegramId, id: { not: applicant.id } },
          data: { telegramId: null }
        }).catch(() => {});
        await prisma.applicant.update({
          where: { id: applicant.id },
          data: { telegramId }
        });
        await ctx.reply('✅ Telefon raqamingiz tasdiqlandi!', { reply_markup: { remove_keyboard: true } });
        return sendStudentWelcome(ctx, applicant);
      }

      // 3. BAZADA YO'Q
      await ctx.reply("Telefon raqamingiz qabul qilindi!", { reply_markup: { remove_keyboard: true } });
      const recUser = process.env.RECEPTIONIST_USERNAME || 'admin';
      return ctx.reply(
        `O'quv Markazimizga xush kelibsiz!\n\nQabulga yozilish yoki ma'lumot olish uchun:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Qabulga yozilish', web_app: { url: `${process.env.MINI_APP_URL}/public/enroll.html` } }],
              [{ text: "📞 Qabulxona bilan bog'lanish", url: `https://t.me/${recUser}` }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('Contact xatolik:', err);
      ctx.reply('Xatolik yuz berdi.').catch(() => {});
    }
  });

  bot.on('message', async (ctx) => {
    try {
      const telegramId = BigInt(ctx.from.id);
      const adminId = BigInt(process.env.ADMIN_TELEGRAM_ID || '0');
      if (telegramId === adminId) {
        return ctx.reply('Admin paneli:', {
          reply_markup: { inline_keyboard: [[{ text: '🛡 Admin panelni ochish', web_app: { url: `${process.env.MINI_APP_URL}/admin.html` } }]] }
        });
      }
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (user) return ctx.reply('CRM:', crmButton(user));
      const applicant = await prisma.applicant.findFirst({ where: { telegramId } });
      if (applicant) return ctx.reply('Davom etish uchun /start bosing.');
      ctx.reply('Iltimos /start bosing.');
    } catch (e) { console.error('Message xatolik:', e); }
  });
};
