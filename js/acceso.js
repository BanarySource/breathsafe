/* Registro e inicio de sesión */
(async function () {
  "use strict";
  var $ = BS.$;
  await BS.ready;
  if (await BS.api.user()) { location.replace("panel.html"); return; }
  if (BS.api.mode !== "demo") BS.$$("[data-demo-note]").forEach(function (el) { el.classList.add("hidden"); });

  function show(which) {
    BS.$$(".tab").forEach(function (t) { t.setAttribute("aria-selected", t.dataset.tab === which ? "true" : "false"); });
    $("#login-form").classList.toggle("hidden", which !== "login");
    $("#register-form").classList.toggle("hidden", which !== "register");
  }
  BS.$$(".tab").forEach(function (t) { t.addEventListener("click", function () { show(t.dataset.tab); }); });
  if (location.hash === "#registro") show("register");

  function go(u) { location.href = u && u.device ? "panel.html" : "vincular.html"; }

  $("#login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, msg = $("#login-msg");
    try { go(await BS.api.login(f.email.value, f.password.value)); }
    catch (err) { BS.showMsg(msg, err.message, false); }
  });

  $("#register-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, msg = $("#register-msg");
    if (f.password.value !== f.password2.value) { BS.showMsg(msg, "Las contraseñas no coinciden.", false); return; }
    if (!f.consent.checked) { BS.showMsg(msg, "Debe aceptar el aviso de privacidad.", false); return; }
    try {
      go(await BS.api.register({ name: f.name.value, email: f.email.value, password: f.password.value,
        age: f.age.value, gender: f.gender.value, notes: f.notes.value }));
    } catch (err) { BS.showMsg(msg, err.message, /confirm/i.test(err.message)); }
  });

  var demoBtn = $("#btn-demo-account");
  if (demoBtn) demoBtn.addEventListener("click", async function () {
    var email = "demo@breathsafe.mx", pass = "breathsafe2026";
    try { await BS.api.login(email, pass); }
    catch (e) {
      await BS.api.register({ name: "Paciente de demostración", email: email, password: pass, age: 54, gender: "No especificado", notes: "Cuenta de ejemplo para evaluación." });
    }
    await BS.api.linkDevice("BS-2026-X89");
    location.href = "panel.html";
  });
})();
