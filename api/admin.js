const { connectToDatabase } = require('./_db');
const { verifyInitData, isAdmin } = require('./_utils');
const { sendMessage } = require('./_telegram');
const { ObjectId } = require('mongodb');

// Single consolidated admin endpoint (keeps serverless function count low).
// All admin actions go through here, routed by ?action= (GET) or body.action (POST).
// Access is restricted to the Telegram account whose id matches ADMIN_TELEGRAM_ID —
// there is no separate password login.
module.exports = async (req, res) => {
  try {
    const initData = req.method === 'GET' ? req.query.initData : req.body?.initData;
    const tgUser = verifyInitData(initData);
    if (!tgUser || !isAdmin(tgUser.id)) {
      return res.status(403).json({ error: 'access_denied' });
    }

    const db = await connectToDatabase();
    const action = req.method === 'GET' ? req.query.action : req.body?.action;

    // ---------- AUTH CHECK ----------
    if (action === 'check') {
      return res.status(200).json({ ok: true, name: tgUser.first_name || 'Admin' });
    }

    // ---------- TASKS ----------
    if (action === 'list_tasks') {
      const tasks = await db.collection('tasks').find({}).sort({ order: -1 }).toArray();
      return res.status(200).json({ tasks });
    }

    if (action === 'create_task') {
      const { title, description, link, reward, type, channelUsername } = req.body;
      if (!title || !link || !reward || !['normal', 'verified'].includes(type)) {
        return res.status(400).json({ error: 'missing_fields' });
      }
      await db.collection('tasks').insertOne({
        title, description: description || '', link,
        reward: Number(reward), type, channelUsername: channelUsername || '',
        active: true, order: Date.now(), createdAt: new Date()
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'toggle_task') {
      const { taskId, active } = req.body;
      await db.collection('tasks').updateOne({ _id: new ObjectId(taskId) }, { $set: { active: !!active } });
      return res.status(200).json({ success: true });
    }

    if (action === 'delete_task') {
      const { taskId } = req.body;
      await db.collection('tasks').deleteOne({ _id: new ObjectId(taskId) });
      return res.status(200).json({ success: true });
    }

    // ---------- WITHDRAWS ----------
    if (action === 'list_withdraws') {
      const status = req.query.status || 'pending';
      const withdraws = await db.collection('withdraw_requests')
        .find({ status }).sort({ createdAt: -1 }).limit(100).toArray();
      return res.status(200).json({ withdraws });
    }

    if (action === 'approve_withdraw') {
      const { withdrawId } = req.body;
      const w = await db.collection('withdraw_requests').findOne({ _id: new ObjectId(withdrawId) });
      if (!w) return res.status(404).json({ error: 'not_found' });
      await db.collection('withdraw_requests').updateOne(
        { _id: new ObjectId(withdrawId) },
        { $set: { status: 'approved', approvedAt: new Date() } }
      );
      sendMessage(w.telegramId, `✅ আপনার ৳${w.amount} withdraw request approve হয়েছে এবং পাঠানো হয়েছে।`);
      return res.status(200).json({ success: true });
    }

    if (action === 'reject_withdraw') {
      const { withdrawId, reason } = req.body;
      const w = await db.collection('withdraw_requests').findOne({ _id: new ObjectId(withdrawId) });
      if (!w) return res.status(404).json({ error: 'not_found' });
      await db.collection('withdraw_requests').updateOne(
        { _id: new ObjectId(withdrawId) },
        { $set: { status: 'rejected', rejectedAt: new Date(), rejectReason: reason || '' } }
      );
      // refund balance
      await db.collection('users').updateOne(
        { telegramId: w.telegramId },
        { $inc: { balance: w.amount } }
      );
      sendMessage(
        w.telegramId,
        `❌ আপনার ৳${w.amount} withdraw request reject হয়েছে। টাকা আপনার ব্যালেন্সে ফেরত দেওয়া হয়েছে।${reason ? '\nকারণ: ' + reason : ''}`
      );
      return res.status(200).json({ success: true });
    }

    // ---------- USERS ----------
    if (action === 'search_user') {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({ error: 'missing_query' });
      let filter;
      if (/^\d+$/.test(q)) filter = { telegramId: Number(q) };
      else filter = { username: { $regex: q.replace('@', ''), $options: 'i' } };

      const user = await db.collection('users').findOne(filter);
      if (!user) return res.status(404).json({ error: 'not_found' });

      const withdrawCount = await db.collection('withdraw_requests')
        .countDocuments({ telegramId: user.telegramId, status: 'approved' });
      const totalPaidAgg = await db.collection('withdraw_requests')
        .aggregate([
          { $match: { telegramId: user.telegramId, status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();
      const totalPaid = totalPaidAgg[0]?.total || 0;

      return res.status(200).json({ user, withdrawCount, totalPaid });
    }

    // Manually add/subtract from a user's balance (search by Telegram ID).
    // amount can be negative to deduct. Rejects anything that would push
    // the balance below zero or looks like a typo (absurdly large value).
    if (action === 'adjust_balance') {
      const { telegramId, amount } = req.body;
      const uid = Number(telegramId);
      const amt = Number(amount);
      if (!Number.isFinite(uid)) return res.status(400).json({ error: 'invalid_telegram_id' });
      if (!Number.isFinite(amt) || amt === 0) return res.status(400).json({ error: 'invalid_amount' });
      if (Math.abs(amt) > 1000000) return res.status(400).json({ error: 'amount_too_large' });

      const user = await db.collection('users').findOne({ telegramId: uid });
      if (!user) return res.status(404).json({ error: 'not_found' });
      if (amt < 0 && user.balance + amt < 0) {
        return res.status(400).json({ error: 'balance_would_go_negative' });
      }

      await db.collection('users').updateOne({ telegramId: uid }, { $inc: { balance: amt } });
      const updated = await db.collection('users').findOne({ telegramId: uid });
      return res.status(200).json({ success: true, newBalance: updated.balance });
    }

    // All users in the bot — for the "All Users" list in the admin panel.
    if (action === 'list_users') {
      const users = await db.collection('users')
        .find({})
        .project({ telegramId: 1, firstName: 1, lastName: 1, username: 1, balance: 1, referralsCount: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();
      return res.status(200).json({ users });
    }

    // ---------- DEPOSITS (one-time ৳500 unlock before first withdraw) ----------
    if (action === 'list_deposits') {
      const status = req.query.status || 'pending';
      const deposits = await db.collection('deposit_requests')
        .find({ status }).sort({ createdAt: -1 }).limit(100).toArray();
      return res.status(200).json({ deposits });
    }

    if (action === 'approve_deposit') {
      const { depositId } = req.body;
      const d = await db.collection('deposit_requests').findOne({ _id: new ObjectId(depositId) });
      if (!d) return res.status(404).json({ error: 'not_found' });
      if (d.status !== 'pending') return res.status(400).json({ error: 'already_processed' });

      await db.collection('deposit_requests').updateOne(
        { _id: new ObjectId(depositId) },
        { $set: { status: 'approved', approvedAt: new Date() } }
      );
      // The ৳500 isn't a fee — it lands directly in the user's own balance,
      // and hasDeposited permanently unlocks withdraw for this account.
      await db.collection('users').updateOne(
        { telegramId: d.telegramId },
        { $inc: { balance: d.amount }, $set: { hasDeposited: true } }
      );
      sendMessage(
        d.telegramId,
        `✅ আপনার ৳${d.amount} ডিপোজিট approve হয়েছে এবং আপনার ব্যালেন্সে যোগ হয়েছে। এখন আপনি withdraw করতে পারবেন।`
      );
      return res.status(200).json({ success: true });
    }

    if (action === 'reject_deposit') {
      const { depositId, reason } = req.body;
      const d = await db.collection('deposit_requests').findOne({ _id: new ObjectId(depositId) });
      if (!d) return res.status(404).json({ error: 'not_found' });
      if (d.status !== 'pending') return res.status(400).json({ error: 'already_processed' });

      await db.collection('deposit_requests').updateOne(
        { _id: new ObjectId(depositId) },
        { $set: { status: 'rejected', rejectedAt: new Date(), rejectReason: reason || '' } }
      );
      sendMessage(
        d.telegramId,
        `❌ আপনার ৳${d.amount} ডিপোজিট রিকুয়েস্ট reject হয়েছে — সঠিক transaction ID ও number দিয়ে আবার চেষ্টা করুন।${reason ? '\nকারণ: ' + reason : ''}`
      );
      return res.status(200).json({ success: true });
    }

    res.status(400).json({ error: 'unknown_action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
