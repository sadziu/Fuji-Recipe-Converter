/*
 * Colour engine.
 *
 *   FR.derive(recipe, opts)  recipe -> "look" in Lightroom-style units
 *   FR.makeTransform(look)   look   -> function(rgb) on display-referred sRGB / Rec.709 values
 *   FR.buildLut(look, n)     look   -> Float32Array 3D LUT (red fastest, as in .cube files)
 *   FR.applyLut(...)         LUT    -> pixels (trilinear), used by the preview
 *
 * The preview is rendered through the very same LUT that gets exported.
 */
(function (FR) {
  "use strict";

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  FR.clamp = clamp;

  var STRENGTH = { off: 0, weak: 1, strong: 2 };

  // Monotone cubic interpolation (Fritsch-Carlson) through [[x, y], ...].
  FR.makeCurve = function (pts) {
    var n = pts.length, xs = [], ys = [], d = [], m = [], i;
    for (i = 0; i < n; i++) { xs.push(pts[i][0]); ys.push(pts[i][1]); }
    for (i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m.push(d[0]);
    for (i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      var k = 0;
      while (x > xs[k + 1]) k++;
      var h = xs[k + 1] - xs[k], u = (x - xs[k]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * ys[k] + (u3 - 2 * u2 + u) * h * m[k] +
             (-2 * u3 + 3 * u2) * ys[k + 1] + (u3 - u2) * h * m[k + 1];
    };
  };

  // Hue (degrees) + strength from a two-axis tint, e.g. WB shift (red, blue).
  function tintFromAxes(ax, ay, hueX, hueY, gain) {
    var rx = hueX * Math.PI / 180, ry = hueY * Math.PI / 180;
    var x = ax * Math.cos(rx) + ay * Math.cos(ry), y = ax * Math.sin(rx) + ay * Math.sin(ry);
    var mag = Math.sqrt(x * x + y * y);
    if (mag < 1e-6) return [0, 0];
    var hue = Math.atan2(y, x) * 180 / Math.PI;
    return [Math.round((hue + 360) % 360), Math.round(clamp(mag * gain, 0, 100))];
  }

  /*
   * opts.simInProfile  true when the film simulation itself is supplied elsewhere
   *                    (an Adobe Camera Matching profile), so only the recipe's
   *                    adjustments on top of it are derived.
   * opts.drInCurve     fold the Dynamic Range highlight roll-off into the tone curve
   *                    (LUT / preview). Lightroom presets use the Highlights slider instead.
   */
  FR.derive = function (recipe, opts) {
    opts = opts || {};
    var r = FR.normalize(recipe), sim = FR.simById(r.filmSim), useSim = !opts.simInProfile;
    var i, look = { mono: sim.mono, simName: sim.name };

    // --- Tone curve: film simulation + Highlight / Shadow tone (+ DR) ---
    var TONE_STEP = 0.022;
    var shadow = (useSim ? sim.shadow : 0) + r.shadow * TONE_STEP;
    var high = (useSim ? sim.high : 0) + r.highlight * TONE_STEP;
    var lift = useSim ? sim.lift : 0;
    look.dr = r.dynamicRange === "dr400" ? 2 : r.dynamicRange === "dr200" ? 1 : 0;
    var roll = opts.drInCurve ? look.dr * 0.022 : 0;
    look.curve = [
      [0, lift],
      [0.25, clamp(0.25 - shadow, 0.06, 0.4) + lift * 0.6],
      [0.5, 0.5],
      [0.75, clamp(0.75 + high - roll, 0.6, 0.93)],
      [1, 1]
    ];
    look.curveIsIdentity = Math.abs(shadow) < 1e-9 && Math.abs(high - roll) < 1e-9 && lift === 0;

    // --- Saturation and HSL ---
    look.saturation = sim.mono ? 0 : clamp((useSim ? sim.sat : 0) + r.color * 6, -100, 100);
    look.hue = []; look.sat = []; look.lum = []; look.mix = [];
    var cce = STRENGTH[r.colorChromeEffect], ccb = STRENGTH[r.colorChromeFxBlue];
    // Color Chrome deepens saturated colours; FX Blue does the same for blues only.
    var CCE_LUM = [-6, -5, -4, -6, 0, 0, -4, -6], CCB_LUM = [0, 0, 0, 0, -5, -10, -5, 0];
    for (i = 0; i < 8; i++) {
      look.hue.push(useSim ? sim.hue[i] : 0);
      look.sat.push(useSim ? sim.satB[i] : 0);
      look.lum.push(clamp((useSim ? sim.lum[i] : 0) + cce * CCE_LUM[i] + ccb * CCB_LUM[i], -100, 100));
      // In black & white the same deepening is expressed through the grey mixer.
      look.mix.push(sim.mono ? clamp((useSim ? sim.mix[i] : 0) + cce * CCE_LUM[i] + ccb * CCB_LUM[i], -100, 100) : 0);
    }

    // --- Split toning from the film simulation ---
    var g = (useSim && sim.grade) || [0, 0, 0, 0];
    look.grade = { shadowHue: g[0], shadowSat: g[1], highlightHue: g[2], highlightSat: g[3], globalHue: 0, globalSat: 0 };
    if (sim.mono) {
      // Monochromatic Color: warm (amber) / cool, magenta / green.
      var t = tintFromAxes(r.monoWC, r.monoMG, 40, 310, 2.2);
      if (useSim && sim.tone && !t[1]) t = sim.tone;
      look.grade.globalHue = t[0]; look.grade.globalSat = t[1];
    }

    // --- White balance ---
    // The scene illuminant is unknown for an already-developed image, so the LUT and
    // preview only carry the *shift*. Absolute WB goes into RAW presets (see export).
    var R = r.wbShiftRed, B = r.wbShiftBlue, gr = Math.pow(2, 0.035 * R), gb = Math.pow(2, 0.035 * B);
    var norm = 0.2126 * gr + 0.7152 + 0.0722 * gb;
    look.wbGains = [gr / norm, 1 / norm, gb / norm];
    look.wb = {
      mode: r.whiteBalance, kelvin: r.kelvin, shiftRed: R, shiftBlue: B,
      miredShift: (R - B) * 3,                       // + = warmer
      tintShift: (R + B) * 2,                        // + = magenta
      incTemp: clamp(Math.round((R - B) * 2.2), -100, 100),
      incTint: clamp(Math.round((R + B) * 2.2), -100, 100),
      grade: tintFromAxes(R, B, 0, 240, 2.4)         // same shift as a global colour grade
    };

    // --- Spatial effects (cannot live in a LUT) ---
    var gs = STRENGTH[r.grainEffect];
    look.grain = { amount: [0, 18, 35][gs], size: r.grainSize === "large" ? 45 : 20, roughness: 50 };
    look.clarity = r.clarity * 7;
    look.sharpness = clamp(40 + r.sharpness * 8, 0, 150);
    look.noiseReduction = (r.noiseReduction + 4) * 4;
    return look;
  };

  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function linearToSrgb(v) { return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

  function hueOf(r, g, b, max, min) {
    var c = max - min, h;
    if (c < 1e-9) return 0;
    if (max === r) h = ((g - b) / c) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  // Piecewise-linear lookup of a per-band value at an arbitrary hue.
  var HUES = FR.BAND_HUES.concat([360]);
  function bandValue(arr, h) {
    for (var i = 0; i < 8; i++) {
      if (h <= HUES[i + 1]) {
        var t = (h - HUES[i]) / (HUES[i + 1] - HUES[i]);
        return arr[i] + (arr[(i + 1) % 8] - arr[i]) * t;
      }
    }
    return arr[0];
  }

  function anyNonZero(arr) { return arr.some(function (v) { return v !== 0; }); }

  // Zero-luma colour offset for a hue, used for split toning / tints.
  function tintVector(hueDeg) {
    var h = hueDeg / 60, x = 1 - Math.abs(h % 2 - 1), rgb;
    if (h < 1) rgb = [1, x, 0]; else if (h < 2) rgb = [x, 1, 0]; else if (h < 3) rgb = [0, 1, x];
    else if (h < 4) rgb = [0, x, 1]; else if (h < 5) rgb = [x, 0, 1]; else rgb = [1, 0, x];
    var y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return [rgb[0] - y, rgb[1] - y, rgb[2] - y];
  }

  // Returns f(r, g, b, out) operating on gamma-encoded 0..1 values.
  FR.makeTransform = function (look) {
    var curve = FR.makeCurve(look.curve), identityCurve = look.curveIsIdentity;
    var wb = look.wbGains, hasWb = Math.abs(wb[0] - wb[1]) > 1e-6 || Math.abs(wb[2] - wb[1]) > 1e-6;
    var satK = 1 + look.saturation / 100;
    var hasHue = anyNonZero(look.hue), hasSat = anyNonZero(look.sat), hasLum = anyNonZero(look.lum), hasMix = anyNonZero(look.mix);
    var gr = look.grade;
    var tS = tintVector(gr.shadowHue), tH = tintVector(gr.highlightHue), tG = tintVector(gr.globalHue);
    var kS = gr.shadowSat / 100 * 0.22, kH = gr.highlightSat / 100 * 0.22, kG = gr.globalSat / 100 * 0.22;
    var SQ3 = Math.sqrt(1 / 3);

    return function (r, g, b, out) {
      var y, max, min, c, h, k, v;
      if (hasWb) {
        r = linearToSrgb(Math.min(1, srgbToLinear(r) * wb[0]));
        g = linearToSrgb(Math.min(1, srgbToLinear(g) * wb[1]));
        b = linearToSrgb(Math.min(1, srgbToLinear(b) * wb[2]));
      }
      if (!identityCurve) { r = curve(r); g = curve(g); b = curve(b); }

      max = Math.max(r, g, b); min = Math.min(r, g, b); c = max - min;
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (look.mono) {
        if (hasMix && c > 1e-6) {
          h = hueOf(r, g, b, max, min);
          y = clamp(y * (1 + bandValue(look.mix, h) / 100 * 0.9 * Math.min(1, c * 1.6)), 0, 1);
        }
        r = g = b = y;
      } else if (c > 1e-6) {
        h = hueOf(r, g, b, max, min);
        if (hasHue) {
          // Rotate chroma around the grey axis (Lightroom's +/-100 is roughly +/-30 degrees).
          v = bandValue(look.hue, h) * 0.3 * Math.PI / 180;
          var cs = Math.cos(v), sn = Math.sin(v), o = (1 - cs) / 3, s3 = SQ3 * sn;
          var r2 = r * (cs + o) + g * (o - s3) + b * (o + s3);
          var g2 = r * (o + s3) + g * (cs + o) + b * (o - s3);
          var b2 = r * (o - s3) + g * (o + s3) + b * (cs + o);
          r = r2; g = g2; b = b2;
          y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        k = satK * (hasSat ? Math.max(0, 1 + bandValue(look.sat, h) / 100) : 1);
        if (k !== 1) { r = y + (r - y) * k; g = y + (g - y) * k; b = y + (b - y) * k; }
        if (hasLum) {
          k = 1 + bandValue(look.lum, h) / 100 * 0.9 * Math.min(1, c * 1.6);
          r *= k; g *= k; b *= k;
        }
      } else if (satK !== 1) {
        r = y + (r - y) * satK; g = y + (g - y) * satK; b = y + (b - y) * satK;
      }

      if (kS || kH || kG) {
        y = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
        var wS = (1 - y) * (1 - y) * kS, wH = y * y * kH, wG = 4 * y * (1 - y) * kG + kG * 0.35;
        r += tS[0] * wS + tH[0] * wH + tG[0] * wG;
        g += tS[1] * wS + tH[1] * wH + tG[1] * wG;
        b += tS[2] * wS + tH[2] * wH + tG[2] * wG;
      }
      out[0] = clamp(r, 0, 1); out[1] = clamp(g, 0, 1); out[2] = clamp(b, 0, 1);
    };
  };

  // 3D LUT, n^3 RGB triples, red index varying fastest.
  FR.buildLut = function (look, n) {
    var f = FR.makeTransform(look), lut = new Float32Array(n * n * n * 3), out = [0, 0, 0], p = 0, s = 1 / (n - 1);
    for (var bi = 0; bi < n; bi++) for (var gi = 0; gi < n; gi++) for (var ri = 0; ri < n; ri++) {
      f(ri * s, gi * s, bi * s, out);
      lut[p++] = out[0]; lut[p++] = out[1]; lut[p++] = out[2];
    }
    return lut;
  };

  // Trilinear LUT lookup over RGBA bytes; writes columns x >= fromX of dst (the rest is left as-is).
  FR.applyLut = function (src, dst, width, height, lut, n, fromX) {
    var n1 = n - 1, sc = n1 / 255, nn = n * n, x, y, i, j;
    for (y = 0; y < height; y++) {
      for (x = fromX || 0; x < width; x++) {
        i = (y * width + x) * 4;
        var fr = src[i] * sc, fg = src[i + 1] * sc, fb = src[i + 2] * sc;
        var r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
        if (r0 >= n1) r0 = n1 - 1; if (g0 >= n1) g0 = n1 - 1; if (b0 >= n1) b0 = n1 - 1;
        var dr = fr - r0, dg = fg - g0, db = fb - b0;
        var base = (r0 + g0 * n + b0 * nn) * 3, gO = n * 3, bO = nn * 3;
        for (j = 0; j < 3; j++) {
          var p = base + j;
          var c00 = lut[p] + (lut[p + 3] - lut[p]) * dr;
          var c10 = lut[p + gO] + (lut[p + gO + 3] - lut[p + gO]) * dr;
          var c01 = lut[p + bO] + (lut[p + bO + 3] - lut[p + bO]) * dr;
          var c11 = lut[p + gO + bO] + (lut[p + gO + bO + 3] - lut[p + gO + bO]) * dr;
          var c0 = c00 + (c10 - c00) * dg, c1 = c01 + (c11 - c01) * dg;
          dst[i + j] = (c0 + (c1 - c0) * db) * 255 + 0.5;
        }
        dst[i + 3] = src[i + 3];
      }
    }
  };

  /*
   * Preview-only spatial effects, applied in place to RGBA bytes for columns x >= fromX.
   *   blur: Uint8ClampedArray of a blurred copy of the *graded* image (for clarity), or null.
   */
  FR.applySpatial = function (px, width, height, look, blur, fromX, scale) {
    var clarity = look.clarity / 100, amount = look.grain.amount / 100 * 60;
    if (!clarity && !amount) return;
    // Grain cell size in preview pixels; deterministic so the preview does not flicker.
    var cell = Math.max(1, Math.round((look.grain.size > 30 ? 2.4 : 1.2) * (scale || 1)));
    var x, y, i, n, seed;
    for (y = 0; y < height; y++) {
      for (x = fromX || 0; x < width; x++) {
        i = (y * width + x) * 4;
        var r = px[i], g = px[i + 1], b = px[i + 2], d = 0;
        if (clarity && blur) {
          var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          var lb = 0.2126 * blur[i] + 0.7152 * blur[i + 1] + 0.0722 * blur[i + 2];
          var mid = 1 - Math.abs(lum / 127.5 - 1);       // protect deep shadows and highlights
          d += (lum - lb) * clarity * 1.4 * mid;
        }
        if (amount) {
          seed = (((x / cell) | 0) * 374761393 + ((y / cell) | 0) * 668265263) | 0;
          seed = (seed ^ (seed >>> 13)) * 1274126177 | 0;
          n = ((seed ^ (seed >>> 16)) >>> 0) / 4294967295 - 0.5;
          var l2 = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          d += n * amount * (0.35 + 0.65 * 4 * l2 * (1 - l2));  // strongest in the midtones
        }
        px[i] = r + d; px[i + 1] = g + d; px[i + 2] = b + d;
      }
    }
  };
})(window.FR = window.FR || {});
