/*
 * TEF Stock · tef-shell.js (v33) — แทน injectNav_ ฝั่งเซิร์ฟเวอร์เดิม
 *   ยังไม่เข้าสู่ระบบ → ไปหน้าเข้าสู่ระบบ · ผู้ใช้ภายนอกใหม่ → แบบสอบถาม
 *   วาดแถบเมนูตามบทบาท (meInfo) · หน้าที่บทบาทเข้าไม่ได้ → แจ้งไม่มีสิทธิ์ (ข้อมูลจริงตรวจสิทธิ์ที่หลังบ้านทุกคำสั่ง)
 *   โหลดชื่อสินค้าอังกฤษให้ i18n.js
 */
(function () {
  'use strict';
  var A = window.TEFAPI, Auth = window.TEFAuth, C = window.TEF_CONFIG || {};
  var page = A.pageKey();
  if (page === 'login' || page === 'privacy') return;
  if (!Auth.signedIn()) { Auth.toLogin(); return; }

  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var CSS = '<style>.tefnav{background:#0A2342;color:#fff;font:14px/1.2 Sarabun,"Noto Sans Thai",system-ui,sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:8px 12px;position:relative;z-index:50}' +
    '.tefnav .tn-b{font-weight:700;margin-right:10px}.tefnav .tn-a{color:#cfe0f5;text-decoration:none;padding:7px 12px;border-radius:8px;white-space:nowrap}' +
    '.tefnav .tn-a:hover{background:rgba(255,255,255,.14);color:#fff}.tefnav .tn-a.on{background:#fff;color:#0A2342;font-weight:700}' +
    '.tefnav .tn-w{margin-left:auto;font-size:12px;color:#9db7d6;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.tefnav .tn-x{color:#cfe0f5;text-decoration:none;font-size:12px;padding:5px 9px;border:1px solid rgba(255,255,255,.28);border-radius:7px;white-space:nowrap}' +
    '.tefnav .tn-x:hover{background:rgba(255,255,255,.14);color:#fff}' +
    '.tefnav .tn-env{background:#f5b301;color:#0A2342;font-weight:700;font-size:11px;padding:3px 7px;border-radius:6px}' +
    '.tef-shell-msg{max-width:560px;margin:40px auto;padding:24px;background:#fff;border:1px solid #CFE2EF;border-radius:10px;text-align:center;font-family:"IBM Plex Sans Thai",system-ui,sans-serif}' +
    '.tef-shell-msg h1{font-size:18px;margin:0 0 8px;color:#0A2342}.tef-shell-msg p{font-size:14px;color:#50677D;margin:0}' +
    '@media print{.tefnav{display:none}}</style>';

  function navHtml(me) {
    var links = (me.nav || []).map(function (x) {
      return '<a class="tn-a' + (x[0] === page ? ' on' : '') + '" href="' + esc(A.url(x[0])) + '">' + esc(x[1]) + '</a>';
    }).join('');
    var who = esc(me.name || '') + ' · ' + esc(me.roleLabel || me.role) + (me.email ? ' · ' + esc(me.email) : '');
    var en = window.TEF_LANG === 'en';
    return CSS + '<div class="tefnav"><span class="tn-b">TEF Stock</span>' +
      (C.ENV === 'staging' ? '<span class="tn-env">ชุดทดสอบ</span>' : '') + links +
      '<span class="tn-w">' + who + '</span>' +
      '<a class="tn-x" id="tefLang" data-noi18n href="' + esc(location.href) + '">' + (en ? 'ภาษาไทย' : 'English') + '</a>' +
      '<a class="tn-x" id="tefSwitch" href="#">สลับบัญชี</a>' +
      '<a class="tn-x" id="tefOut" href="#">ออกจากระบบ</a></div>';
  }

  function put(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    var b = document.body;
    while (box.lastChild) b.insertBefore(box.lastChild, b.firstChild);
  }

  function message(title, text) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (!el.classList.contains('tefnav') && el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT') el.style.display = 'none';
    });
    var d = document.createElement('div');
    d.className = 'tef-shell-msg';
    d.innerHTML = '<h1>' + esc(title) + '</h1><p>' + esc(text) + '</p>';
    document.body.appendChild(d);
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#tefSwitch, #tefOut');
    if (!t) return;
    e.preventDefault();
    if (t.id === 'tefOut') Auth.signOut();
    else Auth.clear().then(function () { location.href = C.SITE + '?page=login&switch=1'; });
  });

  document.addEventListener('DOMContentLoaded', function () {
    Auth.me().then(function (me) {
      if (me.role === 'EXTERNAL_NEW' && page !== 'survey') { location.replace(A.url('survey')); return; }
      if (page !== 'survey') put(navHtml(me));
      if (page !== 'survey' && (me.pages || []).indexOf(page) < 0)
        message('หน้านี้ไม่เปิดให้สิทธิ์ของคุณ (' + (me.roleLabel || me.role) + ')', 'หากคิดว่าควรเข้าได้ กรุณาติดต่อผู้ดูแลระบบ TEF Stock');
      Auth.names().catch(function () {});
    }, function (e) {
      if (e && e.code === 'NO_ACCESS') { Auth.toLogin('noaccess'); return; }
      if (e && /^AUTH_/.test(e.code || '')) return;            // tef-api.js พาไปหน้าเข้าสู่ระบบแล้ว
      put(CSS);
      message('ยังเข้าสู่ระบบไม่ได้', String((e && e.message) || e));
    });
  });
})();
