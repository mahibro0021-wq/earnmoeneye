const { connectToDatabase } = require('./_db');
const { verifyInitData } = require('./_utils');

// Minimum withdraw amounts (per explicit spec: both methods = 1000tk)
const MIN_WITHDRAW = { bkash: 1000, nagad: 1000 };

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
      const { initData, method, accountNumber, amount } = req.body;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

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

      const user = await db.collection('users').findOne({ telegramId: tgUser.id });
      if (!user || user.balance < amt) {
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
