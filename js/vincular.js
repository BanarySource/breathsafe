/* Vinculación del prototipo por código o QR */
(async function () {
  "use strict";
  var $ = BS.$;
  await BS.ready;
  var u = await BS.api.user();
  if (!u) { location.replace("acceso.html"); return; }
  BS.$$("[data-patient-name]").forEach(function (el) { el.textContent = u.name || u.email; });
  if (u.device) { $("#current-device").classList.remove("hidden"); $("#current-device-id").textContent = u.device; }

  var form = $("#link-form"), input = form.device, msg = $("#link-msg");
  input.addEventListener("input", function () { input.value = input.value.toUpperCase(); });

  async function link(code) {
    try { await BS.api.linkDevice(code); BS.showMsg(msg, "Dispositivo " + code.toUpperCase() + " vinculado. Abriendo el panel…", true); setTimeout(function () { location.href = "panel.html"; }, 900); }
    catch (e) { BS.showMsg(msg, e.message, false); }
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); link(input.value); });

  // Escaneo de QR (opcional; requiere BarcodeDetector, disponible en Chrome/Edge/Android)
  var btn = $("#btn-qr"), video = $("#qr-video"), stream = null, active = false;
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices) {
    btn.disabled = true;
    $("#qr-note").textContent = "Este navegador no permite escanear códigos QR. Escriba el código manualmente.";
    return;
  }
  btn.addEventListener("click", async function () {
    if (active) { stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream; video.classList.remove("hidden"); await video.play();
      active = true; btn.textContent = "Detener cámara";
      var det = new BarcodeDetector({ formats: ["qr_code"] });
      (async function scan() {
        if (!active) return;
        try {
          var codes = await det.detect(video);
          var hit = codes.map(function (c) { return (c.rawValue.match(/BS-\d{4}-[A-Z0-9]{3}/i) || [])[0]; }).filter(Boolean)[0];
          if (hit) { stop(); input.value = hit.toUpperCase(); link(hit); return; }
        } catch (e) {}
        requestAnimationFrame(scan);
      })();
    } catch (e) { BS.showMsg(msg, "No fue posible acceder a la cámara: " + e.message, false); }
  });
  function stop() {
    active = false; btn.textContent = "Escanear código QR";
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    video.classList.add("hidden");
  }
})();
