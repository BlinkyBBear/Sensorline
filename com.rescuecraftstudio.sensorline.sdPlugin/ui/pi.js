// Sensorline inspector helpers (gauge and multi). UTF-8.
// 1. Search: filters the options of every sensor sdpi-select. The real
//    <select> lives in the component's shadowRoot, so we reach into it, hide
//    options that do not match and hide optgroups left empty.
// 2. Shows the custom colour pickers only when Palette is "Custom".
// 3. Status line (phase, active source: shared memory / WMI / registry) and
//    validation messages sent by the plugin.
// 4. "Preview warning colours", "Use recommended thresholds" (dial), the
//    Sensor/Formula mode switch (dial), and settings export / import as JSON.
//    Settings still save automatically on change (no Save button).
(function () {
  "use strict";

  var query = "";

  function sensorSelects() {
    return Array.prototype.slice.call(document.querySelectorAll('sdpi-select[datasource="getSensors"]'));
  }

  function innerSelect(el) {
    return el.shadowRoot ? el.shadowRoot.querySelector("select") : null;
  }

  function applyFilter(el) {
    var select = innerSelect(el);
    if (!select) return;
    var q = query.trim().toLowerCase();
    var options = select.querySelectorAll("option");
    for (var i = 0; i < options.length; i += 1) {
      var option = options[i];
      var keep = !q || option.value === "" || option.value === select.value || option.textContent.toLowerCase().indexOf(q) !== -1 || option.value.toLowerCase().indexOf(q) !== -1;
      option.hidden = !keep;
      option.style.display = keep ? "" : "none";
    }
    var groups = select.querySelectorAll("optgroup");
    for (var g = 0; g < groups.length; g += 1) {
      var visible = groups[g].querySelectorAll("option:not([hidden])").length > 0;
      groups[g].hidden = !visible;
      groups[g].style.display = visible ? "" : "none";
    }
  }

  function filterAll() {
    sensorSelects().forEach(applyFilter);
  }

  // Re-apply after the component re-renders its options (e.g. a refresh).
  function watch(el) {
    if (el.__sensorlineWatched || !el.shadowRoot) return false;
    el.__sensorlineWatched = true;
    new MutationObserver(function () { applyFilter(el); }).observe(el.shadowRoot, { childList: true, subtree: true });
    applyFilter(el);
    return true;
  }

  function watchAll() {
    var pending = sensorSelects().filter(function (el) { return !watch(el) && !el.__sensorlineWatched; });
    if (pending.length) setTimeout(watchAll, 200);
  }

  function syncPalette() {
    var palette = document.getElementById("palette");
    var custom = document.getElementById("customColours");
    if (!palette || !custom) return;
    custom.hidden = palette.value !== "custom";
  }

  // Sensor Dial: show the sensor or the formula fields for the chosen mode.
  function syncMode() {
    var mode = document.getElementById("mode");
    if (!mode) return;
    var formula = mode.value === "formula";
    var a = document.getElementById("sensorMode");
    var b = document.getElementById("formulaMode");
    if (a) a.hidden = formula;
    if (b) b.hidden = !formula;
  }

  function client() {
    return window.SDPIComponents && window.SDPIComponents.streamDeckClient;
  }

  function showStatus(msg) {
    var node = document.getElementById("status");
    if (node) {
      var text;
      if (msg.phase === "live") text = "Live · " + msg.source + " · " + msg.count + " sensors";
      else if (msg.phase === "not-running") text = "AIDA64 is not running. Start AIDA64 Extreme." + (msg.slow ? " (checking every 5 s)" : "");
      else if (msg.phase === "sharing-off") text = "AIDA64 is running but not sharing. Preferences → Hardware Monitoring → External Applications → Enable shared memory.";
      else text = msg.detail || "No sensor source.";
      node.textContent = text;
      node.className = "status " + (msg.phase === "live" ? "live" : "off");
    }
    var v = document.getElementById("validation");
    if (v) {
      v.textContent = msg.validation || "";
      v.hidden = !msg.validation;
    }
    var f = document.getElementById("formulaResult");
    if (f) f.textContent = msg.validation ? "" : msg.formula || "";
  }

  function setValidation(text) {
    var v = document.getElementById("validation");
    if (!v) return;
    v.textContent = text || "";
    v.hidden = !text;
  }

  function wireButtons() {
    var c = client();
    if (!c) return;
    var preview = document.getElementById("previewButton");
    if (preview) preview.addEventListener("click", function () { c.send("sendToPlugin", { event: "preview" }); });
    var recommend = document.getElementById("recommendButton");
    if (recommend) recommend.addEventListener("click", function () { c.send("sendToPlugin", { event: "recommend" }); });
    var box = document.getElementById("settingsJson");
    var exp = document.getElementById("exportButton");
    if (exp && box) {
      exp.addEventListener("click", function () {
        c.getSettings().then(function (payload) {
          box.value = JSON.stringify((payload && payload.settings) || {}, null, 1);
          setValidation("");
        });
      });
    }
    var imp = document.getElementById("importButton");
    if (imp && box) {
      imp.addEventListener("click", function () {
        var parsed;
        try {
          parsed = JSON.parse(box.value);
        } catch (e) {
          setValidation("Import failed: that is not valid JSON.");
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setValidation("Import failed: expected a JSON object of settings.");
          return;
        }
        Promise.resolve(c.setSettings(parsed)).then(function () { location.reload(); });
      });
    }
    c.sendToPropertyInspector.subscribe(function (ev) {
      var p = ev && ev.payload;
      if (p && p.event === "status") showStatus(p);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireButtons();
    var box = document.getElementById("sensorSearch");
    if (box) {
      box.addEventListener("input", function () {
        query = box.value;
        filterAll();
      });
    }
    var palette = document.getElementById("palette");
    if (palette) {
      palette.addEventListener("valuechange", syncPalette);
      palette.addEventListener("change", syncPalette);
    }
    var mode = document.getElementById("mode");
    if (mode) {
      mode.addEventListener("valuechange", syncMode);
      mode.addEventListener("change", syncMode);
    }
    var start = function () {
      watchAll();
      syncPalette();
      syncMode();
      setTimeout(syncMode, 300);
      setTimeout(syncMode, 1200);
      // Settings arrive asynchronously; sync the palette once they have.
      setTimeout(syncPalette, 300);
      setTimeout(syncPalette, 1200);
    };
    if (window.customElements && customElements.whenDefined) {
      customElements.whenDefined("sdpi-select").then(start, start);
    } else {
      start();
    }
  });
})();
