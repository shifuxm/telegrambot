const prisma = require('../../db');

const roleCheck = (...roles) => async (req, res, next) => {
  try {
    const telegramId = req.headers['x-telegram-id'];
    if (!telegramId) return res.status(401).json({ error: 'Avtorizatsiya talab etiladi' });

    const adminId = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
    if (adminId && telegramId === adminId) {
      req.user = { id: 0, role: 'admin', firstName: 'Admin', lastName: '', telegramId: adminId };
      if (roles.length && !roles.includes('admin')) return res.status(403).json({ error: 'Ruxsat yo\'q' });
      return next();
    }

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) return res.status(403).json({ error: 'Foydalanuvchi topilmadi' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    req.user = { ...user, telegramId: user.telegramId.toString() };
    next();
  } catch (err) {
    console.error('Auth xato:', err);
    res.status(500).json({ error: 'Server xatolik' });
  }
};

module.exports = roleCheck;
