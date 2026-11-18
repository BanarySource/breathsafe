/* Panel del paciente */
(async function () {
  "use strict";
  var $ = BS.$;
  try { await BS.ready; } catch (e) { $("#app").innerHTML = "<div class='notice notice-warn'>" + BS.esc(e.message) + "</div>"; return; }
  var u = await BS.api.user();
  if (!u) { location.replace("acceso.html"); return; }
  if (!u.device) { location.replace("vincular.html"); return; }

  BS.$$("[data-patient-name]").forEach(function (el) { el.textContent = u.name || u.email; });
  BS.$$("[data-device-id]").forEach(function (el) { el.textContent = u.device; });
  if (BS.api.mode === "demo") BS.$$("[data-demo-only]").forEach(function (el) { el.classList.remove("hidden"); });

  var dash = new BS.Dashboard($("#app"), { getHistory: function (r) { return BS.api.history(r, u.device); } });
  await dash.init();
  var payloadEl = $("#payload");
  BS.api.live(u.device, function (p) {
    dash.onReading(p);
    if (payloadEl) payloadEl.textContent = JSON.stringify(BS.sim.payload(u.device, p), null, 2);
  });

  // Modo consulta médica
  function setMedical(on) {
    document.body.classList.toggle("medical-mode", on);
    window.scrollTo(0, 0);
    if (dash.charts.main) setTimeout(function () { dash.charts.main.resize(); dash.charts.flow.resize(); }, 50);
  }
  $("#btn-medico").addEventListener("click", function () { setMedical(true); });
  $("#btn-exit-medico").addEventListener("click", function () { setMedical(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMedical(false); });

  BS.$$("[data-export]").forEach(function (b) {
    b.addEventListener("click", function () { dash.exportPdf({ patient: u, device: u.device }); });
  });
  var ev = $("#btn-event");
  if (ev) ev.addEventListener("click", function () { BS.api.forceEvent(); ev.textContent = "Evento simulado en curso…"; setTimeout(function () { ev.textContent = "Simular evento respiratorio"; }, 10000); });

  // PIN temporal para el médico
  var pinTimer = null;
  $("#btn-pin").addEventListener("click", async function () {
    var box = $("#pin-box"), msg = $("#pin-msg");
    try {
      var r = await BS.api.createPin();
      box.classList.remove("hidden");
      $("#pin-value").textContent = r.pin;
      clearInterval(pinTimer);
      var tick = function () {
        var s = Math.max(0, Math.round((r.expires - Date.now()) / 1000));
        $("#pin-left").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        if (!s) { clearInterval(pinTimer); $("#pin-value").textContent = "Expirado"; }
      };
      tick(); pinTimer = setInterval(tick, 1000);
      msg.className = "form-msg";
    } catch (e) { BS.showMsg(msg, e.message, false); }
  });

  // Perfil
  var pf = $("#profile-form");
  if (pf) {
    pf.name.value = u.name || ""; pf.age.value = u.age || ""; pf.gender.value = u.gender || ""; pf.notes.value = u.notes || "";
    pf.addEventListener("submit", async function (e) {
      e.preventDefault();
      try {
        var nu = await BS.api.updateProfile({ name: pf.name.value.trim(), age: pf.age.value ? Number(pf.age.value) : null, gender: pf.gender.value, notes: pf.notes.value.trim() });
        Object.assign(u, nu);
        BS.$$("[data-patient-name]").forEach(function (el) { el.textContent = u.name || u.email; });
        BS.showMsg($("#profile-msg"), "Perfil actualizado.", true);
      } catch (err) { BS.showMsg($("#profile-msg"), err.message, false); }
    });
  }

  $("#btn-logout").addEventListener("click", async function () { await BS.api.logout(); location.href = "acceso.html"; });
  $("#btn-unlink").addEventListener("click", async function () {
    await BS.api.unlinkDevice(); location.href = "vincular.html";
  });
})();
