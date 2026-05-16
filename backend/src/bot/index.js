require('dotenv').config();
const prisma = require('../db');

// Singleton
let _bot;
function getBot() { return _bot; }
function setBot(b) { _bot = b; }

function normalizePhone(p) {
  if (!p) return null;
  return p.replace(/\D/g, '').replace(/^0/, '998');
}

async function findStaffByPhone(phone) {
  const last9 = normalizePhone(phone)?.slice(-9);
  if (!last9) return null;
  return prisma.user.findFirst({ where: { phone: { contains: last9 } } });
}

async function findApplicantsByPhone(phone) {
  const last9 = normalizePhone(phone)?.slice(-9);
  if (!last9) return [];
  return prisma.applicant.findMany({
    where: { OR: [
      { phoneSelf: { contains: last9 } },
      { phoneFather: { contains: last9 } },
      { phoneMother: { contains: last9 } }
    ]},
    include: {
      student: {
        include: { groupStudents: { where: { status: 'active' }, include: { group: { include: { subject: true } } } } }
      }
    }
  });
}

function staffBtn(staff) {
  const urls = {
    admin: `${process.env.MINI_APP_URL}/admin.html`,
    teacher: `${process.env.MINI_APP_URL}/teacher.html`,
    receptionist: `${process.env.MINI_APP_URL}/reception.html`,
  };
  const labels = {
    admin: "🛡️ Admin paneli",
    teacher: "👨‍🏫 O'qituvchi paneli",
    receptionist: "📋 Qabulxona",
  };
  return { reply_markup: { inline_keyboard: [[{ text: labels[staff.role] || '📊 CRM', web_app: { url: urls[staff.role] } }]] } };
}

function studentBtn(a) {
  if (!a?.student?.id) return {};
  return { reply_markup: { inline_keyboard: [[{ text: '🎓 Profilim', web_app: { url: `${process.env.MINI_APP_URL}/public/student.html?studentId=${a.student.id}` } }]] } };
}

async function sendStudentWelcome(ctx, applicants) {
  if (!Array.isArray(applicants)) applicants = [applicants];
  let text = '', firstWithStudent = null;

  if (applicants.length === 1) {
    const a = applicants[0];
    const groups = a.student?.groupStudents || [];
    text = `🎓 Xush kelibsiz, <b>${a.firstName} ${a.lastName}</b>!\n\n`;
    if (groups.length) {
      firstWithStudent = a;
      text += `📚 <b>Guruhlar:</b>\n`;
      groups.forEach(gs => { text += `• ${gs.group.name} — ${gs.group.subject.name}\n`; });
      text += `\n👇 Profilingizni ochish uchun bosing:`;
    } else {
      text += `Hali hech qaysi guruhga biriktirilmagansiz.\nQabulxona bilan bog'laning.`;
    }
  } else {
    text = `👨‍👩‍👧‍👦 <b>Farzandlaringiz:</b>\n\n`;
    for (const a of applicants) {
      const groups = a.student?.groupStudents || [];
      if (!firstWithStudent && groups.length) firstWithStudent = a;
      text += `👤 <b>${a.firstName} ${a.lastName}</b>\n`;
      groups.forEach(gs => { text += `  • ${gs.group.name} — ${gs.group.subject.name}\n`; });
      if (!groups.length) text += `  Guruh yo'q\n`;
      text += '\n';
    }
    // Har bir farzand uchun alohida tugma (ota-ona uchun)
    if (applicants.some(a => a.student?.id)) {
      return ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: applicants
            .filter(a => a.student?.id)
            .map(a => [{ text: `🎓 ${a.firstName} ${a.lastName}`, web_app: { url: `${process.env.MINI_APP_URL}/public/student.html?studentId=${a.student.id}` } }])
        }
      });
    }
  }

  if (firstWithStudent) return ctx.reply(text, { parse_mode: 'HTML', ...studentBtn(firstWithStudent) });
  return ctx.reply(text, { parse_mode: 'HTML' });
}

