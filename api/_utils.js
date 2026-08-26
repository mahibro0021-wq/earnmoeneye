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

// Hardcoded fallback so the admin panel still works even if the
// ADMIN_TELEGRAM_ID environment variable isn't set on Vercel.
// If you ever need to change who has admin access, either edit this
// number directly, or set ADMIN_TELEGRAM_ID in Vercel (it takes priority).
const HARDCODED_ADMIN_ID = '5697990319';

function isAdmin(telegramId) {
  const allowedId = process.env.ADMIN_TELEGRAM_ID || HARDCODED_ADMIN_ID;
  return String(telegramId) === String(allowedId);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { verifyInitData, isAdmin, todayStr };
