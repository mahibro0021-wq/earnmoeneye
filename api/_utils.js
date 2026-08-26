const crypto = require('crypto');

// Verifies Telegram WebApp initData signature and returns the parsed user object,
// or null if the data is missing/invalid/tampered.
function verifyInitData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) {
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    console.error('verifyInitData error', e);
    return null;
  }
}

function isAdmin(telegramId) {
  return String(telegramId) === String(process.env.ADMIN_TELEGRAM_ID);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { verifyInitData, isAdmin, todayStr };