module.exports = function setupBot(bot) {
  setBot(bot);

  // Chat menu tugmasi (bot bar) — barcha foydalanuvchilar uchun
  if (process.env.MINI_APP_URL) {
    bot.telegram.setChatMenuButton({
      menuButton: { type: 'web_app', text: "🏫 Ta'lim Plus", web_app: { url: `${process.env.MINI_APP_URL}/launch` } }
    }).catch(e => console.error('Menu button xatolik:', e.message));
  }

  // ── /start ────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    try {
      const tgUser = ctx.from;
      const telegramId = BigInt(tgUser.id);
      const adminId = BigInt(process.env.ADMIN_TELEGRAM_ID || '0');

      // Admin
      if (telegramId === adminId) {
        await prisma.user.upsert({
          where: { telegramId },
          update: { firstName: tgUser.first_name, lastName: tgUser.last_name || '' },
          create: { telegramId, role: 'admin', firstName: tgUser.first_name, lastName: tgUser.last_name || '', username: tgUser.username || '' }
        });
        return ctx.reply(`🛡️ <b>Admin paneli</b>\n\nXush kelibsiz, <b>${tgUser.first_name}</b>!`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🛡️ Admin panelini ochish', web_app: { url: `${process.env.MINI_APP_URL}/admin.html` } }]] }
        });
      }

      // Hodim
      const staff = await prisma.user.findUnique({ where: { telegramId } });
      if (staff) {
        const roleName = { teacher: "O'qituvchi", receptionist: 'Qabulxona xodimi' }[staff.role] || '';
        return ctx.reply(`👋 Xush kelibsiz, <b>${staff.firstName}</b>!\n${roleName} paneliga kirish:`, { parse_mode: 'HTML', ...staffBtn(staff) });
      }

      // Taniqli o'quvchi
      const knownApplicants = await prisma.applicant.findMany({
        where: { telegramId },
        include: { student: { include: { groupStudents: { where: { status: 'active' }, include: { group: { include: { subject: true } } } } } } }
      });
      if (knownApplicants.length) return sendStudentWelcome(ctx, knownApplicants);

      // Yangi foydalanuvchi — telefon so'raymiz (yagona joy reply_keyboard ishlatiladi)
      return ctx.reply(
        `👋 <b>Assalomu alaykum!</b>\n\nTa'lim Plus o'quv markaziga xush kelibsiz! 🏫\n\nDavom etish uchun telefon raqamingizni ulashing:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]],
            resize_keyboard: true, one_time_keyboard: true
          }
        }
      );
    } catch (err) {
      console.error('Start xatolik:', err);
      ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.").catch(() => {});
    }
  });

  // ── CONTACT ───────────────────────────────────────────────────
  bot.on('contact', async (ctx) => {
    try {
      const contact = ctx.message.contact;
      const telegramId = BigInt(ctx.from.id);

      if (contact.user_id && BigInt(contact.user_id) !== telegramId) {
        return ctx.reply("⚠️ Iltimos, faqat o'z raqamingizni ulashing.", {
          reply_markup: { keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
      }

      // Darhol keyboardni olamiz
      await ctx.reply('⏳ Tekshirilmoqda...', { reply_markup: { remove_keyboard: true } });

      // Hodim
      const staffByPhone = await findStaffByPhone(contact.phone_number);
      if (staffByPhone) {
        await prisma.user.update({ where: { id: staffByPhone.id }, data: { telegramId, username: ctx.from.username || '' } });
        const roleName = { teacher: "O'qituvchi", receptionist: 'Qabulxona xodimi' }[staffByPhone.role] || '';
        return ctx.reply(`✅ <b>${staffByPhone.firstName}</b>, xush kelibsiz!\n${roleName} paneliga kirish:`, { parse_mode: 'HTML', ...staffBtn(staffByPhone) });
      }

      // O'quvchi / ota-ona
      const applicants = await findApplicantsByPhone(contact.phone_number);
      if (applicants.length) {
        await prisma.applicant.updateMany({ where: { id: { in: applicants.map(a => a.id) } }, data: { telegramId } });
        return sendStudentWelcome(ctx, applicants);
      }

      // Bazada yo'q
      const recUser = process.env.RECEPTIONIST_USERNAME || 'admin';
      return ctx.reply(
        `🏫 <b>Ta'lim Plus o'quv markaziga xush kelibsiz!</b>\n\nRaqamingiz qabul qilindi. Qabulga yozilish uchun:`,
        {
          parse_mode: 'HTML',
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
      ctx.reply("Xatolik yuz berdi.").catch(() => {});
    }
  });

  // ── BOSHQA XABARLAR ───────────────────────────────────────────
  bot.on('message', async (ctx) => {
    try {
      const telegramId = BigInt(ctx.from.id);
      const adminId = BigInt(process.env.ADMIN_TELEGRAM_ID || '0');

      if (telegramId === adminId) return ctx.reply('🛡️ Admin paneli:', {
        reply_markup: { inline_keyboard: [[{ text: '🛡️ Admin panelini ochish', web_app: { url: `${process.env.MINI_APP_URL}/admin.html` } }]] }
      });

      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (user) return ctx.reply(`👋 <b>${user.firstName}</b>:`, { parse_mode: 'HTML', ...staffBtn(user) });

      const a = await prisma.applicant.findFirst({ where: { telegramId }, include: { student: { select: { id: true } } } });
      if (a?.student?.id) return ctx.reply('🎓 Profilingiz:', studentBtn(a));

      ctx.reply("Iltimos /start bosing va telefon raqamingizni ulashing.", {
        reply_markup: { inline_keyboard: [[{ text: "🏫 Ta'lim Plus", web_app: { url: `${process.env.MINI_APP_URL}/launch` } }]] }
      });
    } catch(e) { console.error('Message xatolik:', e); }
  });
};

module.exports.getBot = getBot;
module.exports.setBot = setBot;
