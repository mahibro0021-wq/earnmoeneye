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

// Hardcoded fallback list so the admin panel still works even if the
// ADMIN_TELEGRAM_ID environment variable isn't set on Vercel.
// If you ever need to add/remove admins, either edit this array directly,
// or set ADMIN_TELEGRAM_ID in Vercel as a comma-separated list of IDs
// (e.g. "5697990319,6372695524") — the env var takes priority when set.
const HARDCODED_ADMIN_IDS = ['5697990319', '6372695524'];

function getAdminIds() {
  if (process.env.ADMIN_TELEGRAM_ID) {
    return process.env.ADMIN_TELEGRAM_ID.split(',').map(id => id.trim()).filter(Boolean);
  }
  return HARDCODED_ADMIN_IDS;
}

function isAdmin(telegramId) {
  return getAdminIds().includes(String(telegramId));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Account-activation auto-approve (withdraw security gate) ----------
// If the admin doesn't manually approve/reject an activation submission
// within this window, it approves itself so a genuine user is never stuck
// waiting forever. The admin can still catch fraud on the *next* withdraw
// review — this window only unlocks the withdraw form, it isn't the final
// say on the money itself.
const ACTIVATION_AUTO_APPROVE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function autoApproveExpiredActivations(db) {
  const cutoff = new Date(Date.now() - ACTIVATION_AUTO_APPROVE_MS);
  const expired = await db.collection('activation_requests')
    .find({ status: 'pending', createdAt: { $lte: cutoff } })
    .toArray();

  for (const a of expired) {
    await db.collection('activation_requests').updateOne(
      { _id: a._id, status: 'pending' },
      { $set: { status: 'approved', approvedAt: new Date(), autoApproved: true } }
    );
    await db.collection('users').updateOne(
      { telegramId: a.telegramId },
      { $set: { accountActive: true } }
    );
  }
  return expired.length;
}

// ---------- Configurable activation notice text (admin-editable, 2 variants)
// + the copy-button label (also admin-editable). The button no longer
// copies the user's real Telegram info — clicking it just copies its own
// label text, so it reads as a normal "copy" action without actually
// handing out real account data. ----------
const DEFAULT_ACTIVATION_TEXTS = {
  normal: 'নিচে আপনার সঠিক Telegram Username ও UID (TGID) লিখে Submit করুন। Admin Approve করলেই Withdraw সম্পন্ন হবে। Approve না হলেও ২৪ ঘণ্টা পর এটি automatically সম্পন্ন হয়ে যাবে।',
  warning: '⚠️ সতর্কতা: ভুয়া তথ্য বা একাধিক অ্যাকাউন্ট ব্যবহার করলে আপনার Withdraw স্থায়ীভাবে বাতিল ও অ্যাকাউন্ট ব্লক করা হবে। সঠিক তথ্য দিয়েই Submit করুন।',
  copyButtonText: '📋 আমার Username ও UID কপি করুন',
  usernamePlaceholder: 'Telegram Username (Paste করুন)',
  tgidPlaceholder: 'Telegram ID / UID (Paste করুন)'
};

async function getActivationSettings(db) {
  const s = await db.collection('settings').findOne({ key: 'activation_notice' });
  if (!s) {
    return {
      textNormal: DEFAULT_ACTIVATION_TEXTS.normal,
      textWarning: DEFAULT_ACTIVATION_TEXTS.warning,
      activeVariant: 'normal',
      copyButtonText: DEFAULT_ACTIVATION_TEXTS.copyButtonText,
      usernamePlaceholder: DEFAULT_ACTIVATION_TEXTS.usernamePlaceholder,
      tgidPlaceholder: DEFAULT_ACTIVATION_TEXTS.tgidPlaceholder
    };
  }
  return {
    textNormal: s.textNormal || DEFAULT_ACTIVATION_TEXTS.normal,
    textWarning: s.textWarning || DEFAULT_ACTIVATION_TEXTS.warning,
    activeVariant: s.activeVariant === 'warning' ? 'warning' : 'normal',
    copyButtonText: s.copyButtonText || DEFAULT_ACTIVATION_TEXTS.copyButtonText,
    usernamePlaceholder: s.usernamePlaceholder || DEFAULT_ACTIVATION_TEXTS.usernamePlaceholder,
    tgidPlaceholder: s.tgidPlaceholder || DEFAULT_ACTIVATION_TEXTS.tgidPlaceholder
  };
}

module.exports = {
  verifyInitData, isAdmin, getAdminIds, todayStr,
  autoApproveExpiredActivations, getActivationSettings, DEFAULT_ACTIVATION_TEXTS
};
