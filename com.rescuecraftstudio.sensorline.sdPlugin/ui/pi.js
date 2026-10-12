// Sensorline inspector helpers (gauge and multi). UTF-8.
// 1. Search: filters the options of every sensor sdpi-select. The real
//    <select> lives in the component's shadowRoot, so we reach into it, hide
//    options that do not match and hide optgroups left empty.
// 2. Shows the custom colour pickers only when Palette is "Custom".
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

  document.addEventListener("DOMContentLoaded", function () {
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
    var start = function () {
      watchAll();
      syncPalette();
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
