/*
 * TEF Stock · tef-api.js (v35)
 *   1 TEFAPI.call(fn, args)  ส่งคำสั่งไปหลังบ้าน Apps Script (POST text/plain) พร้อมบัตรผ่าน
 *   2 google.script.run      ตัวครอบ: โค้ดหน้าเว็บเดิมเรียกแบบเดิมได้ทุกบรรทัด
 *   3 TEFAuth                ปุ่ม Sign in with Google · รหัสทางอีเมล (ทางสำรอง) · ออกจากระบบ
 *   v35: กดปุ่ม Google แล้วแลกบัตร Google (1 ชม.) เป็นบัตรผ่านของระบบ 6 ชม. ทันที (googleSession)
 *        ไม่ต้องต่ออายุแบบเงียบทุกชั่วโมงอีก (iPhone/Safari ต่อไม่ได้ → เคยเด้งไปหน้า Login ตอนกดตะกร้า)
 * ใส่ใน <head> ก่อนสคริปต์อื่น: config.js → tef-api.js → i18n.js → tef-shell.js → accounts.google.com/gsi/client
 * ที่เก็บในเบราว์เซอร์: localStorage tef_ses (บัตรผ่านของระบบ 6 ชม.), tef_by (GOOGLE/EMAIL), tef_names (ชื่อสินค้าอังกฤษ)
 *                      tef_idt (บัตร Google แบบเดิม ≤ 1 ชม. เหลือเฉพาะเครื่องที่เข้าก่อน v35 จะถูกแลกเป็นบัตรผ่านอัตโนมัติ)
 *                      sessionStorage tef_me (ชื่อ/บทบาท จำไว้ 5 นาที)
 */
(function () {
  'use strict';
  var C = window.TEF_CONFIG || {};
  var K_IDT = 'tef_idt', K_SES = 'tef_ses', K_BY = 'tef_by', K_ME = 'tef_me', K_NAMES = 'tef_names';
  var PRE = { apiPing: 1, otpRequest: 1, otpVerify: 1, sessionCheck: 1, otpLogout: 1, googleSession: 1 };
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
    var s = ls(K_SES); if (s) return { ses: s };
    var t = freshIdt(); return t ? { idt: t } : {};
  }
  function forget() { ls(K_IDT, null); ls(K_SES, null); ls(K_BY, null); ss(K_ME, null); }

  /** v35: แลกบัตร Google เป็นบัตรผ่านของระบบ 6 ชม. */
  function exchange(t) {
    return post('googleSession', [t]).then(function (r) {
      ls(K_SES, r.tok); ls(K_BY, 'GOOGLE'); ls(K_IDT, null); ss(K_ME, null);
      return r;
    });
  }
  /** เครื่องที่ยังเก็บบัตร Google แบบเดิม: ยังไม่หมดอายุ → แลกเป็นบัตรผ่าน · หมดแล้ว → ลบทิ้ง (ไปหน้า Login ทันที ไม่ต้องรอ) */
  function upgrade() {
    var t = ls(K_IDT);
    if (!t || ls(K_SES)) return Promise.resolve();
    if (!freshIdt()) { ls(K_IDT, null); return Promise.resolve(); }
    return exchange(t).catch(function () {});        // แลกไม่ได้ (หลังบ้านรุ่นเก่า/เน็ตหลุด) → ใช้บัตร Google ต่อไปจนหมดอายุ
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

  /** เรียกหลังบ้าน · บัตรหมดอายุหรือไม่มีบัตร → ลบบัตรในเครื่อง แล้วไปหน้าเข้าสู่ระบบพร้อมจำหน้าเดิม (ตะกร้าอยู่ใน ?add= ไม่หาย) */
  function call(fn, args) {
    if (PRE[fn]) return post(fn, args);
    return upgrade().then(function () { return post(fn, args); })
      .catch(function (e) {
        if (/^AUTH_/.test(e.code || '')) { forget(); Auth.toLogin('expired'); }
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
  var inited = false;
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
      auto_select: true,              // เคยเข้าแล้ว กดปุ่มครั้งเดียวไม่ต้องเลือกบัญชีซ้ำ (ถ้าเบราว์เซอร์อนุญาต)
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      itp_support: true,
      context: 'signin'
    });
  }
  /** กดปุ่ม Google สำเร็จ → แลกเป็นบัตรผ่าน 6 ชม. แล้วค่อยไปต่อ */
  function onCredential(r) {
    var t = r && r.credential;
    if (!t) return;
    ss(K_ME, null);
    if (typeof Auth.onSignInStart === 'function') Auth.onSignInStart();
    exchange(t).then(function () {
      if (typeof Auth.onSignIn === 'function') Auth.onSignIn();
    }, function (e) {
      if (e && (e.code === 'NOT_ALLOWED' || e.code === 'AUTH_REQUIRED')) {   // หลังบ้านยังเป็นรุ่นก่อน v35 (ไม่รู้จัก googleSession): ใช้บัตร Google แบบเดิม
        ls(K_IDT, t); ls(K_SES, null); ls(K_BY, null);
        if (typeof Auth.onSignIn === 'function') Auth.onSignIn();
        return;
      }
      if (typeof Auth.onSignInFail === 'function') Auth.onSignInFail(e);
      else if (window.console) console.error('[TEF] googleSession', e);
    });
  }
  function pageKey() {
    var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    for (var k in PAGES) if (PAGES[k] === f) return k;
    return f === 'privacy.html' ? 'privacy' : 'login';
  }

  var Auth = {
    onSignIn: null,                   // หน้าเข้าสู่ระบบตั้งค่าเอง: เข้าได้แล้ว
    onSignInFail: null,               // หน้าเข้าสู่ระบบตั้งค่าเอง: แลกบัตรไม่สำเร็จ (ไม่มีสิทธิ์ เน็ตหลุด)
    googleSession: function (t) { return exchange(t); },

    renderButton: function (el, lang) {
      return whenGis(10000).then(function (id) {
        init(id);
        id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with',
                              shape: 'pill', width: 280, locale: lang === 'en' ? 'en' : 'th' });
      });
    },

    otpRequest: function (email) { return call('otpRequest', [email]); },
    otpVerify: function (email, code) {
      return call('otpVerify', [email, code]).then(function (r) {
        ls(K_SES, r.tok); ls(K_BY, 'EMAIL'); ls(K_IDT, null); ss(K_ME, null);
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

    signedIn: function () { return !!(ls(K_SES) || freshIdt()); },
    authBy: function () { return ls(K_SES) ? (ls(K_BY) || 'EMAIL') : (freshIdt() ? 'GOOGLE' : ''); },

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
      forget();
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
