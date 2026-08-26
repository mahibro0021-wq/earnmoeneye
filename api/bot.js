const { sendMessage } = require('./_telegram');

module.exports = async (req, res) => {
  try {
    const update = req.body;
    const msg = update.message;

    if (msg && msg.text && msg.text.startsWith('/start')) {
      const appUrl = process.env.APP_URL;
      await sendMessage(
        msg.chat.id,
        `স্বাগতম <b>প্রতিদিন টাকা</b> তে! 🎉\n\nবিজ্ঞাপন দেখে এবং বন্ধুদের রেফার করে প্রতিদিন টাকা আয় করুন।`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '💰 অ্যাপ চালু করুন', web_app: { url: appUrl } }]]
          }
        }
      );
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(200).json({ ok: true });
  }
};
