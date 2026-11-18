/* Comportamiento común: menú, banner de privacidad, PWA, utilidades */
(function () {
  "use strict";
  var BS = (window.BS = window.BS || {});

  BS.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  BS.$ = function (s, r) { return (r || document).querySelector(s); };
  BS.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  BS.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  BS.fmtDate = function (d) {
    return new Date(d).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  };
  BS.showMsg = function (el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-msg show " + (ok ? "ok" : "err");
  };

  document.addEventListener("DOMContentLoaded", function () {
    // Menú móvil
    var toggle = BS.$(".nav-toggle"), links = BS.$(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", function () {
        var open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    // Enlace activo
    var page = location.pathname.split("/").pop() || "index.html";
    BS.$$(".nav-links a").forEach(function (a) {
      if (a.getAttribute("href") === page) a.setAttribute("aria-current", "page");
    });
    // Año
    BS.$$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

    // Banner de privacidad
    var banner = BS.$("#privacy-banner");
    if (banner && !BS.store.get("bs_privacy_ok", false)) {
      banner.classList.add("show");
      var b = BS.$("#privacy-accept");
      if (b) b.addEventListener("click", function () {
        BS.store.set("bs_privacy_ok", true);
        banner.classList.remove("show");
      });
    }
  });

  // PWA
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
