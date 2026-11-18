/*
 * Capa de datos de BreathSafe.
 * - Modo demostración (por defecto): todo se guarda en localStorage de este navegador y las
 *   lecturas provienen del dispositivo simulado (js/sim.js).
 * - Modo Supabase: se activa al llenar js/config.js. Requiere supabase/schema.sql.
 * Todas las funciones son asíncronas para que ambos modos compartan la misma interfaz.
 */
(function () {
  "use strict";
  var BS = (window.BS = window.BS || {});
  var C = window.BS_CONFIG || { DEMO: true, PIN_MINUTES: 30, SIM_INTERVAL_MS: 2000 };
  var DEVICE_RE = /^BS-\d{4}-[A-Z0-9]{3}$/;

  function err(msg) { return Promise.reject(new Error(msg)); }
  function rangeStart(range) {
    var r = BS.sim.RANGES[range] || BS.sim.RANGES.hora;
    if (r.span) return Date.now() - r.span;
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }
  function genPin() {
    var a = new Uint32Array(1); crypto.getRandomValues(a);
    return String(100000 + (a[0] % 900000));
  }
  async function sha256(t) {
    var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }

  /* ---------------- MODO DEMOSTRACIÓN ---------------- */
  var demo = {
    mode: "demo",
    _users: function () { return BS.store.get("bs_users", {}); },
    _save: function (u) { BS.store.set("bs_users", u); },
    _public: function (u) { if (!u) return null; var c = Object.assign({}, u); delete c.hash; return c; },

    register: async function (p) {
      var email = String(p.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("Correo electrónico no válido.");
      if (String(p.password || "").length < 8) return err("La contraseña debe tener al menos 8 caracteres.");
      var users = this._users();
      if (users[email]) return err("Ya existe una cuenta con ese correo.");
      users[email] = { email: email, name: String(p.name || "").trim(), age: p.age ? Number(p.age) : null,
        gender: p.gender || "", notes: String(p.notes || "").trim(), device: null,
        hash: await sha256(email + ":" + p.password), created: Date.now() };
      this._save(users);
      BS.store.set("bs_session", email);
      return this._public(users[email]);
    },
    login: async function (email, password) {
      email = String(email || "").trim().toLowerCase();
      var u = this._users()[email];
      if (!u || u.hash !== await sha256(email + ":" + password)) return err("Correo o contraseña incorrectos.");
      BS.store.set("bs_session", email);
      return this._public(u);
    },
    user: async function () { var e = BS.store.get("bs_session", null); return e ? this._public(this._users()[e]) : null; },
    logout: async function () { BS.store.del("bs_session"); },
    updateProfile: async function (patch) {
      var e = BS.store.get("bs_session", null), users = this._users();
      if (!e || !users[e]) return err("Sesión no válida.");
      ["name", "age", "gender", "notes"].forEach(function (k) { if (k in patch) users[e][k] = patch[k]; });
      this._save(users); return this._public(users[e]);
    },
    linkDevice: async function (id) {
      id = String(id || "").trim().toUpperCase();
      if (!DEVICE_RE.test(id)) return err("Formato de código no válido. Ejemplo: BS-2026-X89.");
      var e = BS.store.get("bs_session", null), users = this._users();
      if (!e || !users[e]) return err("Inicie sesión para vincular un dispositivo.");
      users[e].device = id; users[e].linkedAt = Date.now(); this._save(users);
      return id;
    },
    unlinkDevice: async function () {
      var e = BS.store.get("bs_session", null), users = this._users();
      if (users[e]) { users[e].device = null; this._save(users); }
    },
    history: async function (range, deviceId) { return BS.sim.history(deviceId, range); },
    live: function (deviceId, cb) {
      var dev = new BS.sim.LiveDevice(deviceId);
      this._dev = dev;
      cb(dev.last);
      var h = setInterval(function () { cb(dev.next()); }, C.SIM_INTERVAL_MS || 2000);
      return function () { clearInterval(h); };
    },
    forceEvent: function () { if (this._dev) this._dev.forceEvent(); },
    createPin: async function () {
      var u = await this.user();
      if (!u || !u.device) return err("Vincule un dispositivo antes de generar un PIN.");
      var pins = BS.store.get("bs_pins", {}), now = Date.now();
      Object.keys(pins).forEach(function (k) { if (pins[k].expires < now || pins[k].email === u.email) delete pins[k]; });
      var pin = genPin(), exp = now + (C.PIN_MINUTES || 30) * 60e3;
      pins[pin] = { email: u.email, device: u.device, expires: exp };
      BS.store.set("bs_pins", pins);
      return { pin: pin, expires: exp };
    },
    redeemPin: async function (pin) {
      var rec = BS.store.get("bs_pins", {})[String(pin).trim()];
      if (!rec) return err("PIN no encontrado. En modo demostración el PIN solo es válido en el mismo navegador donde se generó.");
      if (rec.expires < Date.now()) return err("El PIN ha expirado. Solicite al paciente uno nuevo.");
      var u = this._public(this._users()[rec.email]);
      return { patient: { name: u.name, age: u.age, gender: u.gender, notes: u.notes }, device: rec.device, expires: rec.expires };
    },
    historyByPin: async function (pin, range) { var s = await this.redeemPin(pin); return BS.sim.history(s.device, range); },
    liveByPin: function (pin, deviceId, cb) { return this.live(deviceId, cb); }
  };

  /* ---------------- MODO SUPABASE ---------------- */
  function supa() {
    var client = null;
    function sb() {
      if (!client) client = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
      return client;
    }
    function row2pt(r) { return { t: new Date(r.ts).getTime(), rr: r.rr, spo2: r.spo2, flow: r.flow, temp: r.temp }; }
    function chk(res) { if (res.error) throw new Error(res.error.message); return res.data; }
    return {
      mode: "supabase",
      register: async function (p) {
        var d = chk(await sb().auth.signUp({ email: p.email, password: p.password,
          options: { data: { name: p.name, age: p.age ? Number(p.age) : null, gender: p.gender || "", notes: p.notes || "" } } }));
        if (!d.session) throw new Error("Cuenta creada. Revise su correo para confirmarla y después inicie sesión.");
        return this.user();
      },
      login: async function (email, password) { chk(await sb().auth.signInWithPassword({ email: email, password: password })); return this.user(); },
      user: async function () {
        var s = (await sb().auth.getSession()).data.session; if (!s) return null;
        var prof = chk(await sb().from("profiles").select("*").eq("id", s.user.id).maybeSingle()) || {};
        var dev = chk(await sb().from("devices").select("id").eq("owner", s.user.id).limit(1));
        return { email: s.user.email, name: prof.name, age: prof.age, gender: prof.gender, notes: prof.notes, device: dev[0] ? dev[0].id : null };
      },
      logout: async function () { await sb().auth.signOut(); },
      updateProfile: async function (patch) {
        var s = (await sb().auth.getSession()).data.session;
        chk(await sb().from("profiles").update(patch).eq("id", s.user.id)); return this.user();
      },
      linkDevice: async function (id) {
        id = String(id || "").trim().toUpperCase();
        if (!DEVICE_RE.test(id)) throw new Error("Formato de código no válido. Ejemplo: BS-2026-X89.");
        chk(await sb().rpc("claim_device", { p_device_id: id })); return id;
      },
      unlinkDevice: async function () { chk(await sb().rpc("release_device")); },
      history: async function (range, deviceId) {
        var rows = chk(await sb().from("readings").select("ts,rr,spo2,flow,temp").eq("device_id", deviceId)
          .gte("ts", new Date(rangeStart(range)).toISOString()).order("ts").limit(5000));
        return rows.map(row2pt);
      },
      live: function (deviceId, cb) {
        var ch = sb().channel("readings-" + deviceId).on("postgres_changes",
          { event: "INSERT", schema: "public", table: "readings", filter: "device_id=eq." + deviceId },
          function (p) { cb(row2pt(p.new)); }).subscribe();
        return function () { sb().removeChannel(ch); };
      },
      forceEvent: function () {},
      createPin: async function () {
        var d = chk(await sb().rpc("create_medical_pin", { p_minutes: C.PIN_MINUTES || 30 }));
        var r = Array.isArray(d) ? d[0] : d; return { pin: r.pin, expires: new Date(r.expires_at).getTime() };
      },
      redeemPin: async function (pin) {
        var d = chk(await sb().rpc("pin_patient", { p_pin: String(pin).trim() }));
        if (!d) throw new Error("PIN no válido o expirado.");
        return { patient: d.patient, device: d.device, expires: new Date(d.expires_at).getTime() };
      },
      historyByPin: async function (pin, range) {
        var rows = chk(await sb().rpc("pin_readings", { p_pin: String(pin).trim(), p_since: new Date(rangeStart(range)).toISOString() }));
        return (rows || []).map(row2pt);
      },
      liveByPin: function (pin, deviceId, cb) {
        var last = new Date().toISOString(), stop = false;
        var h = setInterval(async function () {
          if (stop) return;
          var rows = (await sb().rpc("pin_readings", { p_pin: pin, p_since: last })).data || [];
          rows.forEach(function (r) { last = r.ts; cb(row2pt(r)); });
        }, 5000);
        return function () { stop = true; clearInterval(h); };
      }
    };
  }

  BS.api = C.DEMO ? demo : supa();
  BS.api.DEVICE_RE = DEVICE_RE;

  // Carga perezosa de supabase-js sólo cuando se usa el backend real
  BS.ready = C.DEMO ? Promise.resolve() : new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
    s.onload = res; s.onerror = function () { rej(new Error("No se pudo cargar Supabase.")); };
    document.head.appendChild(s);
  });
})();
