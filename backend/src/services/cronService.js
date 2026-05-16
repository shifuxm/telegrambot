const cron = require('node-cron');
const { sendApplicantsReport } = require('./notificationService');
const { setNotifBot } = require('./notificationService');

function start(bot) {
  // Bot singletonni inject qilamiz
  if (bot) setNotifBot(bot);

  // Har kuni 08:00 va 16:00 da qabul hisoboti
  cron.schedule('0 8 * * *', async () => {
    console.log('Cron 08:00: qabul hisoboti...');
    await sendApplicantsReport();
  }, { timezone: 'Asia/Tashkent' });

  cron.schedule('0 16 * * *', async () => {
    console.log('Cron 16:00: qabul hisoboti...');
    await sendApplicantsReport();
  }, { timezone: 'Asia/Tashkent' });

  console.log('✅ Cron service ishga tushdi');
}

module.exports = { start };
