# Plov City — GitHub va Vercel uchun loyiha

React sayti va eski Plov City saytidagi noyob menyu ma’lumotlari birlashtirilgan. Menyu, rasm, narx, buyurtmalar va tashriflar umumiy Upstash Redis bazasida saqlanadi. Boshqa qurilmadagi ochiq menyu 30 soniyada yangilanadi; sahifani yangilash ham o‘zgarishni darhol oladi.

## Vercel’ga joylash

1. Loyihani GitHub repository’ga yuklang va Vercel’da **Add New → Project** orqali ulang.
2. Root Directory loyiha ildizi bo‘lsin. Build Command: `npm run build`; Output Directory: `dist`.
3. Vercel **Storage → Create Database** orqali Upstash Redis yarating va ayni loyihaga ulang.
4. Project Settings → Environment Variables’da `ADMIN_USERNAME=owner`, o‘zingizning `ADMIN_PASSWORD` va kamida 32 belgili tasodifiy `ADMIN_SESSION_SECRET` kiriting. Telegram uchun `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` ixtiyoriy.
5. Deploy qiling. Redis yoki env sozlamalarini keyin o‘zgartirsangiz redeploy qiling.

Redis ulanmaguncha admin kirishi va umumiy ma’lumot saqlash ishlamaydi. Server maxfiylarini GitHub’ga yoki `VITE_` frontend o‘zgaruvchilariga qo‘ymang.

## Admin panel tugmasi

Mijozlarga admin tugmasi ko‘rinmaydi. Egasi birinchi marta o‘z brauzerida `https://SIZNING-DOMENINGIZ/admin` orqali login qilgach, Admin panel tugmasi shu brauzerda chiqadi. Boshqa qurilmada tugma kerak bo‘lsa, o‘sha yerda ham bir marta login qiling. Admin API har doim server tomondan login bilan himoyalangan.

## GitHub va build

Node.js 20+ kerak. `pnpm install` yoki `npm install`, keyin `npm run build` ishlating. Vercel GitHub `main` branch’ga ulangan bo‘lsa, push’dan keyin avtomatik deploy qiladi.

