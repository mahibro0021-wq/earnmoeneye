# Daily Money — Telegram Mini App

Ad-earning + referral + withdraw Telegram Mini App (bKash/Nagad), with an
admin panel restricted to your Telegram account only.

## 1. Deploy

1. এই ফোল্ডারটা একটা নতুন GitHub repo-তে push করুন।
2. Vercel-এ গিয়ে "Import Project" করে ওই repo সিলেক্ট করুন → Deploy।
3. Deploy হওয়ার পর আপনার লিংক পাবেন, যেমন: `https://your-project.vercel.app`

## 2. Environment Variables (Vercel → Project → Settings → Environment Variables)

```
BOT_TOKEN=8955823792:AAHeGOXDG71swbTKJ9PVwPGvaJre9poU7ds
BOT_USERNAME=moneyearn12131_bot
ADMIN_TELEGRAM_ID=5697990319
MONGODB_URI=mongodb+srv://mahibro0021_db_user:YOUR_REAL_PASSWORD@cluster0.vh0wlop.mongodb.net/?appName=Cluster0
APP_URL=https://your-project.vercel.app
```

⚠️ `MONGODB_URI`-তে `<db_password>` এর জায়গায় আপনার আসল পাসওয়ার্ড বসান
(URL-এ স্পেশাল ক্যারেক্টার থাকলে URL-encode করতে হবে)। যেহেতু এই পাসওয়ার্ডটা
এই চ্যাটে লেখা হয়েছে, deploy করার পর MongoDB Atlas থেকে এটা **change করে
নেওয়াই ভালো** — শুধু Vercel-এর env variable-এ নতুন পাসওয়ার্ড আপডেট করলেই হবে,
কোডে কোনো password হার্ডকোড করা নেই।

Env var বসানোর পর Vercel-এ **Redeploy** করতে হবে।

## 3. Telegram Bot সেটআপ (@BotFather)

1. `/setmenubutton` → আপনার bot সিলেক্ট করুন → button text: `💰 Open App`,
   URL: `https://your-project.vercel.app`
2. Webhook সেট করুন (bot.js-কে কল করার জন্য), browser-এ এই URL খুলুন
   (একবারই লাগবে):
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/bot
   ```
3. Verified social task-এর জন্য বটকে আপনার channel/group-এ **Admin** বানিয়ে
   রাখুন (getChatMember কল করতে হয়, তাই লাগবে)।

## 4. Ad Network যুক্ত করা

`public/index.html`-এ আপনার ad network-এর (Monetag / Adsgram / GigaPub /
Adexium) SDK script tag যোগ করুন, এবং `public/app.js`-এর `showAd()`
ফাংশনে সেই SDK-এর reward callback বসান। শুধু সেই callback-এই
`/api/earn` কল হয় — মানে ad পুরোপুরি/রিওয়ার্ডেড ভাবে না দেখলে টাকা যোগ
হবে না।

## 5. Admin Panel

`https://your-project.vercel.app/admin.html` — কিন্তু এটা **শুধু Telegram
Mini App হিসেবে খুললেই কাজ করবে** (সরাসরি ব্রাউজারে খুললে "🔒 এই পেজটি
শুধুমাত্র অ্যাডমিন..." দেখাবে, কারণ অ্যাক্সেস Telegram-এর initData
verify করে + আপনার UID (5697990319)-এর সাথে মিলিয়ে দেওয়া হয়, কোনো
আলাদা password login নেই)।

সহজ উপায়: BotFather দিয়ে আরেকটা ছোট bot/menu button বানিয়ে সেটার URL
`.../admin.html` দিয়ে রাখুন — শুধু আপনি ছাড়া কেউ ঢুকতে পারবে না, যেই
Telegram দিয়ে ঢুকুক না কেন।

## 6. যা যা ইতিমধ্যে করা আছে

- Home / Task / Withdraw — ৩ ট্যাব, রেফারেন্স স্ক্রিনশটের মতো UI ও রঙ
- Rewarded ad: ৳10/ad, দৈনিক ১৭টা লিমিট, ১৭টা কমপ্লিট হলে +৳70 বোনাস claim
- Referral: প্রতি রেফারে সাথে সাথে ৳130, ১০ রেফারে +৳150 বোনাস claim
- Social task: normal (join+return) ও verified (আসল membership চেক) দুই
  টাইপ, সম্পূর্ণ admin panel থেকে control
- Withdraw: bKash/Nagad, ন্যূনতম ৳1000 উভয়ে, Live Withdraw (আসল approved
  withdraw থেকে, নাম masked), Withdraw History
- Admin panel: task তৈরি/enable-disable/delete, withdraw approve/reject
  (reject হলে balance ফেরত), user search

## এখনো যা আপনাকে করতে হবে

- Ad network account + SDK integration (কোন network(গুলো) ব্যবহার
  করবেন জানালে সেটাও বসিয়ে দিতে পারি)
- Social task-গুলো (আপনার আসল চ্যানেল লিংক) admin panel দিয়ে add করা
- MongoDB পাসওয়ার্ড change করে env var আপডেট করা
