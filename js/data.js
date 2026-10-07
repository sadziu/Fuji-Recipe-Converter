/* Recipe schema: film simulations, field definitions, defaults and starter recipes. */
(function (FR) {
  "use strict";

  // HSL band order used everywhere (same as Lightroom's HSL panel).
  FR.BANDS = ["Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta"];
  FR.BAND_HUES = [0, 30, 60, 120, 180, 240, 270, 300];

  function bands(obj) {
    return FR.BANDS.map(function (b) { return (obj && obj[b]) || 0; });
  }

  /*
   * Film simulation looks, described as *differences from PROVIA/Standard* in
   * Lightroom-style units, so that one description drives the preview, the LUT
   * and the "emulated" Lightroom preset alike.
   *
   *   profile  Adobe Camera Matching profile name (used for Fujifilm RAW presets)
   *   fp       value used in X RAW Studio .FP1/.FP2/.FP3 files
   *   sat      global saturation, -100..100
   *   shadow   extra shadow depth   (tone curve, + = darker shadows)
   *   high     extra highlight lift (tone curve, + = brighter highlights)
   *   lift     black point lift, 0..1
   *   hue/satB/lum   per-band HSL adjustments, -100..100
   *   grade    split toning: [shadowHue, shadowSat, highlightHue, highlightSat]
   *   mono     black & white; mix = per-band grey mixer, tone = [hue, sat]
   *
   * These numbers are hand-tuned approximations, not measurements of Fujifilm's
   * proprietary colour science.
   */
  var SIMS = [
    { id: "provia", name: "PROVIA / Standard", profile: "Camera PROVIA/Standard", fp: "Provia",
      aliases: ["provia/standard", "provia standard", "provia", "standard"] },
    { id: "velvia", name: "Velvia / Vivid", profile: "Camera Velvia/Vivid", fp: "Velvia",
      aliases: ["velvia/vivid", "velvia vivid", "velvia", "vivid"],
      sat: 26, shadow: 0.03, high: 0.025,
      satB: { Green: 10, Blue: 10, Red: 5 }, lum: { Blue: -10, Aqua: -5 }, hue: { Red: -4 } },
    { id: "astia", name: "ASTIA / Soft", profile: "Camera ASTIA/Soft", fp: "Astia",
      aliases: ["astia/soft", "astia soft", "astia", "soft"],
      sat: 8, shadow: -0.012, high: 0.01, satB: { Orange: -6 }, lum: { Orange: 4 } },
    { id: "classic-chrome", name: "Classic Chrome", profile: "Camera CLASSIC CHROME", fp: "Classic",
      aliases: ["classic chrome", "classicchrome", "chrome"],
      sat: -16, shadow: 0.035, high: 0.008,
      hue: { Red: 6, Green: 8, Blue: -12, Aqua: -6 },
      satB: { Red: -8, Yellow: -8, Green: -22, Aqua: -18, Blue: -22, Magenta: -15 },
      lum: { Blue: -12, Aqua: -8, Red: -4 } },
    { id: "reala-ace", name: "REALA ACE", profile: "Camera REALA ACE", fp: "RealaAce",
      aliases: ["reala ace", "realaace", "reala"],
      sat: -4, shadow: 0.018, high: 0.004, satB: { Green: -6, Blue: -6 }, hue: { Blue: -4 } },
    { id: "pro-neg-hi", name: "PRO Neg. Hi", profile: "Camera PRO Neg Hi", fp: "NEGAhi",
      aliases: ["pro neg. hi", "pro neg hi", "pro neg high", "proneghi", "neg hi", "negahi"],
      sat: -10, shadow: 0.022, high: 0.015, satB: { Orange: -5 } },
    { id: "pro-neg-std", name: "PRO Neg. Std", profile: "Camera PRO Neg Std", fp: "NEGAStd",
      aliases: ["pro neg. std", "pro neg std", "pro neg standard", "pronegstd", "neg std", "negastd"],
      sat: -14, shadow: -0.02, high: -0.015, satB: { Orange: -5 } },
    { id: "classic-neg", name: "Classic Neg.", profile: "Camera CLASSIC Neg", fp: "ClassicNEGA",
      aliases: ["classic negative", "classic neg.", "classic neg", "classicneg", "classicnega"],
      sat: -10, shadow: 0.045, high: 0.02,
      hue: { Red: 4, Yellow: -8, Green: 18, Blue: -8 },
      satB: { Yellow: -15, Green: -25, Aqua: -10, Blue: -12, Red: 6 },
      lum: { Red: -8, Green: -6, Blue: -6 },
      grade: [185, 6, 45, 5] },
    { id: "nostalgic-neg", name: "Nostalgic Neg.", profile: "Camera NOSTALGIC Neg", fp: "NostalgicNEGA",
      aliases: ["nostalgic negative", "nostalgic neg.", "nostalgic neg", "nostalgicneg", "nostalgic"],
      sat: -4, shadow: 0.012, high: -0.012,
      hue: { Blue: -8, Green: 5 }, satB: { Orange: 10, Yellow: 8, Blue: -12, Aqua: -10 },
      lum: { Blue: -5 }, grade: [30, 4, 42, 10] },
    { id: "eterna", name: "ETERNA / Cinema", profile: "Camera ETERNA/Cinema", fp: "Eterna",
      aliases: ["eterna/cinema", "eterna cinema", "eterna", "cinema"],
      sat: -24, shadow: -0.04, high: -0.035, lift: 0.012, satB: { Green: -6 } },
    { id: "bleach-bypass", name: "ETERNA Bleach Bypass", profile: "Camera ETERNA BLEACH BYPASS", fp: "BleachBypass",
      aliases: ["eterna bleach bypass", "bleach bypass", "bleachbypass"],
      sat: -45, shadow: 0.07, high: 0.04 },
    { id: "acros", name: "ACROS", profile: "Camera ACROS", fp: "Acros",
      aliases: ["acros"], mono: true, shadow: 0.03, high: 0.02 },
    { id: "acros-ye", name: "ACROS + Ye Filter", profile: "Camera ACROS+Ye FILTER", fp: "AcrosYe",
      aliases: ["acros + ye filter", "acros+ye filter", "acros + ye", "acros+ye", "acros +y", "acros ye", "acros+y", "acros yellow"],
      mono: true, shadow: 0.03, high: 0.02, mix: { Yellow: 20, Orange: 12, Blue: -25, Aqua: -10 } },
    { id: "acros-r", name: "ACROS + R Filter", profile: "Camera ACROS+R FILTER", fp: "AcrosR",
      aliases: ["acros + r filter", "acros+r filter", "acros + r", "acros+r", "acros +r", "acros r", "acros red"],
      mono: true, shadow: 0.03, high: 0.02, mix: { Red: 30, Orange: 20, Blue: -45, Aqua: -30, Green: -10 } },
    { id: "acros-g", name: "ACROS + G Filter", profile: "Camera ACROS+G FILTER", fp: "AcrosG",
      aliases: ["acros + g filter", "acros+g filter", "acros + g", "acros+g", "acros +g", "acros g", "acros green"],
      mono: true, shadow: 0.03, high: 0.02, mix: { Green: 30, Yellow: 10, Red: -20, Magenta: -15 } },
    { id: "monochrome", name: "Monochrome", profile: "Camera MONOCHROME", fp: "BW",
      aliases: ["monochrome", "black & white", "black and white", "b&w", "bw"], mono: true },
    { id: "monochrome-ye", name: "Monochrome + Ye Filter", profile: "Camera MONOCHROME+Ye FILTER", fp: "BYe",
      aliases: ["monochrome + ye filter", "monochrome+ye filter", "monochrome + ye", "monochrome+ye", "monochrome +y", "monochrome ye", "monochrome yellow", "bye"],
      mono: true, mix: { Yellow: 20, Orange: 12, Blue: -25, Aqua: -10 } },
    { id: "monochrome-r", name: "Monochrome + R Filter", profile: "Camera MONOCHROME+R FILTER", fp: "BR",
      aliases: ["monochrome + r filter", "monochrome+r filter", "monochrome + r", "monochrome+r", "monochrome +r", "monochrome r", "monochrome red"],
      mono: true, mix: { Red: 30, Orange: 20, Blue: -45, Aqua: -30, Green: -10 } },
    { id: "monochrome-g", name: "Monochrome + G Filter", profile: "Camera MONOCHROME+G FILTER", fp: "BG",
      aliases: ["monochrome + g filter", "monochrome+g filter", "monochrome + g", "monochrome+g", "monochrome +g", "monochrome g", "monochrome green"],
      mono: true, mix: { Green: 30, Yellow: 10, Red: -20, Magenta: -15 } },
    { id: "sepia", name: "Sepia", profile: "Camera SEPIA", fp: "Sepia",
      aliases: ["sepia"], mono: true, tone: [38, 22] }
  ];

  SIMS.forEach(function (s) {
    s.sat = s.sat || 0; s.shadow = s.shadow || 0; s.high = s.high || 0; s.lift = s.lift || 0;
    s.hue = bands(s.hue); s.satB = bands(s.satB); s.lum = bands(s.lum); s.mix = bands(s.mix);
    s.mono = !!s.mono;
  });
  FR.SIMS = SIMS;
  FR.simById = function (id) {
    for (var i = 0; i < SIMS.length; i++) if (SIMS[i].id === id) return SIMS[i];
    return SIMS[0];
  };

  // lr = Lightroom white balance (approximate equivalents of the in-camera presets).
  FR.WB = [
    { id: "auto", name: "Auto", aliases: ["auto white balance", "auto wb", "awb", "auto"] },
    { id: "auto-white", name: "Auto (White Priority)", aliases: ["auto white priority", "white priority"] },
    { id: "auto-ambience", name: "Auto (Ambience Priority)", aliases: ["auto ambience priority", "ambience priority", "auto ambiance priority"] },
    { id: "daylight", name: "Daylight", lr: [5500, 10], aliases: ["daylight", "fine", "sunny"] },
    { id: "shade", name: "Shade", lr: [7500, 10], aliases: ["shade"] },
    { id: "fluorescent-1", name: "Fluorescent 1 (Daylight)", lr: [6500, 20], aliases: ["fluorescent light 1", "fluorescent 1", "fl light 1", "flight1", "fluorescent-1"] },
    { id: "fluorescent-2", name: "Fluorescent 2 (Warm White)", lr: [4800, 21], aliases: ["fluorescent light 2", "fluorescent 2", "fl light 2", "flight2", "fluorescent-2"] },
    { id: "fluorescent-3", name: "Fluorescent 3 (Cool White)", lr: [4200, 21], aliases: ["fluorescent light 3", "fluorescent 3", "fl light 3", "flight3", "fluorescent-3"] },
    { id: "incandescent", name: "Incandescent", lr: [2850, 0], aliases: ["incandescent", "incand", "tungsten"] },
    { id: "underwater", name: "Underwater", aliases: ["underwater", "uwater"] },
    { id: "kelvin", name: "Colour Temperature (K)", aliases: ["colour temperature", "color temperature", "kelvin", "temperature"] },
    { id: "custom", name: "Custom", aliases: ["custom 1", "custom 2", "custom 3", "custom"] }
  ];
  FR.wbById = function (id) {
    for (var i = 0; i < FR.WB.length; i++) if (FR.WB[i].id === id) return FR.WB[i];
    return FR.WB[0];
  };

  var OWS = [["off", "Off"], ["weak", "Weak"], ["strong", "Strong"]];

  /*
   * Editable fields, in display order.
   *   type "select": options = [[value, label], ...]
   *   type "number": min/max/step
   *   type "text":   free text, stored as-is (metadata only)
   *   when(recipe):  field is only relevant (and shown) when this returns true
   */
  FR.FIELDS = [
    { key: "filmSim", label: "Film Simulation", icon: "film", type: "select",
      options: SIMS.map(function (s) { return [s.id, s.name]; }) },
    { key: "dynamicRange", label: "Dynamic Range", icon: "contrast", type: "select",
      options: [["auto", "Auto"], ["dr100", "DR100"], ["dr200", "DR200"], ["dr400", "DR400"]] },
    { key: "whiteBalance", label: "White Balance", icon: "thermometer-sun", type: "select",
      options: FR.WB.map(function (w) { return [w.id, w.name]; }) },
    { key: "kelvin", label: "Colour Temperature", icon: "thermometer-sun", type: "number", min: 2500, max: 10000, step: 10, unit: "K",
      when: function (r) { return r.whiteBalance === "kelvin"; } },
    { key: "wbShiftRed", label: "WB Shift Red", glyph: "R", type: "number", min: -9, max: 9, step: 1 },
    { key: "wbShiftBlue", label: "WB Shift Blue", glyph: "B", type: "number", min: -9, max: 9, step: 1 },
    { key: "grainEffect", label: "Grain Effect", icon: "grip", type: "select", options: OWS },
    { key: "grainSize", label: "Grain Size", icon: "scaling", type: "select", options: [["small", "Small"], ["large", "Large"]],
      when: function (r) { return r.grainEffect !== "off"; } },
    { key: "colorChromeEffect", label: "Color Chrome Effect", icon: "palette", type: "select", options: OWS },
    { key: "colorChromeFxBlue", label: "Color Chrome FX Blue", icon: "droplet", type: "select", options: OWS },
    { key: "color", label: "Color", icon: "rainbow", type: "number", min: -4, max: 4, step: 1,
      when: function (r) { return !FR.simById(r.filmSim).mono; } },
    { key: "monoWC", label: "Mono Color: Warm / Cool", icon: "blend", type: "number", min: -18, max: 18, step: 1,
      when: function (r) { return FR.simById(r.filmSim).mono; } },
    { key: "monoMG", label: "Mono Color: Magenta / Green", icon: "blend", type: "number", min: -18, max: 18, step: 1,
      when: function (r) { return FR.simById(r.filmSim).mono; } },
    { key: "sharpness", label: "Sharpness", icon: "triangle", type: "number", min: -4, max: 4, step: 1 },
    { key: "highlight", label: "Highlight", icon: "sun", type: "number", min: -2, max: 4, step: 0.5 },
    { key: "shadow", label: "Shadow", icon: "moon", type: "number", min: -2, max: 4, step: 0.5 },
    { key: "noiseReduction", label: "Noise Reduction", icon: "audio-lines", type: "number", min: -4, max: 4, step: 1 },
    { key: "clarity", label: "Clarity", icon: "eye", type: "number", min: -5, max: 5, step: 1 },
    { key: "iso", label: "ISO", icon: "gauge", type: "text", placeholder: "e.g. Auto, up to 6400", meta: true },
    { key: "exposureComp", label: "Exposure Compensation", icon: "diff", type: "text", placeholder: "e.g. +1/3 to +2/3", meta: true },
    { key: "camera", label: "Camera / Sensor", icon: "camera", type: "text", placeholder: "e.g. X-T5, X-Trans V", meta: true }
  ];
  FR.fieldByKey = function (key) {
    for (var i = 0; i < FR.FIELDS.length; i++) if (FR.FIELDS[i].key === key) return FR.FIELDS[i];
    return null;
  };

  FR.DEFAULT_RECIPE = {
    name: "Untitled recipe", author: "", notes: "",
    filmSim: "provia", dynamicRange: "dr100",
    whiteBalance: "auto", kelvin: 5500, wbShiftRed: 0, wbShiftBlue: 0,
    grainEffect: "off", grainSize: "small",
    colorChromeEffect: "off", colorChromeFxBlue: "off",
    color: 0, monoWC: 0, monoMG: 0,
    sharpness: 0, highlight: 0, shadow: 0, noiseReduction: 0, clarity: 0,
    iso: "", exposureComp: "", camera: ""
  };

  // Coerce anything recipe-shaped into a complete, in-range recipe.
  FR.normalize = function (input) {
    var r = {}, d = FR.DEFAULT_RECIPE;
    input = input || {};
    ["name", "author", "notes"].forEach(function (k) {
      r[k] = typeof input[k] === "string" ? input[k].slice(0, k === "notes" ? 2000 : 120) : d[k];
    });
    FR.FIELDS.forEach(function (f) {
      var v = input[f.key];
      if (f.type === "select") {
        var ok = f.options.some(function (o) { return o[0] === v; });
        r[f.key] = ok ? v : d[f.key];
      } else if (f.type === "number") {
        v = typeof v === "string" ? parseFloat(v) : v;
        if (typeof v !== "number" || !isFinite(v)) v = d[f.key];
        v = Math.round(v / f.step) * f.step;
        r[f.key] = Math.min(f.max, Math.max(f.min, v));
      } else {
        r[f.key] = typeof v === "string" ? v.slice(0, 120) : d[f.key];
      }
    });
    return r;
  };

  // Starter recipes written for this project, so there is something to try on first run.
  FR.STARTERS = [
    { name: "Warm Chrome", author: "Fuji Recipe Converter", notes: "Muted documentary colour with a warm cast and visible grain.",
      filmSim: "classic-chrome", dynamicRange: "dr200", whiteBalance: "daylight", wbShiftRed: 3, wbShiftBlue: -5,
      grainEffect: "strong", grainSize: "small", colorChromeEffect: "strong", colorChromeFxBlue: "weak",
      color: 2, sharpness: -1, highlight: -1, shadow: 1, noiseReduction: -4, clarity: -2 },
    { name: "Soft Cinema", author: "Fuji Recipe Converter", notes: "Low-contrast, desaturated and gentle. Good for flat light.",
      filmSim: "eterna", dynamicRange: "dr400", whiteBalance: "auto", wbShiftRed: 1, wbShiftBlue: -2,
      grainEffect: "weak", grainSize: "large", colorChromeEffect: "weak", colorChromeFxBlue: "off",
      color: 1, sharpness: -2, highlight: -1, shadow: -1, noiseReduction: -4, clarity: 0 },
    { name: "Street Negative", author: "Fuji Recipe Converter", notes: "Punchy negative-film look with cool greens.",
      filmSim: "classic-neg", dynamicRange: "dr100", whiteBalance: "auto", wbShiftRed: 2, wbShiftBlue: -3,
      grainEffect: "weak", grainSize: "small", colorChromeEffect: "off", colorChromeFxBlue: "strong",
      color: 1, sharpness: 0, highlight: 1, shadow: 1.5, noiseReduction: -4, clarity: 1 },
    { name: "Hard Mono", author: "Fuji Recipe Converter", notes: "Contrasty black & white with a red filter and coarse grain.",
      filmSim: "acros-r", dynamicRange: "dr100", whiteBalance: "auto",
      grainEffect: "strong", grainSize: "large", highlight: 2, shadow: 2.5, sharpness: 1, noiseReduction: -4, clarity: 2 }
  ].map(FR.normalize);
})(window.FR = window.FR || {});
