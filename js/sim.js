/*
 * Umbrales clínicos y simulador del prototipo BreathSafe.
 *
 * Umbrales basados en NEWS2 (National Early Warning Score 2, Royal College of Physicians, 2017),
 * escala para adultos (≥16 años), SpO2 escala 1:
 *   Frecuencia respiratoria (rpm): 12–20 → 0 pts | 9–11 → 1 | 21–24 → 2 | ≤8 o ≥25 → 3
 *   SpO2 (%):                     ≥96 → 0 pts   | 94–95 → 1 | 92–93 → 2 | ≤91 → 3
 * Semáforo: 0 pts = verde (normal), 1–2 pts = amarillo (alerta), 3 pts = rojo (crítico).
 * El flujo de aire y la temperatura son informativos (NEWS2 no los incluye).
 */
(function () {
  "use strict";
  var BS = (window.BS = window.BS || {});

  var METRICS = {
    rr:   { key: "rr",   label: "Frecuencia respiratoria", unit: "rpm",   dec: 0, color: "#1E5AA8" },
    spo2: { key: "spo2", label: "Saturación de oxígeno (SpO₂)", unit: "%", dec: 0, color: "#0E8A7E" },
    flow: { key: "flow", label: "Flujo de aire", unit: "L/min", dec: 1, color: "#7C3AED" },
    temp: { key: "temp", label: "Temperatura ambiente", unit: "°C", dec: 1, color: "#B45309" }
  };

  function news2Points(metric, v) {
    if (v == null || isNaN(v)) return null;
    if (metric === "rr") {
      if (v <= 8 || v >= 25) return 3;
      if (v >= 21) return 2;
      if (v <= 11) return 1;
      return 0;
    }
    if (metric === "spo2") {
      if (v <= 91) return 3;
      if (v <= 93) return 2;
      if (v <= 95) return 1;
      return 0;
    }
    return null; // informativo
  }
  function classify(metric, v) {
    var p = news2Points(metric, v);
    if (p === null) return "na";
    return p === 0 ? "ok" : p === 3 ? "crit" : "warn";
  }
  function overall(reading) {
    if (!reading) return "na";
    var a = classify("rr", reading.rr), b = classify("spo2", reading.spo2);
    if (a === "crit" || b === "crit") return "crit";
    if (a === "warn" || b === "warn") return "warn";
    if (a === "na" && b === "na") return "na";
    return "ok";
  }
  var STATUS_TEXT = { ok: "Normal", warn: "Alerta", crit: "Crítico", na: "Sin dato" };
  var RANGES_TEXT = {
    rr: "Normal 12–20 · Alerta 9–11 / 21–24 · Crítico ≤8 / ≥25",
    spo2: "Normal ≥96 · Alerta 92–95 · Crítico ≤91",
    flow: "Informativo (sin umbral clínico)",
    temp: "Informativo (si el prototipo lo incluye)"
  };

  // --- Ruido determinista (mismo historial para el mismo dispositivo) ---
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed, n) { var t = (seed + Math.imul(n, 0x9E3779B1)) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function r1(v, d) { var f = Math.pow(10, d); return Math.round(v * f) / f; }

  function pointAt(deviceId, ts, slot) {
    var seed = hashStr(deviceId || "BS");
    var hour = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    var night = (hour < 6 || hour > 23) ? 1 : 0;
    var n1 = rnd(seed, slot), n2 = rnd(seed + 7, slot), n3 = rnd(seed + 13, slot), ev = rnd(seed + 29, slot);
    var rr = 16 - night * 2 + Math.sin(ts / 3.6e6) * 1.2 + (n1 - 0.5) * 2.4;
    var spo2 = 97.2 + (n2 - 0.5) * 1.6 + (night ? -0.4 : 0);
    var flow = 7 + (rr - 14) * 0.55 + (n3 - 0.5) * 1.5;
    var temp = 22.5 + Math.sin((hour - 9) / 24 * Math.PI * 2) * 2 + (n3 - 0.5) * 0.6;
    if (ev < 0.035) { spo2 -= 3.2; rr += 5.5; }        // evento de alerta
    if (ev < 0.008) { spo2 -= 3.5; rr += 4; }          // evento crítico
    return { t: ts, rr: r1(rr, 0), spo2: Math.min(100, r1(spo2, 0)), flow: r1(Math.max(2, flow), 1), temp: r1(temp, 1) };
  }

  var RANGES = {
    hora: { label: "Última hora", span: 3600e3, step: 60e3 },
    hoy:  { label: "Hoy", span: null, step: 10 * 60e3 },
    "7d": { label: "Últimos 7 días", span: 7 * 864e5, step: 3600e3 },
    mes:  { label: "Último mes", span: 30 * 864e5, step: 6 * 3600e3 }
  };

  function history(deviceId, rangeKey, now) {
    now = now || Date.now();
    var r = RANGES[rangeKey] || RANGES.hora;
    var start;
    if (r.span === null) { var d = new Date(now); d.setHours(0, 0, 0, 0); start = d.getTime(); if (now - start < r.step * 6) start = now - r.step * 6; }
    else start = now - r.span;
    var step = r.step, out = [];
    var first = Math.ceil(start / step) * step;
    for (var t = first; t <= now; t += step) out.push(pointAt(deviceId, t, Math.floor(t / step)));
    return out;
  }

  // --- Dispositivo simulado en vivo ---
  function LiveDevice(deviceId) {
    this.id = deviceId;
    this.last = pointAt(deviceId, Date.now(), 1);
    this.forced = 0;
  }
  LiveDevice.prototype.next = function () {
    var p = this.last, j = function (a) { return (Math.random() - 0.5) * a; };
    var rr = p.rr + j(1.6), spo2 = p.spo2 + j(0.9);
    rr += (16 - rr) * 0.25; spo2 += (97 - spo2) * 0.3;          // regreso a la media
    if (this.forced > 0) { this.forced--; rr = 23 + Math.random() * 3; spo2 = 91 + Math.random() * 2; }
    else if (Math.random() < 0.02) { rr += 4; spo2 -= 2.5; }
    var flow = 7 + (rr - 14) * 0.55 + j(0.8), temp = p.temp + j(0.1);
    this.last = { t: Date.now(), rr: r1(Math.max(6, rr), 0), spo2: Math.min(100, r1(spo2, 0)), flow: r1(Math.max(2, flow), 1), temp: r1(temp, 1) };
    return this.last;
  };
  LiveDevice.prototype.forceEvent = function () { this.forced = 5; };

  function payload(deviceId, r) {
    return { device_id: deviceId, timestamp: new Date(r.t).toISOString(),
      metrics: { respiratory_rate_bpm: r.rr, spo2_percentage: r.spo2, air_flow_lmin: r.flow, system_status: { ok: "NORMAL", warn: "ALERTA", crit: "CRITICO", na: "SIN_DATO" }[overall(r)] } };
  }

  BS.sim = { METRICS: METRICS, RANGES: RANGES, RANGES_TEXT: RANGES_TEXT, STATUS_TEXT: STATUS_TEXT,
    news2Points: news2Points, classify: classify, overall: overall, history: history, LiveDevice: LiveDevice, payload: payload };
})();
