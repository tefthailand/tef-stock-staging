# TEF Stock (staging)

หน้าเว็บชุดทดสอบของระบบคลังพัสดุ TEF Stock · สมาคมกีฬาขี่ม้าแห่งประเทศไทย ในพระบรมราชูปถัมภ์
Staging web pages for the TEF Stock inventory system (Thailand Equestrian Federation).

- เว็บ: https://tefthailand.github.io/tef-stock-staging/
- หลังบ้าน: Google Apps Script "TEF Stock API (staging)" — ข้อมูลอยู่ใน Google Sheets ไม่อยู่ใน repo นี้
- repo นี้เป็นสาธารณะ: ห้ามใส่ข้อมูล รหัสลับ หรือรหัสชีต · `assets/config.js` มีแค่ API URL และ OAuth Client ID ซึ่งเปิดเผยได้

| ไฟล์ | หน้า |
|---|---|
| index.html | เข้าสู่ระบบ (Sign in with Google / รหัสทางอีเมล) และตัวพาไปหน้า `?page=` |
| home · stock · request · my · admin · survey · count · dash | หน้าระบบ (ย้ายจาก Apps Script HtmlService v32) |
| privacy.html | นโยบายความเป็นส่วนตัว (ร่าง รอสมาคมอนุมัติ) |
| assets/tef-api.js | ตัวเรียก API + ตัวครอบ `google.script.run` + การเข้าสู่ระบบ |
| assets/tef-shell.js | แถบเมนูตามบทบาท |
| assets/i18n.js | สลับภาษาไทย/อังกฤษ |
