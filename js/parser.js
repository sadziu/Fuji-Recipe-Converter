/*
 * Importers. Everything funnels into FR.parseAny(text), which accepts:
 *   - a share code ("FR1....") or a link containing one
 *   - a recipe .json exported by this app
 *   - an X RAW Studio profile (.FP1 / .FP2 / .FP3, which are XML)
 *   - free text: "Label: value" lists, or label / value on separate lines as produced
 *     by OCR of a recipe screenshot (including two-column layouts)
 *
 * Result: { values: {partial recipe}, found: [field keys], source: string } or null.
 */
(function (FR) {
  "use strict";

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }

  // Earliest (then longest) alias match in `s`. list: [[alias, id], ...]
  function matchEnum(s, list) {
    var best = null;
    list.forEach(function (it) {
      var re = new RegExp("(?<![a-z0-9])" + esc(it[0]).replace(/\s+/g, "\\s*") + "(?![a-z0-9])", "i"), m = re.exec(s);
      if (!m) return;
      if (!best || m.index < best.index || (m.index === best.index && m[0].length > best.len)) {
        best = { value: it[1], index: m.index, len: m[0].length, end: m.index + m[0].length };
      }
    });
    return best;
  }

  function aliasList(items) {
    var out = [];
    items.forEach(function (it) {
      out.push([it.name, it.id]);
      (it.aliases || []).forEach(function (a) { out.push([a, it.id]); });
    });
    return out;
  }
  var SIM_ALIASES = aliasList(FR.SIMS), WB_ALIASES = aliasList(FR.WB);
  var GENERIC = { standard: 1, soft: 1, vivid: 1, chrome: 1, cinema: 1, bw: 1, "b&w": 1 };
  var SIM_ALIASES_STRICT = SIM_ALIASES.filter(function (a) { return !GENERIC[a[0]]; });
  var OWS = [["off", "off"], ["weak", "weak"], ["strong", "strong"], ["none", "off"]];
  var SIZES = [["small", "small"], ["large", "large"]];

  // Signed number; OCR often turns the minus sign into a dash or tilde.
  function matchNumber(s) {
    var m = /([+\-−–—~]?)\s?(\d+(?:[.,]\d+)?)/.exec(s);
    if (!m) return null;
    var v = parseFloat(m[2].replace(",", "."));
    return { value: m[1] && m[1] !== "+" ? -v : v, end: m.index + m[0].length };
  }

  var VALUE = {
    filmSim: function (s) { return matchEnum(s, SIM_ALIASES); },
    dynamicRange: function (s) {
      var m = /DR\s*-?\s*(100|200|400)|\b(100|200|400)\s*%?|\b(auto)\b/i.exec(s);
      return m ? { value: m[3] ? "auto" : "dr" + (m[1] || m[2]), end: m.index + m[0].length } : null;
    },
    whiteBalance: function (s) {
      var k = /(\d{4,5})\s*K\b/i.exec(s), e = matchEnum(s, WB_ALIASES);
      if (k && (!e || k.index < e.index)) return { value: "kelvin", kelvin: +k[1], end: k.index + k[0].length };
      if (e && e.value === "kelvin") {
        k = /^\s*[:(,]?\s*(\d{4,5})\s*K?\b/i.exec(s.slice(e.end));
        if (k) { e.kelvin = +k[1]; e.end += k[0].length; }
      }
      return e;
    },
    grainEffect: function (s) {
      var e = matchEnum(s, OWS);
      if (e) { var z = matchEnum(s.slice(e.end, e.end + 12), SIZES); if (z) { e.grainSize = z.value; e.end += z.end; } }
      return e;
    },
    grainSize: function (s) { return matchEnum(s, SIZES); },
    colorChromeEffect: function (s) { return matchEnum(s, OWS); },
    colorChromeFxBlue: function (s) { return matchEnum(s, OWS); }
  };
  ["kelvin", "wbShiftRed", "wbShiftBlue", "color", "monoWC", "monoMG", "sharpness", "highlight", "shadow", "noiseReduction", "clarity"]
    .forEach(function (k) { VALUE[k] = matchNumber; });

  // Order matters: more specific labels first; matched spans are masked.
  var LABELS = [
    ["colorChromeFxBlue", /colou?r\s*chrome\s*(?:fx|effect)?\s*blue/gi],
    ["colorChromeEffect", /colou?r\s*chrome(?:\s*effect)?/gi],
    ["wbShiftRed", /(?:wb|white\s*balance)\s*shift\s*r(?:ed)?\b/gi],
    ["wbShiftBlue", /(?:wb|white\s*balance)\s*shift\s*b(?:lue)?\b/gi],
    ["whiteBalance", /white\s*balance|\bWB(?=\s*:)/gi],
    ["kelvin", /colou?r\s*temp(?:erature)?(?=\s*[:=]?\s*\d{4,5})/gi],
    ["_mask", /colou?r\s*temp(?:erature)?/gi],
    ["filmSim", /film\s*sim(?:ulation)?\b/gi],
    ["dynamicRange", /dynamic\s*range|\bd[\s-]range\b/gi],
    ["grainSize", /grain\s*size/gi],
    ["grainEffect", /grain(?:\s*effect)?/gi],
    ["monoWC", /mono(?:chromatic)?\s*colou?r\s*:?\s*\(?(?:warm\s*\/\s*cool|WC)\)?/gi],
    ["monoMG", /mono(?:chromatic)?\s*colou?r\s*:?\s*\(?(?:magenta\s*\/\s*green|MG)\)?/gi],
    ["highlight", /highlights?(?:\s*tone)?/gi],
    ["shadow", /shadows?(?:\s*tone)?/gi],
    ["sharpness", /sharp(?:ness|ening)/gi],
    ["noiseReduction", /(?:high\s*iso\s*)?noise\s*reduction|high\s*iso\s*nr|\bNR\b/gi],
    ["clarity", /clarit[yv]?/gi],
    ["exposureComp", /exposure(?:\s*compensation)?/gi],
    ["camera", /camera(?:\s*\/\s*sensor)?|\bsensor\b/gi],
    ["iso", /\biso\b/gi],
    ["color", /\bcolou?r\b/gi]
  ];
  var TEXT_FIELDS = { iso: 1, exposureComp: 1, camera: 1 };

  function findLabels(line) {
    var taken = [], found = [];
    LABELS.forEach(function (def) {
      var re = def[1], m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        var a = m.index, b = a + m[0].length;
        if (b === a) { re.lastIndex++; continue; }
        if (taken.some(function (t) { return a < t[1] && b > t[0]; })) continue;
        taken.push([a, b]);
        if (def[0] !== "_mask") found.push({ key: def[0], start: a, end: b });
      }
    });
    // A label repeated inside its own value ("ISO: Auto, up to ISO 6400") is part of that value.
    return found.sort(function (x, y) { return x.start - y.start; })
      .filter(function (lab, i, all) { return i === 0 || all[i - 1].key !== lab.key; });
  }

  function cleanText(s) { return s.replace(/^[\s:=|\-–—]+/, "").replace(/\s+/g, " ").trim(); }

  FR.parseText = function (text, opts) {
    opts = opts || {};
    var lines = String(text).replace(/ /g, " ").split(/\r?\n/), values = {}, found = [];
    var labelled = lines.map(findLabels);

    function store(key, res) {
      if (key in values) return;
      values[key] = res.value; found.push(key);
      if (res.kelvin && !("kelvin" in values)) { values.kelvin = res.kelvin; found.push("kelvin"); }
      if (res.grainSize && !("grainSize" in values)) { values.grainSize = res.grainSize; found.push("grainSize"); }
    }

    lines.forEach(function (line, i) {
      var labs = labelled[i];
      if (!labs.length) return;
      var inlineHit = false;
      labs.forEach(function (lab, j) {
        var seg = line.slice(lab.end, j + 1 < labs.length ? labs[j + 1].start : line.length);
        if (TEXT_FIELDS[lab.key]) {
          var t = cleanText(seg);
          if (t) { store(lab.key, { value: t }); inlineHit = true; }
          return;
        }
        var res = VALUE[lab.key](seg);
        if (!res) return;
        inlineHit = true;
        store(lab.key, res);
        if (lab.key === "whiteBalance") {
          // "Daylight, +2 Red & -4 Blue" style shifts written inside the white balance value.
          var rs = /([+\-−–]?\s?\d)\s*R(?:ed)?\b/i.exec(seg), bs = /([+\-−–]?\s?\d)\s*B(?:lue)?\b/i.exec(seg);
          if (rs) store("wbShiftRed", matchNumber(rs[1]));
          if (bs) store("wbShiftBlue", matchNumber(bs[1]));
        }
      });
      if (inlineHit) return;

      // Labels only: the values sit on a following label-free line, in the same order.
      // OCR may put a line of icon debris in between, so look a few lines ahead.
      for (var k = i + 1, tried = 0; k < lines.length && tried < 3; k++) {
        if (!lines[k].trim()) continue;
        if (labelled[k].length) break;
        tried++;
        var rest = lines[k], hits = [];
        labs.forEach(function (lab, j) {
          if (TEXT_FIELDS[lab.key]) {
            if (j === labs.length - 1 && cleanText(rest)) hits.push([lab.key, { value: cleanText(rest) }]);
            return;
          }
          var res = VALUE[lab.key](rest);
          if (!res) return;
          hits.push([lab.key, res]);
          rest = rest.slice(res.end);
        });
        if (hits.length) { hits.forEach(function (h) { store(h[0], h[1]); }); break; }
      }
    });

    // A film simulation mentioned without its label (e.g. as a heading).
    if (!("filmSim" in values)) {
      var sim = matchEnum(String(text), SIM_ALIASES_STRICT);
      if (sim) { values.filmSim = sim.value; found.push("filmSim"); }
    }
    if ("kelvin" in values && !("whiteBalance" in values)) values.whiteBalance = "kelvin";

    // First line as the recipe name ("Name — by Author"), for typed / pasted text only.
    if (!opts.ocr) {
      for (var n = 0; n < lines.length; n++) {
        var first = lines[n].trim();
        if (!first) continue;
        if (!labelled[n].length && first.length <= 80 && !matchEnum(first, SIM_ALIASES_STRICT)) {
          var by = /^(.*?)\s*(?:[—–-]\s*)?\bby\s+(.+)$/i.exec(first);
          values.name = by && by[1] ? by[1] : first;
          if (by && by[1]) values.author = by[2];
        }
        break;
      }
    }
    return found.length ? { values: values, found: found, source: opts.ocr ? "screenshot" : "text" } : null;
  };

  // X RAW Studio conversion profile (.FP1 / .FP2 / .FP3).
  FR.parseFP = function (xml) {
    var doc = new DOMParser().parseFromString(String(xml).replace(/^﻿/, ""), "application/xml");
    var group = doc.getElementsByTagName("PropertyGroup")[0];
    if (!group || doc.getElementsByTagName("parsererror").length) return null;
    var values = {}, found = [];
    function tag(name) { var el = group.getElementsByTagName(name)[0]; return el ? (el.textContent || "").trim() : ""; }
    function set(key, v) { if (v !== null && v !== undefined && v !== "") { values[key] = v; found.push(key); } }
    function num(name, tenths) {
      var t = tag(name), v = parseFloat(t);
      if (t === "" || !isFinite(v)) return null;
      return tenths && Math.abs(v) > 4 ? v / 10 : v;   // some firmware stores tones as tenths
    }
    function lower(name) { return tag(name).toLowerCase(); }
    function ows(name) { var t = lower(name); return t === "weak" || t === "strong" || t === "off" ? t : null; }

    var label = group.getAttribute("label") || "", by = /^(.*)\s+by\s+(.+)$/i.exec(label);
    if (label) { values.name = by ? by[1] : label; if (by) values.author = by[2]; }
    var device = group.getAttribute("device");
    if (device) values.camera = device;

    var fs = lower("FilmSimulation");
    if (fs) {
      var sim = FR.SIMS.filter(function (s) { return s.fp.toLowerCase() === fs; })[0];
      set("filmSim", sim ? sim.id : (matchEnum(fs, SIM_ALIASES) || {}).value);
    }
    var dr = /(100|200|400)/.exec(tag("DynamicRange"));
    set("dynamicRange", dr ? "dr" + dr[1] : /auto/i.test(tag("DynamicRange")) ? "auto" : null);

    var wb = lower("WhiteBalance"), kelvin = parseInt(tag("WBColorTemp"), 10);
    if (wb === "temperature" || (!wb && kelvin > 0)) { set("whiteBalance", "kelvin"); if (kelvin > 0) set("kelvin", kelvin); }
    else if (wb && wb !== "invalid") set("whiteBalance", (matchEnum(wb, WB_ALIASES) || {}).value);

    set("wbShiftRed", num("WBShiftR")); set("wbShiftBlue", num("WBShiftB"));
    set("grainEffect", ows("GrainEffect"));
    var size = lower("GrainEffectSize");
    set("grainSize", size === "small" || size === "large" ? size : null);
    set("colorChromeEffect", ows("ChromeEffect")); set("colorChromeFxBlue", ows("ColorChromeBlue"));
    set("highlight", num("HighlightTone", true)); set("shadow", num("ShadowTone", true));
    set("color", num("Color")); set("sharpness", num("Sharpness"));
    set("noiseReduction", num("NoisReduction")); set("clarity", num("Clarity"));
    set("monoWC", num("BlackImageTone")); set("monoMG", num("MonochromaticColor_RG"));

    var ev = /^([PM])(\d)P(\d\d)$/.exec(tag("ExposureBias"));
    if (ev) values.exposureComp = (ev[1] === "M" ? "-" : "+") + ev[2] + "." + ev[3] + " EV";
    return found.length ? { values: values, found: found, source: "X RAW Studio profile" } : null;
  };

  FR.parseAny = function (text, opts) {
    text = String(text || "");
    var shared = FR.fromShareCode(text);
    if (shared) return { values: shared, found: Object.keys(shared), source: "share code" };
    var trimmed = text.replace(/^﻿/, "").trim();
    if (trimmed.charAt(0) === "{") {
      try {
        var o = JSON.parse(trimmed);
        if (o && o.recipe) o = o.recipe;
        if (o && typeof o === "object" && o.filmSim) return { values: o, found: Object.keys(o), source: "recipe file" };
      } catch (e) { /* fall through to text parsing */ }
    }
    if (/<ConversionProfile[\s>]/i.test(trimmed)) return FR.parseFP(trimmed);
    return FR.parseText(text, opts);
  };
})(window.FR = window.FR || {});
