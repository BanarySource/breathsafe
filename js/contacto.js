/* Formulario de contacto (FormSubmit.co vía AJAX, con respaldo mailto) */
(function () {
  "use strict";
  var $ = BS.$, C = window.BS_CONFIG;
  var form = $("#contact-form"), msg = $("#contact-msg"), btn = form.querySelector("button[type=submit]");

  function mailto(d) {
    var body = "Nombre: " + d.nombre + "\nCorreo: " + d.correo + "\nOrganización: " + d.organizacion + "\n\n" + d.mensaje;
    return "mailto:" + C.CONTACT_TO + "?cc=" + encodeURIComponent(C.CONTACT_CC) +
      "&subject=" + encodeURIComponent("[BreathSafe] " + d.asunto) + "&body=" + encodeURIComponent(body);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (form._honey.value) return;
    var d = { nombre: form.nombre.value.trim(), correo: form.correo.value.trim(), organizacion: form.organizacion.value.trim(),
      asunto: form.asunto.value.trim(), mensaje: form.mensaje.value.trim() };
    if (!d.nombre || !d.correo || !d.asunto || !d.mensaje) { BS.showMsg(msg, "Complete los campos obligatorios.", false); return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      var res = await fetch("https://formsubmit.co/ajax/" + C.CONTACT_TO, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: d.nombre, email: d.correo, "Organización": d.organizacion || "—", _subject: "[BreathSafe] " + d.asunto,
          message: d.mensaje, _cc: C.CONTACT_CC, _template: "table", _captcha: "false" })
      });
      var j = await res.json().catch(function () { return {}; });
      if (!res.ok || String(j.success) === "false") throw new Error(j.message || "Error de envío");
      BS.showMsg(msg, "Mensaje enviado. El equipo de BreathSafe responderá a la brevedad.", true);
      form.reset();
    } catch (err) {
      msg.innerHTML = "No fue posible enviar el mensaje automáticamente. <a href='" + mailto(d) + "'>Enviar por correo electrónico</a>.";
      msg.className = "form-msg show err";
    } finally { btn.disabled = false; btn.textContent = "Enviar mensaje"; }
  });
})();
