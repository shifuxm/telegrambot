require('dotenv').config();
const { execSync } = require('child_process');
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');
const { Telegraf } = require('telegraf');
const prisma  = require('./db');
const cronService = require('./services/cronService');
const { setNotifBot } = require('./services/notificationService');

// ── DB migration ───────────────────────────────────────────────
// --accept-data-loss olib tashlangan! Faqat additive o'zgarishlar
try {
  execSync('npx prisma db push --schema=backend/prisma/schema.prisma', {
    stdio: 'inherit', env: process.env
  });
  console.log('✅ DB tayyor');
} catch (e) {
  console.error('⚠️ DB xatolik:', e.message);
  // Crash qilmaymiz — DB allaqachon to'g'ri bo'lishi mumkin
}

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

BigInt.prototype.toJSON = function () { return this.toString(); };

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// ── Routes ─────────────────────────────────────────────────────
const { authRouter, subRouter, staffRouter, settingsRouter } = require('./api/routes/_base');
app.use('/api/auth',          authRouter);
app.use('/api/subjects',      subRouter);
app.use('/api/staff',         staffRouter);
app.use('/api/settings',      settingsRouter);

app.use('/api/groups',          require('./api/routes/groups'));
app.use('/api/applicants',      require('./api/routes/applicants'));
app.use('/api/students',        require('./api/routes/students'));
app.use('/api/schedule',        require('./api/routes/schedule'));
app.use('/api/student-balance', require('./api/routes/studentBalance'));
app.use('/api/ratings',         require('./api/routes/ratings'));
app.use('/api/debtors',         require('./api/routes/debtors'));
app.use('/api/notifications',   require('./api/routes/notifications'));
app.use('/api/results',         require('./api/routes/results'));

// _routes.js — attendance, payments, expenses, conversions, balance, statistics
const { attRouter, payRouter, expRouter, convRouter, balRouter, statRouter, debtRouter, resRouter } = require('./api/routes/_routes');
app.use('/api/attendance',  attRouter);
app.use('/api/payments',    payRouter);
app.use('/api/expenses',    expRouter);
app.use('/api/conversions', convRouter);
app.use('/api/balance',     balRouter);
app.use('/api/statistics',  statRouter);

// debtors va results _routes.js dan (agar alohida fayl bo'lsa u ustunlikka ega)
// Lekin _routes.js da ham bular bor — ishlashini ta'minlaymiz

// ── Bot ────────────────────────────────────────────────────────
require('./bot')(bot);
setNotifBot(bot);

// ── Webhook ────────────────────────────────────────────────────
const WEBHOOK_PATH = '/telegram-webhook';
app.post(WEBHOOK_PATH, (req, res) => {
  res.sendStatus(200);
  bot.handleUpdate(req.body).catch(err => console.error('Bot xatolik:', err.message));
});

// ── /launch — smart redirect (bot menu tugmasi uchun) ──────────
app.get('/launch', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ta'lim Plus</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
background:linear-gradient(160deg,#2541CC,#3B5BFF);font-family:system-ui;color:#fff;text-align:center;padding:20px}
.sp{width:44px;height:44px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;
border-radius:50%;animation:spin .8s linear infinite;margin:16px auto}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div>
    <div style="font-size:60px;margin-bottom:12px">🏫</div>
    <div style="font-size:20px;font-weight:700">Ta'lim Plus</div>
    <div style="font-size:14px;opacity:.7;margin-top:6px">Yuklanmoqda...</div>
    <div class="sp"></div>
  </div>
  <script>
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    async function launch() {
      try {
        let tid = tg?.initDataUnsafe?.user?.id?.toString();
        if (!tid) {
          try {
            const raw = tg?.initData||'';
            if(raw){const u=JSON.parse(decodeURIComponent(new URLSearchParams(raw).get('user')||'{}'));tid=u.id?.toString();}
          }catch(e){}
        }
        if (!tid) { window.location.href='/admin.html'; return; }
        const r = await fetch('/api/auth/me', { headers: { 'x-telegram-id': tid } });
        if (r.ok) {
          const user = await r.json();
          const urls = { admin:'/admin.html', teacher:'/teacher.html', receptionist:'/reception.html' };
          window.location.href = urls[user.role] || '/admin.html';
          return;
        }
        const r2 = await fetch('/api/auth/student?telegramId='+tid);
        if (r2.ok) {
          const d = await r2.json();
          if (d.length) { window.location.href='/public/student.html?studentId='+d[0].studentId; return; }
        }
        window.location.href='/public/enroll.html';
      } catch(e) { window.location.href='/admin.html'; }
    }
    launch();
  </script>
</body>
</html>`);
});

// ── SPA Fallback ───────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/telegram-webhook')) return;
  const filePath = path.join(frontendPath, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL ulandi');

    app.listen(PORT, async () => {
      console.log(`🚀 Server port ${PORT}`);
      if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
        const url = `${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`;
        await bot.telegram.setWebhook(url);
        console.log(`✅ Webhook: ${url}`);
      } else {
        bot.launch();
        console.log('🤖 Polling rejim');
      }
      cronService.start(bot);
    });
  } catch (err) {
    console.error('❌ Server xatolik:', err);
    process.exit(1);
  }
}

start();
process.once('SIGINT',  () => { bot.stop('SIGINT');  prisma.$disconnect(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); prisma.$disconnect(); });
