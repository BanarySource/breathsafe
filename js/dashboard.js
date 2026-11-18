/* Componentes compartidos del panel (paciente y vista médica): tarjetas, gráficas, estadísticas y PDF */
(function () {
  "use strict";
  var BS = (window.BS = window.BS || {});
  var M = function () { return BS.sim.METRICS; };
  var COLORS = { ok: "#22A355", warn: "#E59E0B", crit: "#DC2626", na: "#94A3B8" };
  var KEYS = ["rr", "spo2", "flow", "temp"];

  function fmt(v, d) { return v == null || isNaN(v) ? "—" : Number(v).toFixed(d); }
  function label(t, range) {
    var d = new Date(t);
    if (range === "hora" || range === "hoy") return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    if (range === "7d") return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }) + " " + d.getHours() + "h";
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  }
  function downsample(pts, max) {
    if (pts.length <= max) return pts;
    var step = pts.length / max, out = [];
    for (var i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
    out.push(pts[pts.length - 1]); return out;
  }

  function stats(points) {
    var res = {};
    KEYS.forEach(function (k) {
      var vals = points.map(function (p) { return p[k]; }).filter(function (v) { return v != null && !isNaN(v); });
      if (!vals.length) { res[k] = { min: null, avg: null, max: null, n: 0, warn: 0, crit: 0 }; return; }
      var s = 0, mn = Infinity, mx = -Infinity, w = 0, c = 0;
      vals.forEach(function (v) { s += v; if (v < mn) mn = v; if (v > mx) mx = v; var st = BS.sim.classify(k, v); if (st === "warn") w++; if (st === "crit") c++; });
      res[k] = { min: mn, avg: s / vals.length, max: mx, n: vals.length, warn: w, crit: c };
    });
    return res;
  }
  function events(points) {
    return points.filter(function (p) { var s = BS.sim.overall(p); return s === "warn" || s === "crit"; })
      .map(function (p) { return { t: p.t, status: BS.sim.overall(p), rr: p.rr, spo2: p.spo2 }; }).reverse();
  }

  var whiteBg = { id: "whiteBg", beforeDraw: function (c) { var x = c.ctx; x.save(); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.restore(); } };

  function Dashboard(root, opts) {
    this.root = root; this.opts = opts; this.range = "hora"; this.points = []; this.live = []; this.charts = {};
  }
  Dashboard.prototype.$ = function (s) { return this.root.querySelector(s); };

  Dashboard.prototype.init = function () {
    var self = this;
    var kp = this.$("#kpis");
    kp.innerHTML = KEYS.map(function (k) {
      var m = M()[k];
      var extra = k === "temp" ? '<div class="range"><em>Si el prototipo lo incluye</em></div>' : "";
      return '<div class="card kpi" id="kpi-' + k + '"><span class="status-pill st-na" data-pill>Sin dato</span>' +
        '<div class="label">' + m.label + '</div><div class="value"><span data-val>—</span><span class="unit">' + m.unit + '</span></div>' +
        '<div class="range">' + BS.sim.RANGES_TEXT[k] + '</div>' + extra + '</div>';
    }).join("");

    BS.$$("[data-range]", this.root).forEach(function (b) {
      b.addEventListener("click", function () { self.setRange(b.getAttribute("data-range")); });
    });

    if (window.Chart) {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.color = "#516072";
      var pointColor = function (k) { return function (ctx) { var v = ctx.raw; return COLORS[BS.sim.classify(k, v)] || COLORS.na; }; };
      var pointRadius = function (k) { return function (ctx) { var s = BS.sim.classify(k, ctx.raw); return s === "ok" ? 0 : 3.5; }; };
      this.charts.main = new Chart(this.$("#chart-main"), {
        type: "line", plugins: [whiteBg],
        data: { labels: [], datasets: [
          { label: "Frecuencia respiratoria (rpm)", data: [], yAxisID: "y", borderColor: M().rr.color, backgroundColor: M().rr.color, borderWidth: 2, tension: .3, pointRadius: pointRadius("rr"), pointBackgroundColor: pointColor("rr") },
          { label: "SpO₂ (%)", data: [], yAxisID: "y1", borderColor: M().spo2.color, backgroundColor: M().spo2.color, borderWidth: 2, tension: .3, pointRadius: pointRadius("spo2"), pointBackgroundColor: pointColor("spo2") }
        ] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
          scales: { y: { position: "left", suggestedMin: 8, suggestedMax: 28, title: { display: true, text: "rpm" } },
            y1: { position: "right", suggestedMin: 88, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "SpO₂ %" } },
            x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } } },
          plugins: { legend: { position: "bottom" } } }
      });
      this.charts.flow = new Chart(this.$("#chart-flow"), {
        type: "line", plugins: [whiteBg],
        data: { labels: [], datasets: [
          { label: "Flujo de aire (L/min)", data: [], borderColor: M().flow.color, backgroundColor: "rgba(124,58,237,.08)", fill: true, borderWidth: 2, tension: .3, pointRadius: 0 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
          scales: { y: { suggestedMin: 0, suggestedMax: 14, title: { display: true, text: "L/min" } }, x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } } },
          plugins: { legend: { position: "bottom" } } }
      });
    }
    return this.setRange("hora");
  };

  Dashboard.prototype.setRange = async function (r) {
    this.range = r;
    BS.$$("[data-range]", this.root).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-range") === r ? "true" : "false"); });
    var lbl = this.$("[data-range-label]"); if (lbl) lbl.textContent = BS.sim.RANGES[r].label;
    try { this.points = await this.opts.getHistory(r); } catch (e) { this.points = []; }
    if (r === "hora") { var from = Date.now() - 3600e3; this.live = this.live.filter(function (p) { return p.t >= from; }); }
    this.render();
  };

  Dashboard.prototype.allPoints = function () {
    if (this.range !== "hora" && this.range !== "hoy") return this.points;
    var last = this.points.length ? this.points[this.points.length - 1].t : 0;
    return this.points.concat(this.live.filter(function (p) { return p.t > last; }));
  };

  Dashboard.prototype.render = function () {
    var pts = this.allPoints(), range = this.range;
    if (this.charts.main) {
      var ds = downsample(pts, 360), labels = ds.map(function (p) { return label(p.t, range); });
      this.charts.main.data.labels = labels;
      this.charts.main.data.datasets[0].data = ds.map(function (p) { return p.rr; });
      this.charts.main.data.datasets[1].data = ds.map(function (p) { return p.spo2; });
      this.charts.main.update("none");
      this.charts.flow.data.labels = labels;
      this.charts.flow.data.datasets[0].data = ds.map(function (p) { return p.flow; });
      this.charts.flow.update("none");
    }
    var st = stats(pts), tb = this.$("#stats");
    if (tb) tb.innerHTML = KEYS.map(function (k) {
      var m = M()[k], s = st[k], out = (k === "rr" || k === "spo2") ? (s.warn + s.crit) : "—";
      return "<tr><td>" + m.label + " (" + m.unit + ")</td><td class='num'>" + fmt(s.min, m.dec) + "</td><td class='num'>" + fmt(s.avg, 1) +
        "</td><td class='num'>" + fmt(s.max, m.dec) + "</td><td class='num'>" + out + "</td></tr>";
    }).join("");
    var al = this.$("#alerts"), ev = events(pts);
    var cnt = this.$("[data-alert-count]"); if (cnt) cnt.textContent = ev.length;
    if (al) al.innerHTML = ev.length ? ev.slice(0, 60).map(function (e) {
      return "<li><span class='dot " + e.status + "'></span><div><strong>" + BS.sim.STATUS_TEXT[e.status] + "</strong> · " + BS.esc(BS.fmtDate(e.t)) +
        "<br><span class='muted'>FR " + e.rr + " rpm · SpO₂ " + e.spo2 + " %</span></div></li>";
    }).join("") : "<li class='muted'>Sin alertas en el periodo seleccionado.</li>";
  };

  Dashboard.prototype.onReading = function (p) {
    this.lastReading = p;
    var self = this;
    KEYS.forEach(function (k) {
      var card = self.$("#kpi-" + k); if (!card) return;
      var st = BS.sim.classify(k, p[k]);
      card.className = "card kpi " + (st === "na" ? "" : st);
      card.querySelector("[data-val]").textContent = fmt(p[k], M()[k].dec);
      var pill = card.querySelector("[data-pill]");
      pill.className = "status-pill st-" + st;
      pill.textContent = st === "na" ? "Informativo" : BS.sim.STATUS_TEXT[st];
    });
    var o = BS.sim.overall(p), op = this.$("#overall");
    if (op) { op.className = "status-pill st-" + o; op.textContent = "Estado general: " + BS.sim.STATUS_TEXT[o]; }
    var lu = this.$("#last-update"); if (lu) lu.textContent = new Date(p.t).toLocaleTimeString("es-MX");
    this.live.push(p);
    if (this.live.length > 2000) this.live.shift();
    if (this.range === "hora") this.render();
  };

  /* ---------- Reporte PDF ---------- */
  Dashboard.prototype.exportPdf = function (info) {
    if (!window.jspdf) { alert("No se pudo cargar el generador de PDF. Verifique su conexión."); return; }
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "letter" });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), y = 16;
    var pts = this.allPoints(), st = stats(pts), ev = events(pts), self = this;
    var navy = [11, 37, 69], blue = [30, 90, 168];

    doc.setFillColor.apply(doc, navy); doc.rect(0, 0, W, 24, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("BreathSafe · Reporte para médico tratante", 14, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Generado: " + new Date().toLocaleString("es-MX") + "   ·   Periodo: " + BS.sim.RANGES[this.range].label, 14, 18);
    y = 32; doc.setTextColor(27, 36, 51);

    var p = info.patient || {};
    doc.autoTable({ startY: y, theme: "grid", head: [["Datos del paciente", ""]],
      body: [["Nombre", p.name || "—"], ["Edad", p.age ? p.age + " años" : "—"], ["Género", p.gender || "—"],
        ["Código de dispositivo", info.device || "—"], ["Notas clínicas", p.notes || "—"],
        ["Lecturas analizadas", String(pts.length)], ["Desde", pts.length ? BS.fmtDate(pts[0].t) : "—"], ["Hasta", pts.length ? BS.fmtDate(pts[pts.length - 1].t) : "—"]],
      headStyles: { fillColor: blue }, styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } } });
    y = doc.lastAutoTable.finalY + 6;

    doc.autoTable({ startY: y, theme: "striped", head: [["Métrica", "Mínimo", "Promedio", "Máximo", "Fuera de rango (NEWS2)"]],
      body: KEYS.map(function (k) { var m = M()[k], s = st[k];
        return [m.label.replace("₂", "2") + " (" + m.unit + ")", fmt(s.min, m.dec), fmt(s.avg, 1), fmt(s.max, m.dec), (k === "rr" || k === "spo2") ? (s.warn + " alerta / " + s.crit + " crítico") : "Informativo"]; }),
      headStyles: { fillColor: blue }, styles: { fontSize: 9, cellPadding: 2 } });
    y = doc.lastAutoTable.finalY + 6;

    if (this.charts.main) {
      var iw = W - 28, ih = iw * 0.42;
      if (y + ih > H - 20) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Comportamiento de las métricas", 14, y); y += 3;
      doc.addImage(this.charts.main.toBase64Image("image/jpeg", 0.9), "JPEG", 14, y, iw, ih); y += ih + 3;
      var fh = iw * 0.3;
      if (y + fh > H - 20) { doc.addPage(); y = 16; }
      doc.addImage(this.charts.flow.toBase64Image("image/jpeg", 0.9), "JPEG", 14, y, iw, fh); y += fh + 6;
    }

    if (ev.length) {
      doc.autoTable({ startY: y, theme: "grid", head: [["Eventos detectados (" + ev.length + ")", "Estado", "FR (rpm)", "SpO2 (%)"]],
        body: ev.slice(0, 15).map(function (e) { return [BS.fmtDate(e.t), BS.sim.STATUS_TEXT[e.status], e.rr, e.spo2]; }),
        headStyles: { fillColor: blue }, styles: { fontSize: 8, cellPadding: 1.6 } });
      y = doc.lastAutoTable.finalY + 6;
    }

    if (y + 70 > H - 14) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(27, 36, 51);
    doc.text("Observaciones del médico tratante", 14, y); y += 4;
    doc.setDrawColor(185, 198, 212);
    for (var i = 0; i < 6; i++) { y += 7; doc.line(14, y, W - 14, y); }
    y += 20; doc.line(14, y, 90, y); doc.line(W - 90, y, W - 14, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Nombre y cédula profesional", 14, y + 5); doc.text("Firma", W - 90, y + 5);

    var pages = doc.internal.getNumberOfPages();
    for (var pg = 1; pg <= pages; pg++) {
      doc.setPage(pg); doc.setFontSize(7.5); doc.setTextColor(81, 96, 114);
      doc.text(doc.splitTextToSize("Documento generado por un prototipo en desarrollo (BreathSafe). La información es de apoyo y no constituye un diagnóstico ni sustituye la valoración clínica. Semáforo basado en NEWS2 (Royal College of Physicians, 2017), escala para adultos." + (window.BS_CONFIG && window.BS_CONFIG.DEMO ? " DATOS SIMULADOS DE DEMOSTRACIÓN." : ""), W - 40), 14, H - 10);
      doc.text(pg + "/" + pages, W - 20, H - 6);
    }
    doc.save("BreathSafe_reporte_" + (info.device || "paciente") + "_" + new Date().toISOString().slice(0, 10) + ".pdf");
  };

  BS.Dashboard = Dashboard;
  BS.dashStats = stats;
})();
