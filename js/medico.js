/* Acceso temporal del médico mediante PIN de 6 dígitos (solo lectura) */
(async function () {
  "use strict";
  var $ = BS.$;
  await BS.ready;
  var form = $("#pin-form"), msg = $("#pin-msg"), stopLive = null, timer = null;

  form.pin.addEventListener("input", function () { form.pin.value = form.pin.value.replace(/\D/g, "").slice(0, 6); });
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var pin = form.pin.value;
    if (!/^\d{6}$/.test(pin)) { BS.showMsg(msg, "El PIN debe tener 6 dígitos.", false); return; }
    try {
      var s = await BS.api.redeemPin(pin);
      open(pin, s);
    } catch (err) { BS.showMsg(msg, err.message, false); }
  });

  async function open(pin, s) {
    $("#pin-section").classList.add("hidden");
    $("#app").classList.remove("hidden");
    document.body.classList.add("medical-mode");
    var p = s.patient || {};
    $("#pt-name").textContent = p.name || "—";
    $("#pt-age").textContent = p.age ? p.age + " años" : "—";
    $("#pt-gender").textContent = p.gender || "—";
    $("#pt-notes").textContent = p.notes || "—";
    BS.$$("[data-device-id]").forEach(function (el) { el.textContent = s.device; });

    var dash = new BS.Dashboard($("#app"), { getHistory: function (r) { return BS.api.historyByPin(pin, r); } });
    await dash.init();
    stopLive = BS.api.liveByPin(pin, s.device, function (pt) { dash.onReading(pt); });
    BS.$$("[data-export]").forEach(function (b) { b.addEventListener("click", function () { dash.exportPdf({ patient: p, device: s.device }); }); });

    var tick = function () {
      var sec = Math.max(0, Math.round((s.expires - Date.now()) / 1000));
      $("#pin-left").textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
      if (!sec) close("La sesión de consulta expiró. Solicite al paciente un nuevo PIN.");
    };
    tick(); timer = setInterval(tick, 1000);
  }

  function close(text) {
    clearInterval(timer); if (stopLive) stopLive();
    document.body.classList.remove("medical-mode");
    $("#app").classList.add("hidden");
    $("#pin-section").classList.remove("hidden");
    form.reset();
    if (text) BS.showMsg(msg, text, false); else msg.className = "form-msg";
  }
  $("#btn-close").addEventListener("click", function () { close(); });
})();
