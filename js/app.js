/* UI wiring: recipe form, import (file / paste / OCR), preview, export, share, library. */
(function (FR) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var LIB_KEY = "fuji-recipe-converter.library.v1", DRAFT_KEY = "fuji-recipe-converter.draft.v1";

  var state = {
    recipe: FR.normalize(FR.DEFAULT_RECIPE),
    target: "fuji",
    library: []
  };

  // ---------- Small helpers ----------

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  var toastTimer;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-visible"); }, 5000);
  }

  function importStatus(msg, isError) {
    var el = $("import-status");
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
  }

  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type })), a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copy(text, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.className = "visually-hidden";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ }
      ta.remove();
      toast(ok ? done : "Could not copy. Your browser blocked clipboard access.");
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(done); }, fallback);
    else fallback();
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  // ---------- Theme ----------

  var THEME_KEY = "fuji-recipe-converter.theme";

  function bindTheme() {
    var root = document.documentElement, btn = $("theme-toggle");
    var system = window.matchMedia("(prefers-color-scheme: dark)");
    function isDark() {
      var chosen = root.getAttribute("data-theme");
      return chosen ? chosen === "dark" : system.matches;
    }
    function sync() { btn.setAttribute("aria-checked", isDark() ? "true" : "false"); }
    btn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* choice lasts for this visit only */ }
      sync();
    });
    // Until the visitor chooses, keep following the system setting.
    if (system.addEventListener) system.addEventListener("change", sync);
    sync();
  }

  // ---------- Recipe form ----------

  var controls = {};

  function buildForm() {
    document.querySelectorAll("[data-icon]").forEach(function (span) {
      span.outerHTML = FR.icon(span.getAttribute("data-icon"));
    });

    FR.FIELDS.forEach(function (f) {
      var id = "f-" + f.key, input, body;
      var tile = el("div", { "class": "tile", "aria-hidden": "true", html: f.glyph ? f.glyph : FR.icon(f.icon) });
      var label = el("label", { "for": id, text: f.label + (f.unit ? " (" + f.unit + ")" : "") });

      if (f.type === "select") {
        input = el("select", { id: id }, f.options.map(function (o) { return el("option", { value: o[0], text: o[1] }); }));
        body = input;
      } else if (f.type === "number") {
        input = el("input", { id: id, type: "number", min: f.min, max: f.max, step: f.step, inputmode: "decimal" });
        var dec = el("button", { type: "button", "aria-label": "Decrease " + f.label, text: "−" });
        var inc = el("button", { type: "button", "aria-label": "Increase " + f.label, text: "+" });
        dec.addEventListener("click", function () { setField(f.key, state.recipe[f.key] - f.step); });
        inc.addEventListener("click", function () { setField(f.key, state.recipe[f.key] + f.step); });
        body = el("div", { "class": "stepper" }, [dec, input, inc]);
        controls[f.key + ":dec"] = dec; controls[f.key + ":inc"] = inc;
      } else {
        input = el("input", { id: id, type: "text", maxlength: 120, placeholder: f.placeholder || "", autocomplete: "off" });
        body = input;
      }
      input.addEventListener("change", function () { setField(f.key, input.value); });
      controls[f.key] = input;
      var row = el("div", { "class": "field" }, [tile, el("div", {}, [label, body])]);
      controls[f.key + ":row"] = row;
      $(f.meta ? "fields-meta" : "fields").appendChild(row);
    });

    ["name", "author", "notes"].forEach(function (k) {
      controls[k] = $("f-" + k);
      controls[k].addEventListener("change", function () { setField(k, controls[k].value); });
    });

    $("recipe-form").addEventListener("submit", function (e) { e.preventDefault(); });
    $("btn-reset").addEventListener("click", function () { setRecipe(FR.DEFAULT_RECIPE); toast("Recipe reset."); });
    $("btn-save").addEventListener("click", saveToLibrary);
  }

  function setField(key, value) {
    var next = {};
    Object.keys(state.recipe).forEach(function (k) { next[k] = state.recipe[k]; });
    next[key] = value;
    setRecipe(next);
  }

  function setRecipe(recipe) {
    state.recipe = FR.normalize(recipe);
    store(DRAFT_KEY, state.recipe);
    syncForm();
    renderExportDetails();
    schedulePreview();
  }

  function syncForm() {
    var r = state.recipe;
    ["name", "author", "notes"].forEach(function (k) { controls[k].value = r[k]; });
    FR.FIELDS.forEach(function (f) {
      controls[f.key].value = r[f.key];
      controls[f.key + ":row"].hidden = !!(f.when && !f.when(r));
      if (f.type === "number") {
        controls[f.key + ":dec"].disabled = r[f.key] <= f.min;
        controls[f.key + ":inc"].disabled = r[f.key] >= f.max;
      }
    });
  }

  // ---------- Import ----------

  function applyImport(result, emptyMessage) {
    if (!result) { importStatus(emptyMessage || "No recipe settings were recognised.", true); return false; }
    var values = result.values;
    if (!values.name) values.name = "Imported recipe";
    setRecipe(values);
    var n = result.found.filter(function (k) { return FR.fieldByKey(k); }).length;
    var msg = "Imported " + n + " setting" + (n === 1 ? "" : "s") + " from " + result.source + ". Please check them below.";
    if (state.recipe.whiteBalance === "kelvin" && result.found.indexOf("kelvin") < 0) {
      msg += " The colour temperature value was not found — it is set to " + state.recipe.kelvin + " K.";
    }
    importStatus(msg);
    return true;
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsText(file);
    });
  }

  function importFile(file) {
    if (!file) return;
    if (isImageFile(file)) { importScreenshot(file); return; }
    readFileText(file).then(function (text) {
      applyImport(FR.parseAny(text), "“" + file.name + "” does not look like a recipe file.");
    }, function () { importStatus("Could not read “" + file.name + "”.", true); });
  }

  var tesseractLoading;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tesseractLoading) {
      tesseractLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "vendor/tesseract/tesseract.min.js";
        s.onload = resolve;
        s.onerror = function () { tesseractLoading = null; reject(new Error("OCR engine missing")); };
        document.head.appendChild(s);
      });
    }
    return tesseractLoading;
  }

  // iPhone photos (.heic / .heif) often arrive with an empty MIME type, so check the name too.
  function isHeicFile(file) {
    return /^image\/hei[cf]/i.test(file.type || "") || /\.hei[cf]$/i.test(file.name || "");
  }
  function isImageFile(file) {
    return /^image\//.test(file.type || "") || isHeicFile(file);
  }

  var heicLoading;
  function loadHeicDecoder() {
    if (window.HeicTo) return Promise.resolve();
    if (!heicLoading) {
      heicLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "vendor/heic/heic-to.js";
        s.onload = resolve;
        s.onerror = function () { heicLoading = null; reject(new Error("HEIC decoder missing")); };
        document.head.appendChild(s);
      });
    }
    return heicLoading;
  }

  function decodeNatively(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Not an image")); };
      img.src = url;
    });
  }

  // Browsers that can show HEIC themselves (Safari) do; the others get it converted locally first.
  function loadImage(blob) {
    return decodeNatively(blob).catch(function (err) {
      if (!isHeicFile(blob)) throw err;
      return loadHeicDecoder()
        .then(function () { return window.HeicTo({ blob: blob, type: "image/jpeg", quality: 0.92 }); })
        .then(decodeNatively);
    });
  }

  function importScreenshot(blob) {
    if (location.protocol === "file:") {
      importStatus("Reading screenshots needs the local server. Close this tab and start the app with start.bat (Windows) or start.sh (macOS / Linux). Everything else works without it.", true);
      return;
    }
    importStatus("Reading screenshot…");
    var worker;
    Promise.all([loadImage(blob), loadTesseract()]).then(function (res) {
      // Small UI screenshots read far better when enlarged.
      var img = res[0], scale = Math.min(3, Math.max(1, 1800 / img.naturalWidth));
      var c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      var base = new URL("vendor/tesseract/", location.href).href;
      return window.Tesseract.createWorker("eng", 1, {
        workerPath: base + "worker.min.js", corePath: base, langPath: base + "lang", workerBlobURL: false,
        logger: function (m) {
          if (m.status === "recognizing text") importStatus("Reading screenshot… " + Math.round(m.progress * 100) + "%");
        }
      }).then(function (w) { worker = w; return w.recognize(c); });
    }).then(function (out) {
      FR.lastOcrText = out.data.text;
      applyImport(FR.parseText(out.data.text, { ocr: true }), "No recipe settings were recognised in this image. Try a sharper screenshot, or type the values in.");
    }).catch(function (err) {
      importStatus("Could not read the screenshot (" + (err && err.message ? err.message : "unknown error") + ").", true);
    }).then(function () { if (worker) worker.terminate(); });
  }

  function bindImport() {
    var zone = $("dropzone"), input = $("import-file");
    $("btn-import-file").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { importFile(input.files[0]); input.value = ""; });

    ["dragenter", "dragover"].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove("is-over"); });
    });
    zone.addEventListener("drop", function (e) { importFile(e.dataTransfer.files[0]); });

    $("btn-import-text").addEventListener("click", function () {
      applyImport(FR.parseAny($("import-text").value));
    });

    // Ctrl+V anywhere outside a text box: an image goes to OCR, text is parsed.
    document.addEventListener("paste", function (e) {
      var t = e.target, data = e.clipboardData;
      if (!data) return;
      var editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      var file = Array.prototype.filter.call(data.files || [], isImageFile)[0];
      if (file) { e.preventDefault(); importScreenshot(file); return; }
      if (editable) return;
      var text = data.getData("text/plain");
      if (text) { e.preventDefault(); applyImport(FR.parseAny(text)); }
    });
  }

  function importFromHash() {
    var m = /[#&]r=([^&]+)/.exec(location.hash);
    if (!m) return false;
    var ok = applyImport(FR.parseAny(decodeURIComponent(m[1])), "The link does not contain a valid recipe.");
    history.replaceState(null, "", location.pathname + location.search);
    return ok;
  }

  // ---------- Preview ----------

  var preview = { src: null, lut: null, lutKey: "", pending: false, scale: 1 };
  var MAX_SIDE = 1100, LUT_N = 33;

  function setSource(drawable, w, h, label) {
    var k = Math.min(1, MAX_SIDE / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    var canvas = $("preview"), ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = cw; canvas.height = ch;
    ctx.drawImage(drawable, 0, 0, cw, ch);
    preview.src = ctx.getImageData(0, 0, cw, ch);
    preview.scale = cw / 900;
    preview.label = label;
    schedulePreview();
  }

  // A license-free test scene drawn in code: landscape, colour patches and a grey ramp.
  function drawSample() {
    var c = document.createElement("canvas"), w = 900, h = 600, x = c.getContext("2d"), g, i;
    c.width = w; c.height = h;
    g = x.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, "#2f6fc0"); g.addColorStop(0.6, "#9cc4e8"); g.addColorStop(1, "#f3dcc0");
    x.fillStyle = g; x.fillRect(0, 0, w, 380);
    g = x.createRadialGradient(660, 250, 0, 660, 250, 220);
    g.addColorStop(0, "rgba(255,244,214,1)"); g.addColorStop(0.12, "rgba(255,226,170,.9)"); g.addColorStop(1, "rgba(255,210,150,0)");
    x.fillStyle = g; x.fillRect(0, 0, w, 380);
    x.fillStyle = "rgba(255,255,255,.85)";
    [[170, 110, 60], [230, 95, 45], [280, 118, 50], [480, 70, 36], [525, 80, 30]].forEach(function (p) {
      x.beginPath(); x.ellipse(p[0], p[1], p[2], p[2] * 0.42, 0, 0, 6.3); x.fill();
    });
    function ridge(y, amp, color, seed) {
      x.fillStyle = color; x.beginPath(); x.moveTo(0, h);
      for (i = 0; i <= w; i += 10) x.lineTo(i, y + Math.sin(i * 0.008 + seed) * amp + Math.sin(i * 0.021 + seed * 2) * amp * 0.4);
      x.lineTo(w, h); x.fill();
    }
    ridge(300, 34, "#6f8fb4", 1); ridge(335, 26, "#4f7f73", 2.2); ridge(372, 20, "#3f8a3a", 4); ridge(420, 14, "#7fa83a", 5.5);
    g = x.createLinearGradient(0, 430, 0, 520);
    g.addColorStop(0, "#d9b24a"); g.addColorStop(1, "#9a6a2a");
    x.fillStyle = g; x.fillRect(0, 445, w, 80);
    x.fillStyle = "#b3261e"; x.fillRect(120, 392, 86, 58);
    x.fillStyle = "#5b1a14"; x.beginPath(); x.moveTo(110, 394); x.lineTo(163, 356); x.lineTo(216, 394); x.fill();
    x.fillStyle = "#f4ead8"; x.fillRect(152, 415, 22, 35);
    x.fillStyle = "#1f3d2a"; [[330, 60], [372, 84], [760, 70], [800, 52]].forEach(function (t) {
      x.beginPath(); x.moveTo(t[0], 452); x.lineTo(t[0] + 18, 452 - t[1]); x.lineTo(t[0] + 36, 452); x.fill();
    });
    var patches = ["#735244", "#c29682", "#627a9d", "#576c43", "#8580b1", "#67bdaa", "#d67e2c", "#505ba6", "#c15a63",
                   "#5e3c6c", "#9dbc40", "#e0a32e", "#383d96", "#469449", "#af363c", "#e7c71f", "#bb5695", "#0885a1"];
    patches.forEach(function (p, j) { x.fillStyle = p; x.fillRect(j * 50, 525, 50, 45); });
    g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#000"); g.addColorStop(1, "#fff");
    x.fillStyle = g; x.fillRect(0, 570, w, 30);
    setSource(c, w, h, "sample scene with landscape, colour patches and grey ramp");
  }

  function schedulePreview() {
    if (preview.pending || !preview.src) return;
    preview.pending = true;
    requestAnimationFrame(function () { preview.pending = false; renderPreview(); });
  }

  function renderPreview() {
    var src = preview.src, w = src.width, h = src.height;
    var canvas = $("preview"), ctx = canvas.getContext("2d", { willReadFrequently: true });
    var look = FR.derive(state.recipe, { drInCurve: true }), key = JSON.stringify(look);
    if (key !== preview.lutKey) { preview.lut = FR.buildLut(look, LUT_N); preview.lutKey = key; }

    var pct = +$("compare").value, splitX = Math.round(w * pct / 100);
    var out = new ImageData(new Uint8ClampedArray(src.data), w, h);
    FR.applyLut(src.data, out.data, w, h, preview.lut, LUT_N, splitX);

    var blur = null;
    if (look.clarity) {
      // Cheap wide blur for local contrast: shrink and re-enlarge the graded frame.
      var small = document.createElement("canvas"), big = document.createElement("canvas");
      small.width = Math.max(1, w >> 4); small.height = Math.max(1, h >> 4); big.width = w; big.height = h;
      ctx.putImageData(out, 0, 0);
      small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
      var bctx = big.getContext("2d", { willReadFrequently: true });
      bctx.imageSmoothingQuality = "high";
      bctx.drawImage(small, 0, 0, w, h);
      blur = bctx.getImageData(0, 0, w, h).data;
    }
    FR.applySpatial(out.data, w, h, look, blur, splitX, preview.scale);
    ctx.putImageData(out, 0, 0);

    if (splitX > 0 && splitX < w) {
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(splitX - 2, 0, 4, h);
      ctx.fillStyle = "#fff"; ctx.fillRect(splitX - 1, 0, 2, h);
    }
    var desc = pct <= 0 ? "recipe applied to the whole image" : pct >= 100 ? "original image only" :
      "original on the left " + pct + "%, recipe on the right";
    $("compare-out").textContent = pct <= 0 ? "Showing the recipe" : pct >= 100 ? "Showing the original" : "Split at " + pct + "%";
    canvas.setAttribute("aria-label", "Preview of “" + state.recipe.name + "” (" + look.simName + ") on a " + preview.label + "; " + desc + ".");
  }

  function bindPreview() {
    var input = $("photo-file");
    $("btn-photo").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var file = input.files[0];
      input.value = "";
      if (!file) return;
      if (isHeicFile(file)) toast("Opening iPhone photo…");
      loadImage(file).then(function (img) {
        setSource(img, img.naturalWidth, img.naturalHeight, "photo you chose");
        toast("Preview updated with your photo.");
      }, function () { toast("That file could not be opened as an image."); });
    });
    $("btn-sample").addEventListener("click", drawSample);
    $("compare").addEventListener("input", schedulePreview);
  }

  // ---------- Export & share ----------

  function renderExportDetails() {
    var x = FR.xmpSettings(state.recipe, state.target), box = $("xmp-details");
    var t = FR.XMP_TARGETS.filter(function (o) { return o.id === state.target; })[0];
    $("xmp-hint").textContent = t.hint;
    box.textContent = "";
    var rows = x.settings.map(function (kv) {
      return el("tr", {}, [el("th", { scope: "row", text: kv[0] }), el("td", { text: kv[1] === "" ? "—" : kv[1] })]);
    });
    if (x.curve) {
      rows.push(el("tr", {}, [el("th", { scope: "row", text: "ToneCurvePV2012" }),
        el("td", { text: x.curve.map(function (p) { return p[0] + "," + p[1]; }).join("  ") })]));
    }
    box.appendChild(el("table", {}, [el("caption", { text: "Camera Raw settings written to the preset" }), el("tbody", {}, rows)]));
    if (x.notes.length) box.appendChild(el("ul", {}, x.notes.map(function (n) { return el("li", { text: n }); })));
  }

  function shareLink() {
    return location.href.split("#")[0] + "#r=" + FR.toShareCode(state.recipe);
  }

  function bindExport() {
    var box = $("xmp-targets");
    FR.XMP_TARGETS.forEach(function (t) {
      var radio = el("input", { type: "radio", name: "xmp-target", value: t.id, id: "xmp-" + t.id });
      radio.checked = t.id === state.target;
      radio.addEventListener("change", function () { state.target = t.id; renderExportDetails(); });
      box.appendChild(el("label", { "for": "xmp-" + t.id }, [radio, el("span", { text: t.name })]));
    });

    $("btn-xmp").addEventListener("click", function () {
      download(FR.fileName(state.recipe, ".xmp"), FR.toXmp(state.recipe, state.target), "application/rdf+xml");
      toast("Preset downloaded. Import it in Lightroom via Presets → Import Presets.");
    });
    $("btn-lut").addEventListener("click", function () {
      var size = +$("lut-size").value;
      download(FR.fileName(state.recipe, "-" + size + ".cube"), FR.toCube(state.recipe, size), "text/plain");
      toast("LUT downloaded (" + size + "×" + size + "×" + size + ").");
    });

    $("btn-copy-code").addEventListener("click", function () { copy(FR.toShareCode(state.recipe), "Share code copied."); });
    $("btn-copy-link").addEventListener("click", function () { copy(shareLink(), "Link copied. It opens on any copy of this app at the same address."); });
    $("btn-copy-text").addEventListener("click", function () { copy(FR.toText(state.recipe), "Recipe copied as text."); });
    $("btn-json").addEventListener("click", function () {
      var doc = { app: "fuji-recipe-converter", version: 1, recipe: state.recipe };
      download(FR.fileName(state.recipe, ".recipe.json"), JSON.stringify(doc, null, 2), "application/json");
    });
  }

  // ---------- Library ----------

  function summary(r) {
    var f = FR.fieldByKey("filmSim"), parts = [FR.formatValue(f, r), FR.formatValue(FR.fieldByKey("dynamicRange"), r)];
    if (r.grainEffect !== "off") parts.push("Grain " + r.grainEffect);
    return parts.join(" · ");
  }

  function card(r, actions) {
    var kids = [el("h4", { text: r.name }), el("p", { text: summary(r) })];
    if (r.author) kids.push(el("p", { text: "by " + r.author }));
    kids.push(el("div", { "class": "actions" }, actions));
    return el("li", { "class": "card" }, kids);
  }

  function smallButton(text, label, onClick) {
    var b = el("button", { type: "button", "class": "btn btn-small", "aria-label": label, text: text });
    b.addEventListener("click", onClick);
    return b;
  }

  function openRecipe(r) {
    setRecipe(r);
    toast("Loaded “" + r.name + "”.");
    $("h-recipe").scrollIntoView({ block: "start" });
    controls.name.focus({ preventScroll: true });
  }

  function renderLibrary() {
    var list = $("library");
    list.textContent = "";
    state.library.forEach(function (item) {
      list.appendChild(card(item.recipe, [
        smallButton("Open", "Open " + item.recipe.name, function () { openRecipe(item.recipe); }),
        smallButton("Delete", "Delete " + item.recipe.name, function () {
          if (!window.confirm("Delete “" + item.recipe.name + "” from your library?")) return;
          state.library = state.library.filter(function (i) { return i !== item; });
          store(LIB_KEY, state.library); renderLibrary();
          toast("Deleted “" + item.recipe.name + "”.");
          $("h-library").focus();
        })
      ]));
    });
    $("library-empty").hidden = state.library.length > 0;
  }

  function saveToLibrary() {
    var r = state.recipe, existing = state.library.filter(function (i) { return i.recipe.name === r.name; })[0];
    if (existing) {
      if (!window.confirm("A recipe named “" + r.name + "” is already saved. Replace it?")) return;
      existing.recipe = r; existing.savedAt = Date.now();
    } else {
      state.library.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), savedAt: Date.now(), recipe: r });
    }
    renderLibrary();
    toast(store(LIB_KEY, state.library) ? "Saved “" + r.name + "” to your library." : "Could not save: browser storage is unavailable.");
  }

  function bindLibrary() {
    $("h-library").setAttribute("tabindex", "-1");
    FR.STARTERS.forEach(function (r) {
      $("starters").appendChild(card(r, [smallButton("Open", "Open " + r.name, function () { openRecipe(r); })]));
    });

    $("btn-lib-export").addEventListener("click", function () {
      if (!state.library.length) { toast("Your library is empty."); return; }
      download("fuji-recipe-library.json", JSON.stringify({ app: "fuji-recipe-converter", version: 1, library: state.library }, null, 2), "application/json");
    });
    var input = $("lib-file");
    $("btn-lib-import").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var file = input.files[0];
      input.value = "";
      if (!file) return;
      readFileText(file).then(function (text) {
        var doc = JSON.parse(text), items = doc.library || (doc.recipe ? [{ recipe: doc.recipe }] : null), added = 0;
        if (!Array.isArray(items)) throw new Error("no recipes");
        items.forEach(function (it) {
          if (!it || !it.recipe || !it.recipe.filmSim) return;
          var r = FR.normalize(it.recipe);
          if (state.library.some(function (i) { return JSON.stringify(i.recipe) === JSON.stringify(r); })) return;
          state.library.push({ id: Date.now().toString(36) + added, savedAt: it.savedAt || Date.now(), recipe: r });
          added++;
        });
        store(LIB_KEY, state.library); renderLibrary();
        toast("Restored " + added + " recipe" + (added === 1 ? "" : "s") + ".");
      }).catch(function () { toast("That file is not a recipe library backup."); });
    });
  }

  // ---------- Start ----------

  function init() {
    bindTheme();
    buildForm();
    bindImport();
    bindPreview();
    bindExport();
    bindLibrary();

    var lib = load(LIB_KEY);
    if (Array.isArray(lib)) {
      state.library = lib.filter(function (i) { return i && i.recipe; })
        .map(function (i) { return { id: i.id, savedAt: i.savedAt, recipe: FR.normalize(i.recipe) }; });
    }
    renderLibrary();

    state.recipe = FR.normalize(load(DRAFT_KEY) || FR.STARTERS[0]);
    syncForm();
    renderExportDetails();
    drawSample();
    importFromHash();
    window.addEventListener("hashchange", importFromHash);
  }

  FR.app = { state: state, setRecipe: setRecipe, importScreenshot: importScreenshot, loadImage: loadImage };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.FR = window.FR || {});
