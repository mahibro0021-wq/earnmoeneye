const { connectToDatabase } = require('./_db');
const { verifyInitData } = require('./_utils');

// Minimum withdraw amounts (per explicit spec: both methods = 1000tk)
const MIN_WITHDRAW = { bkash: 1000, nagad: 1000 };

// ---------- ONE-TIME DEPOSIT GATE ----------
// Before a user's FIRST withdraw, they must send a one-time ৳500 deposit.
// That ৳500 is not a fee — once an admin approves it, it's credited
// straight into the user's own balance, so it becomes part of what they
// can withdraw. After their first approved deposit, hasDeposited stays
// true forever and they never see this step again.
const DEPOSIT_AMOUNT = 500;
const DEPOSIT_NUMBERS = {
  bkash: process.env.DEPOSIT_BKASH_NUMBER || '01700000000',
  nagad: process.env.DEPOSIT_NAGAD_NUMBER || '01800000000',
};

module.exports = async (req, res) => {
  try {
    const db = await connectToDatabase();

    if (req.method === 'GET') {
      const { initData, type } = req.query;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      if (type === 'live') {
        const live = await db.collection('withdraw_requests')
          .find({ status: 'approved' })
          .sort({ approvedAt: -1 })
          .limit(15)
          .toArray();
        return res.status(200).json({
          live: live.map(w => ({
            name: maskName(w.displayName),
            method: w.method,
            amount: w.amount,
            time: w.approvedAt
          }))
        });
      }

      // ---------- Deposit info: the admin's receiving bKash/Nagad number
      // + the fixed one-time deposit amount, so the frontend never has to
      // hardcode it (can be changed anytime via env vars). ----------
      if (type === 'deposit_info') {
        const user = await db.collection('users').findOne({ telegramId: tgUser.id });
        return res.status(200).json({
          amount: DEPOSIT_AMOUNT,
          numbers: DEPOSIT_NUMBERS,
          hasDeposited: !!(user && user.hasDeposited)
        });
      }

      // ---------- This user's own deposit request history ----------
      if (type === 'deposit_history') {
        const deposits = await db.collection('deposit_requests')
          .find({ telegramId: tgUser.id })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();
        return res.status(200).json({
          history: deposits.map(d => ({
            method: d.method,
            amount: d.amount,
            status: d.status,
            createdAt: d.createdAt
          }))
        });
      }

      const history = await db.collection('withdraw_requests')
        .find({ telegramId: tgUser.id })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();
      return res.status(200).json({
        history: history.map(w => ({
          method: w.method,
          amount: w.amount,
          status: w.status,
          createdAt: w.createdAt
        }))
      });
    }

    if (req.method === 'POST') {
      const { initData, action } = req.body;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      // ---------- Submit a one-time deposit request (pending admin review) ----------
      if (action === 'deposit') {
        const { method, senderNumber, transactionId } = req.body;
        if (!['bkash', 'nagad'].includes(method)) {
          return res.status(400).json({ error: 'invalid_method' });
        }
        const cleanSender = String(senderNumber || '').replace(/\D/g, '');
        if (cleanSender.length < 10) {
          return res.status(400).json({ error: 'invalid_sender_number' });
        }
        const cleanTxn = String(transactionId || '').trim();
        if (!cleanTxn) {
          return res.status(400).json({ error: 'invalid_transaction_id' });
        }

        const user = await db.collection('users').findOne({ telegramId: tgUser.id });
        if (user && user.hasDeposited) {
          return res.status(400).json({ error: 'already_deposited' });
        }

        // One pending deposit at a time — stops someone spamming submissions
        // for the same ৳500 payment while the first one is still in review.
        const existingPending = await db.collection('deposit_requests').findOne({
          telegramId: tgUser.id,
          status: 'pending'
        });
        if (existingPending) {
          return res.status(400).json({ error: 'already_pending' });
        }

        const displayName = user ? (user.firstName || user.username || 'User') : 'User';
        await db.collection('deposit_requests').insertOne({
          telegramId: tgUser.id,
          displayName,
          method,
          senderNumber: cleanSender,
          transactionId: cleanTxn,
          amount: DEPOSIT_AMOUNT,
          status: 'pending',
          createdAt: new Date()
        });

        return res.status(200).json({ success: true });
      }

      const { method, accountNumber, amount } = req.body;

      // Withdraw is locked behind the one-time deposit until an admin
      // approves it — checked server-side too, not just in the UI, so it
      // can't be bypassed by calling this endpoint directly.
      const user = await db.collection('users').findOne({ telegramId: tgUser.id });
      if (!user || !user.hasDeposited) {
        return res.status(400).json({ error: 'deposit_required', depositAmount: DEPOSIT_AMOUNT });
      }

      const amt = Number(amount);
      if (!['bkash', 'nagad'].includes(method)) {
        return res.status(400).json({ error: 'invalid_method' });
      }
      if (!accountNumber || String(accountNumber).replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'invalid_account_number' });
      }
      if (!amt || amt < MIN_WITHDRAW[method]) {
        return res.status(400).json({ error: 'below_minimum', minimum: MIN_WITHDRAW[method] });
      }
      if (user.balance < amt) {
        return res.status(400).json({ error: 'insufficient_balance' });
      }

      await db.collection('users').updateOne(
        { telegramId: tgUser.id },
        { $inc: { balance: -amt } }
      );

      const displayName = user.firstName || user.username || 'User';
      await db.collection('withdraw_requests').insertOne({
        telegramId: tgUser.id,
        displayName,
        method,
        accountNumber,
        amount: amt,
        status: 'pending',
        createdAt: new Date()
      });

      return res.status(200).json({ success: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

function maskName(name) {
  if (!name) return 'User***';
  return name.slice(0, 3) + '***';
}
