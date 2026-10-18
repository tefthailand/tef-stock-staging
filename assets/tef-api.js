/*
 * TEF Stock · tef-api.js (v33)
 *   1 TEFAPI.call(fn, args)  ส่งคำสั่งไปหลังบ้าน Apps Script (POST text/plain) พร้อมบัตรผ่าน
 *   2 google.script.run      ตัวครอบ: โค้ดหน้าเว็บเดิมเรียกแบบเดิมได้ทุกบรรทัด
 *   3 TEFAuth                ปุ่ม Sign in with Google · ต่ออายุบัตรแบบเงียบ · รหัสทางอีเมล (ทางสำรอง) · ออกจากระบบ
 * ใส่ใน <head> ก่อนสคริปต์อื่น: config.js → tef-api.js → i18n.js → tef-shell.js → accounts.google.com/gsi/client
 * ที่เก็บในเบราว์เซอร์: localStorage tef_idt (บัตร Google ≤ 1 ชม.), tef_ses (บัตรผ่านรหัสทางอีเมล 6 ชม.), tef_names (ชื่อสินค้าอังกฤษ)
 *                      sessionStorage tef_me (ชื่อ/บทบาท จำไว้ 5 นาที)
 */
(function () {
  'use strict';
  var C = window.TEF_CONFIG || {};
  var K_IDT = 'tef_idt', K_SES = 'tef_ses', K_ME = 'tef_me', K_NAMES = 'tef_names';
  var PRE = { apiPing: 1, otpRequest: 1, otpVerify: 1, sessionCheck: 1, otpLogout: 1 };
  // หน้าในระบบ (ชื่อเดิมของ ?page=) → ไฟล์บน GitHub Pages
  var PAGES = { home: 'home.html', stock: 'stock.html', index: 'request.html', count: 'count.html',
                dash: 'dash.html', admin: 'admin.html', my: 'my.html', survey: 'survey.html' };

  function store(area, k, v) {
    try {
      var s = window[area];
      if (v === undefined) return s.getItem(k) || '';
      if (v === null) s.removeItem(k); else s.setItem(k, v);
    } catch (e) { /* โหมดส่วนตัว/ปิดที่เก็บ: ใช้ได้ แต่ต้องเข้าระบบใหม่ทุกหน้า */ }
    return '';
  }
  function ls(k, v) { return store('localStorage', k, v); }
  function ss(k, v) { return store('sessionStorage', k, v); }
  function mkErr(code, msg) { var e = new Error(msg); e.code = code; return e; }

  // ชื่อสินค้าอังกฤษที่จำไว้ ให้ i18n.js ใช้ได้ทันทีตอนโหลดหน้า
  try { var nm = JSON.parse(ls(K_NAMES) || 'null'); if (nm && nm.d) window.TEF_NAMES = nm.d; } catch (e) {}

  // อ่านเวลาหมดอายุจากบัตร (กะเวลาต่ออายุเท่านั้น ความถูกต้องจริงตรวจที่หลังบ้านทุกคำขอ)
  function jwtExp(t) {
    try {
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return Number(JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).exp) || 0;
    } catch (e) { return 0; }
  }
  function freshIdt() { var t = ls(K_IDT); return t && jwtExp(t) > Date.now() / 1000 + 60 ? t : ''; }
  function cred() {
    var t = freshIdt(); if (t) return { idt: t };
    var s = ls(K_SES); return s ? { ses: s } : {};
  }

  function post(fn, args) {
    if (!C.API_URL) return Promise.reject(mkErr('NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า API_URL ใน assets/config.js'));
    var body = { v: 1, fn: fn, args: args || [] }, c = PRE[fn] ? {} : cred(), k;
    for (k in c) body[k] = c[k];
    return fetch(C.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // simple request: ไม่มี preflight
      body: JSON.stringify(body),
      redirect: 'follow', credentials: 'omit', cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw mkErr('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (' + r.status + ') กรุณาลองใหม่');
      return r.json();
    }, function () {
      throw mkErr('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
    }).then(function (res) {
      if (res && res.ok) return res.data;
      throw mkErr((res && res.code) || 'ERROR', (res && res.error) || 'เกิดข้อผิดพลาด');
    });
  }

  /** เรียกหลังบ้าน: บัตร Google ใกล้หมด → ต่ออายุก่อน · หลังบ้านตอบหมดอายุ → ต่ออายุแล้วลองซ้ำ 1 ครั้ง */
  function call(fn, args) {
    if (PRE[fn]) return post(fn, args);
    var ready = (ls(K_IDT) && !freshIdt()) ? Auth.renew().catch(function () {}) : Promise.resolve();
    return ready.then(function () { return post(fn, args); })
      .catch(function (e) {
        if (e.code === 'AUTH_EXPIRED' && ls(K_IDT)) return Auth.renew().then(function () { return post(fn, args); });
        throw e;
      })
      .catch(function (e) {
        if (/^AUTH_/.test(e.code || '')) Auth.toLogin();
        throw e;
      });
  }

  // ── ตัวครอบ google.script.run ──────────────────────────────────
  function runner(okH, failH, uo) {
    return new Proxy({}, {
      get: function (_, k) {
        if (typeof k !== 'string' || k === 'then') return undefined;
        if (k === 'withSuccessHandler') return function (h) { return runner(h, failH, uo); };
        if (k === 'withFailureHandler') return function (h) { return runner(okH, h, uo); };
        if (k === 'withUserObject') return function (o) { return runner(okH, failH, o); };
        return function () {
          var a = Array.prototype.slice.call(arguments);
          call(k, a).then(
            function (d) { if (okH) okH(d, uo); },
            function (e) { if (failH) failH(e, uo); else if (window.console) console.error('[TEF]', k, e); });
        };
      }
    });
  }
  function install() {
    var g = window.google = window.google || {};
    g.script = g.script || {};
    var d = Object.getOwnPropertyDescriptor(g.script, 'run');
    if (!d || !d.get || !d.get.__tef) {
      var getter = function () { return runner(); };
      getter.__tef = true;
      Object.defineProperty(g.script, 'run', { configurable: true, enumerable: true, get: getter });
    }
    if (!g.script.host) g.script.host = { close: function () { window.close(); }, setHeight: function () {}, setWidth: function () {} };
  }
  install();
  // ไลบรารีปุ่ม Google โหลดทีหลัง ถ้ามันสร้าง window.google ใหม่ ให้ใส่ตัวครอบกลับเข้าไป
  var prevLoad = window.onGoogleLibraryLoad;
  window.onGoogleLibraryLoad = function () { install(); if (typeof prevLoad === 'function') prevLoad(); };

  // ── เข้าสู่ระบบ ───────────────────────────────────────────────
  var inited = false, renewing = null, pending = null;
  function gis() { return window.google && google.accounts && google.accounts.id; }
  function whenGis(ms) {
    return new Promise(function (ok, no) {
      var t0 = Date.now();
      (function wait() {
        if (gis()) return ok(gis());
        if (Date.now() - t0 > ms) return no(mkErr('AUTH_EXPIRED', 'โหลดปุ่ม Google ไม่สำเร็จ ลองใหม่ หรือใช้รหัสทางอีเมล'));
        setTimeout(wait, 100);
      })();
    });
  }
  function init(id) {
    if (inited) return;
    inited = true;
    id.initialize({
      client_id: C.CLIENT_ID,
      callback: onCredential,
      auto_select: true,              // เคยเข้าแล้ว ต่ออายุได้เองโดยไม่ต้องกดซ้ำ (ถ้าเบราว์เซอร์อนุญาต)
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      itp_support: true,
      context: 'signin'
    });
  }
  function onCredential(r) {
    var t = r && r.credential;
    if (!t) return;
    ls(K_IDT, t); ls(K_SES, null); ss(K_ME, null);
    if (pending) pending(t);
    if (typeof Auth.onSignIn === 'function') Auth.onSignIn(t);
  }
  function pageKey() {
    var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    for (var k in PAGES) if (PAGES[k] === f) return k;
    return f === 'privacy.html' ? 'privacy' : 'login';
  }

  var Auth = {
    onSignIn: null,                   // หน้าเข้าสู่ระบบตั้งค่าเอง

    renderButton: function (el, lang) {
      return whenGis(10000).then(function (id) {
        init(id);
        id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with',
                              shape: 'pill', width: 280, locale: lang === 'en' ? 'en' : 'th' });
      });
    },

    /** ขอบัตรใหม่แบบเงียบ (One Tap / FedCM) รอไม่เกิน 8 วินาที */
    renew: function () {
      if (renewing) return renewing;
      renewing = whenGis(5000).then(function (id) {
        init(id);
        return new Promise(function (ok, no) {
          var tm = setTimeout(function () { pending = null; no(mkErr('AUTH_EXPIRED', 'กรุณาเข้าสู่ระบบอีกครั้ง')); }, 8000);
          pending = function (t) { clearTimeout(tm); pending = null; ok(t); };
          id.prompt();
        });
      });
      var done = function () { renewing = null; };
      renewing.then(done, done);
      return renewing;
    },

    otpRequest: function (email) { return call('otpRequest', [email]); },
    otpVerify: function (email, code) {
      return call('otpVerify', [email, code]).then(function (r) {
        ls(K_SES, r.tok); ls(K_IDT, null); ss(K_ME, null);
        return r;
      });
    },
    sessionCheck: function () { var s = ls(K_SES); return s ? call('sessionCheck', [s]) : Promise.resolve(null); },

    /** ชื่อ บทบาท หน้าที่เข้าได้ เมนู (จำไว้ 5 นาทีในแท็บนี้) */
    me: function (fresh) {
      var c = !fresh && ss(K_ME);
      if (c) { try { var o = JSON.parse(c); if (o.t > Date.now() - 300000) return Promise.resolve(o.d); } catch (e) {} }
      return call('meInfo', []).then(function (d) { ss(K_ME, JSON.stringify({ t: Date.now(), d: d })); return d; });
    },

    /** ชื่อสินค้าอังกฤษ: โหลดใหม่วันละครั้ง */
    names: function () {
      try { var o = JSON.parse(ls(K_NAMES) || 'null'); if (o && o.t > Date.now() - 86400000) return Promise.resolve(o.d); } catch (e) {}
      return call('namesEn', []).then(function (d) {
        ls(K_NAMES, JSON.stringify({ t: Date.now(), d: d || [] }));
        if (typeof window.TEF_SET_NAMES === 'function') window.TEF_SET_NAMES(d || []);
        return d;
      });
    },

    signedIn: function () { return !!(freshIdt() || ls(K_SES) || ls(K_IDT)); },
    authBy: function () { return freshIdt() || ls(K_IDT) ? 'GOOGLE' : (ls(K_SES) ? 'EMAIL' : ''); },

    /** ไปหน้าเข้าสู่ระบบ แล้วกลับมาหน้าเดิม (พร้อมค่าใน ?) หลังเข้าได้ */
    toLogin: function (reason) {
      var p = pageKey();
      if (p === 'login' || p === 'privacy') return;
      location.href = C.SITE + '?page=login&next=' + encodeURIComponent(p) +
        (location.search.length > 1 ? '&q=' + encodeURIComponent(location.search.slice(1)) : '') +
        (reason ? '&err=' + encodeURIComponent(reason) : '');
    },

    /** ล้างบัตรในเบราว์เซอร์นี้ (ใช้ทั้งออกจากระบบและสลับบัญชี) */
    clear: function () {
      var s = ls(K_SES);
      ls(K_IDT, null); ls(K_SES, null); ss(K_ME, null);
      try { if (gis()) gis().disableAutoSelect(); } catch (e) {}
      return s ? post('otpLogout', [s]).catch(function () {}) : Promise.resolve();
    },
    signOut: function () {
      var go = function () { location.href = C.SITE + '?page=login&out=1'; };
      Auth.clear().then(go, go);
    }
  };

  window.TEFAPI = { call: call, PAGES: PAGES, pageKey: pageKey, url: function (page, q) {
    var f = PAGES[page] || 'index.html'; return C.SITE + f + (q ? '?' + q : '');
  } };
  window.TEFAuth = Auth;
})();
