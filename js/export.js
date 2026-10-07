/* Exporters: Lightroom / Camera Raw preset (.xmp), 3D LUT (.cube), plain text, share code. */
(function (FR) {
  "use strict";

  var clamp = FR.clamp;

  function xmlEscape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function signed(n) { n = Math.round(n); return n > 0 ? "+" + n : String(n); }
  function uuid() {
    var a = new Uint8Array(16), s = "";
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < 16; i++) s += (a[i] < 16 ? "0" : "") + a[i].toString(16);
    return s.toUpperCase();
  }

  FR.XMP_TARGETS = [
    { id: "fuji", name: "Fujifilm RAW (.RAF)", hint: "Uses Adobe's own Camera Matching film simulation profile, then adds the recipe's adjustments. Closest match." },
    { id: "raw", name: "RAW from another camera", hint: "Emulates the film simulation with tone curve, HSL and colour grading." },
    { id: "rendered", name: "JPEG / TIFF / HEIC", hint: "Same emulation, with white balance expressed as a relative shift." }
  ];

  /*
   * Returns { settings: [[name, value], ...], curve: [[x, y], ...] | null, notes: [string] }.
   * Only settings the recipe actually controls are written, so applying the preset
   * leaves exposure, crop, lens corrections etc. untouched.
   */
  FR.xmpSettings = function (recipe, target) {
    var r = FR.normalize(recipe), sim = FR.simById(r.filmSim);
    var fuji = target === "fuji", rendered = target === "rendered";
    var look = FR.derive(r, { simInProfile: fuji, drInCurve: false });
    var s = [], notes = [], i;
    function put(k, v) { s.push([k, String(v)]); }

    if (fuji) {
      put("CameraProfile", sim.profile);
      notes.push("Film simulation comes from the Adobe profile “" + sim.profile + "”. If Lightroom reports the profile as missing, your camera does not offer this simulation — use the “RAW from another camera” target instead.");
    } else if (sim.mono) {
      put("ConvertToGrayscale", "True");
      FR.BANDS.forEach(function (b, j) { put("GrayMixer" + b, signed(look.mix[j])); });
    }

    // White balance
    var wb = look.wb, preset = FR.wbById(wb.mode), base = wb.mode === "kelvin" ? [wb.kelvin, 10] : preset.lr;
    var shifted = wb.shiftRed !== 0 || wb.shiftBlue !== 0, gradeShift = null;
    if (rendered) {
      if (shifted) { put("IncrementalTemperature", signed(wb.incTemp)); put("IncrementalTint", signed(wb.incTint)); }
      if (base) notes.push("White balance “" + preset.name + "” cannot be applied to an already-developed image; only the WB shift is included.");
    } else if (base) {
      put("WhiteBalance", "Custom");
      put("Temperature", Math.round(clamp(1e6 / (1e6 / base[0] - wb.miredShift), 2000, 50000) / 50) * 50);
      put("Tint", signed(clamp(base[1] + wb.tintShift, -150, 150)));
    } else {
      notes.push("White balance “" + preset.name + "” has no fixed equivalent: the photo keeps its own white balance" + (shifted ? " and the WB shift is applied as a global colour grade." : "."));
      if (shifted && !sim.mono) gradeShift = wb.grade;
    }

    // Tone
    if (look.dr) put("Highlights2012", signed(-20 * look.dr));
    if (look.clarity) put("Clarity2012", signed(look.clarity));
    if (!sim.mono && (look.saturation || !fuji)) put("Saturation", signed(look.saturation));

    // HSL
    if (!sim.mono) {
      [["HueAdjustment", look.hue], ["SaturationAdjustment", look.sat], ["LuminanceAdjustment", look.lum]].forEach(function (grp) {
        if (!grp[1].some(function (v) { return v !== 0; })) return;
        for (i = 0; i < 8; i++) put(grp[0] + FR.BANDS[i], signed(grp[1][i]));
      });
    }

    // Colour grading
    var g = look.grade, global = gradeShift || [g.globalHue, g.globalSat];
    if (g.shadowSat || g.highlightSat) {
      put("SplitToningShadowHue", g.shadowHue); put("SplitToningShadowSaturation", g.shadowSat);
      put("SplitToningHighlightHue", g.highlightHue); put("SplitToningHighlightSaturation", g.highlightSat);
      put("SplitToningBalance", "0");
    }
    if (global[1]) {
      put("ColorGradeGlobalHue", global[0]); put("ColorGradeGlobalSat", global[1]); put("ColorGradeGlobalLum", "0");
      put("ColorGradeBlending", "50");
    }

    // Detail and effects
    put("Sharpness", look.sharpness);
    put("LuminanceSmoothing", look.noiseReduction);
    put("GrainAmount", look.grain.amount);
    if (look.grain.amount) { put("GrainSize", look.grain.size); put("GrainFrequency", look.grain.roughness); }

    var curve = null;
    if (!look.curveIsIdentity) {
      put("ToneCurveName2012", "Custom");
      curve = look.curve.map(function (p) { return [Math.round(p[0] * 255), Math.round(clamp(p[1], 0, 1) * 255)]; });
    }
    return { settings: s, curve: curve, notes: notes };
  };

  FR.toXmp = function (recipe, target) {
    var r = FR.normalize(recipe), x = FR.xmpSettings(r, target), L = [];
    function alt(tag, text) {
      L.push("   <crs:" + tag + ">", "    <rdf:Alt>", '     <rdf:li xml:lang="x-default">' + xmlEscape(text) + "</rdf:li>", "    </rdf:Alt>", "   </crs:" + tag + ">");
    }
    var desc = [r.notes, r.author ? "Recipe by " + r.author + "." : "", "Converted with Fuji Recipe Converter."].filter(Boolean).join(" ");
    L.push('<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">');
    L.push(' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">');
    L.push('  <rdf:Description rdf:about=""');
    L.push('    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"');
    [["PresetType", "Normal"], ["Cluster", ""], ["UUID", uuid()], ["SupportsAmount", "False"],
     ["SupportsColor", "True"], ["SupportsMonochrome", "True"], ["SupportsHighDynamicRange", "True"],
     ["SupportsNormalDynamicRange", "True"], ["SupportsSceneReferred", "True"], ["SupportsOutputReferred", "True"],
     ["CameraModelRestriction", ""], ["Copyright", ""], ["ContactInfo", ""], ["Version", "15.0"], ["ProcessVersion", "11.0"]]
      .concat(x.settings, [["HasSettings", "True"]])
      .forEach(function (kv) { L.push("   crs:" + kv[0] + '="' + xmlEscape(kv[1]) + '"'); });
    L[L.length - 1] += ">";
    alt("Name", r.name); alt("ShortName", ""); alt("SortName", ""); alt("Group", "Fuji Recipes"); alt("Description", desc);
    if (x.curve) {
      L.push("   <crs:ToneCurvePV2012>", "    <rdf:Seq>");
      x.curve.forEach(function (p) { L.push("     <rdf:li>" + p[0] + ", " + p[1] + "</rdf:li>"); });
      L.push("    </rdf:Seq>", "   </crs:ToneCurvePV2012>");
    }
    L.push("  </rdf:Description>", " </rdf:RDF>", "</x:xmpmeta>", "");
    return L.join("\n");
  };

  // Adobe / Resolve .cube 3D LUT. Input and output are display-referred Rec.709 / sRGB.
  FR.toCube = function (recipe, size) {
    var r = FR.normalize(recipe), lut = FR.buildLut(FR.derive(r, { drInCurve: true }), size), L = [];
    L.push("# Created with Fuji Recipe Converter");
    L.push("# Recipe: " + r.name.replace(/[\r\n]/g, " ") + (r.author ? " by " + r.author.replace(/[\r\n]/g, " ") : ""));
    L.push("# Expects Rec.709 / sRGB gamma input. Grain, clarity, sharpness and noise reduction are not part of a LUT.");
    L.push('TITLE "' + r.name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'") + '"');
    L.push("LUT_3D_SIZE " + size, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0", "");
    for (var i = 0; i < lut.length; i += 3) L.push(lut[i].toFixed(6) + " " + lut[i + 1].toFixed(6) + " " + lut[i + 2].toFixed(6));
    L.push("");
    return L.join("\n");
  };

  FR.formatValue = function (field, r) {
    var v = r[field.key];
    if (field.type === "select") {
      for (var i = 0; i < field.options.length; i++) if (field.options[i][0] === v) return field.options[i][1];
      return String(v);
    }
    if (field.type === "number") {
      if (field.unit) return v + " " + field.unit;
      return (v > 0 ? "+" : "") + (field.step < 1 ? v.toFixed(1) : v);
    }
    return v;
  };

  // Human-readable recipe; FR.parseText reads this format back.
  FR.toText = function (recipe) {
    var r = FR.normalize(recipe), L = [r.name + (r.author ? " — by " + r.author : "")];
    FR.FIELDS.forEach(function (f) {
      if (f.when && !f.when(r)) return;
      if (f.type === "text" && !r[f.key]) return;
      L.push(f.label + ": " + FR.formatValue(f, r));
    });
    if (r.notes) L.push("", r.notes);
    return L.join("\n");
  };

  // Share code: "FR1." + base64url(JSON of the fields that differ from the defaults).
  FR.toShareCode = function (recipe) {
    var r = FR.normalize(recipe), d = FR.DEFAULT_RECIPE, o = {};
    Object.keys(r).forEach(function (k) { if (r[k] !== d[k]) o[k] = r[k]; });
    var bytes = new TextEncoder().encode(JSON.stringify(o)), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return "FR1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  FR.fromShareCode = function (code) {
    var m = /FR1\.([A-Za-z0-9_-]+)/.exec(code || "");
    if (!m) return null;
    try {
      var bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var o = JSON.parse(new TextDecoder().decode(bytes));
      return o && typeof o === "object" && !Array.isArray(o) ? FR.normalize(o) : null;
    } catch (e) { return null; }
  };

  FR.fileName = function (recipe, ext) {
    var base = (recipe.name || "recipe").replace(/[^A-Za-z0-9 _.-]+/g, "").trim().replace(/\s+/g, "-") || "recipe";
    return base + ext;
  };
})(window.FR = window.FR || {});
