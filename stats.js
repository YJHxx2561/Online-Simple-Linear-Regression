/*
 * stats.js —— 一元线性回归统计引擎
 * 纯 JavaScript，无任何外部依赖，可直接在浏览器或 Node.js 中运行。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LRStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 数值工具 ---------------- */

  function logGamma(z) {
    const c = [
      76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.001208650973866179, -0.000005395239384953
    ];
    let x = z, y = z;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function regIncompleteBeta(a, b, x) {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /** 学生 t 分布累积分布函数 P(T <= t) */
  function studentTCdf(t, df) {
    if (!(df > 0)) return NaN;
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    const x = df / (df + t * t);
    const half = 0.5 * regIncompleteBeta(df / 2, 0.5, x);
    return t > 0 ? 1 - half : half;
  }

  /** 学生 t 分布分位数（双尾置信水平使用） */
  function studentTQuantile(p, df) {
    if (!(df > 0) || !(p > 0 && p < 1)) return NaN;
    let lo = -1e7, hi = 1e7;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (studentTCdf(mid, df) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function twoSidedP(t, df) {
    if (!isFinite(t) || !(df > 0)) return NaN;
    const p = 2 * (1 - studentTCdf(Math.abs(t), df));
    return Math.max(0, Math.min(1, p));
  }

  /* ---------------- 数据解析 ---------------- */

  function cleanNumberToken(token, decimalMode) {
    if (token == null) return null;
    let s = String(token).replace(/[\s\u00a0\u2007\u202f\ufeff]/g, '').trim();
    if (!s) return null;
    if (decimalMode === 'comma') {
      if (/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '');
      s = s.replace(',', '.');
    } else if (decimalMode === 'auto') {
      if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    }
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
    const value = Number(s);
    return Number.isFinite(value) ? value : null;
  }

  function effectiveDecimalMode(decimalFormat, delimiter) {
    if (decimalFormat === 'comma' || decimalFormat === 'dot') return decimalFormat;
    return (delimiter === 'comma' || delimiter === 'tab') ? 'dot' : 'auto';
  }

  function detectDelimiter(line, decimalFormat, forList) {
    if (decimalFormat === 'comma' && !forList) {
      if (line.indexOf('\t') >= 0) return 'tab';
      if (line.indexOf(';') >= 0) return 'semicolon';
      return 'space';
    }
    if (line.indexOf('\t') >= 0) return 'tab';
    if (line.indexOf(';') >= 0) return 'semicolon';
    if (line.indexOf(',') >= 0) return 'comma';
    return 'space';
  }

  function splitLine(line, delimiter, decimalFormat, forList) {
    let delim = delimiter;
    if (delim === 'auto') delim = detectDelimiter(line, decimalFormat, forList);
    let parts;
    if (delim === 'tab') parts = line.split(/\t+/);
    else if (delim === 'space') parts = line.split(/\s+/);
    else if (delim === 'semicolon') parts = line.split(';');
    else parts = line.split(',');
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  function isIgnorableLine(line) {
    const s = line.trim();
    return !s || s.charAt(0) === '#' || s.indexOf('//') === 0;
  }

  /** 解析“每行一组 x,y”的文本 */
  function parseData(text, options) {
    const opts = options || {};
    const decimalFormat = opts.decimalFormat || 'auto';
    const delimiter = opts.delimiter || 'auto';
    const decimalMode = effectiveDecimalMode(decimalFormat, delimiter);
    const lines = String(text || '').split(/\r?\n/);
    const points = [];
    let headerSkipped = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isIgnorableLine(line)) continue;
      const parts = splitLine(line.trim(), delimiter, decimalFormat, false);
      if (parts.length < 2) {
        throw new Error('第 ' + (i + 1) + ' 行需要两个数值（x 和 y）');
      }
      const x = cleanNumberToken(parts[0], decimalMode);
      const y = cleanNumberToken(parts[1], decimalMode);
      if (x === null || y === null) {
        if (!headerSkipped && points.length === 0 && parts.length >= 2) {
          headerSkipped = true; // 忽略首行表头
          continue;
        }
        throw new Error('第 ' + (i + 1) + ' 行包含无法识别的数值：“' + line.trim() + '”');
      }
      points.push({ x: x, y: y });
    }
    return points;
  }

  function parseList(text, options) {
    const opts = options || {};
    const decimalFormat = opts.decimalFormat || 'auto';
    const delimiter = opts.delimiter || 'auto';
    const decimalMode = effectiveDecimalMode(decimalFormat, delimiter);
    const lines = String(text || '').split(/\r?\n/);
    const values = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isIgnorableLine(line)) continue;
      const parts = splitLine(line.trim(), delimiter, decimalFormat, true);
      for (let j = 0; j < parts.length; j++) {
        const v = cleanNumberToken(parts[j], decimalMode);
        if (v === null) throw new Error('第 ' + (i + 1) + ' 行包含无法识别的数值：“' + parts[j] + '”');
        values.push(v);
      }
    }
    return values;
  }

  /** 解析分别输入的 X / Y 两列 */
  function parseLists(xText, yText, options) {
    const xs = parseList(xText, options);
    const ys = parseList(yText, options);
    if (xs.length !== ys.length) {
      throw new Error('X 与 Y 的数量不一致：X 有 ' + xs.length + ' 个，Y 有 ' + ys.length + ' 个');
    }
    return xs.map(function (x, i) { return { x: x, y: ys[i] }; });
  }

  /* ---------------- 回归计算 ---------------- */

  /**
   * 一元线性回归（普通最小二乘）
   * @param {Array<{x:number,y:number}>} points
   * @param {{confidence?:number}} options confidence 例如 0.95
   */
  function linearRegression(points, options) {
    if (!Array.isArray(points) || points.length < 2) {
      throw new Error('至少需要 2 组有效数据');
    }
    const n = points.length;
    const conf = (options && options.confidence) || 0.95;
    const warnings = [];

    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
      const x = points[i].x, y = points[i].y;
      sumX += x; sumY += y; sumX2 += x * x; sumY2 += y * y; sumXY += x * y;
    }
    const meanX = sumX / n, meanY = sumY / n;

    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = points[i].x - meanX, dy = points[i].y - meanY;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (sxx <= 1e-15) {
      throw new Error('X 值不能全部相同，无法拟合回归直线');
    }

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    if (syy <= 1e-15) warnings.push('Y 值几乎完全相同，相关系数与决定系数没有实际意义。');

    let sse = 0;
    const fitted = points.map(function (p) {
      const hat = intercept + slope * p.x;
      sse += (p.y - hat) * (p.y - hat);
      return hat;
    });
    const ssr = syy - sse;
    const df = n - 2;
    const mse = df > 0 ? sse / df : NaN;
    const se = df > 0 ? Math.sqrt(mse) : NaN;

    const r = syy > 1e-15 ? sxy / Math.sqrt(sxx * syy) : 0;
    const r2 = syy > 1e-15 ? Math.max(0, Math.min(1, r * r)) : 1;
    const adjR2 = df > 0 ? 1 - (1 - r2) * (n - 1) / df : NaN;

    const seSlope = df > 0 ? se / Math.sqrt(sxx) : NaN;
    const seIntercept = df > 0 ? se * Math.sqrt(1 / n + meanX * meanX / sxx) : NaN;
    const tSlope = seSlope > 0 ? slope / seSlope : (slope === 0 ? 0 : Infinity);
    const tIntercept = seIntercept > 0 ? intercept / seIntercept : (intercept === 0 ? 0 : Infinity);
    const pSlope = df > 0 ? twoSidedP(tSlope, df) : NaN;
    const pIntercept = df > 0 ? twoSidedP(tIntercept, df) : NaN;
    const F = df > 0 && mse > 0 ? ssr / mse : (df > 0 && ssr > 0 ? Infinity : NaN);
    const pF = pSlope;
    const criticalT = df > 0 ? studentTQuantile(1 - (1 - conf) / 2, df) : NaN;

    const ciSlope = df > 0 ? [slope - criticalT * seSlope, slope + criticalT * seSlope] : null;
    const ciIntercept = df > 0 ? [intercept - criticalT * seIntercept, intercept + criticalT * seIntercept] : null;

    const rows = points.map(function (p, i) {
      const hat = fitted[i];
      const residual = p.y - hat;
      const leverage = 1 / n + Math.pow(p.x - meanX, 2) / sxx;
      const h = Math.max(0, Math.min(1, leverage));
      const stdResidual = df > 0 && se > 0 ? residual / (se * Math.sqrt(Math.max(1e-15, 1 - h))) : NaN;
      const cooksD = df > 0 && se > 0 ? (residual * residual / (2 * mse)) * (h / Math.pow(1 - h, 2)) : NaN;
      return {
        index: i + 1, x: p.x, y: p.y, fitted: hat, residual: residual,
        leverage: leverage, stdResidual: stdResidual, cooksD: cooksD
      };
    });

    let durbinWatson = NaN;
    if (sse > 1e-15 && n > 1) {
      let acc = 0;
      for (let i = 1; i < n; i++) acc += Math.pow(rows[i].residual - rows[i - 1].residual, 2);
      durbinWatson = acc / sse;
    }

    const xs = points.map(function (p) { return p.x; });
    const ys = points.map(function (p) { return p.y; });

    return {
      n: n,
      confidence: conf,
      df: df,
      sumX: sumX, sumY: sumY, sumX2: sumX2, sumY2: sumY2, sumXY: sumXY,
      meanX: meanX, meanY: meanY,
      sxx: sxx, syy: syy, sxy: sxy,
      slope: slope, intercept: intercept,
      r: r, r2: r2, adjR2: adjR2,
      sst: syy, ssr: ssr, sse: sse, mse: mse, se: se,
      seSlope: seSlope, seIntercept: seIntercept,
      tSlope: tSlope, tIntercept: tIntercept,
      pSlope: pSlope, pIntercept: pIntercept,
      F: F, pF: pF,
      criticalT: criticalT,
      ciSlope: ciSlope, ciIntercept: ciIntercept,
      rows: rows,
      durbinWatson: durbinWatson,
      xMin: Math.min.apply(null, xs), xMax: Math.max.apply(null, xs),
      yMin: Math.min.apply(null, ys), yMax: Math.max.apply(null, ys),
      hasInference: df > 0,
      warnings: warnings
    };
  }

  /** 给定 x0 的预测值与区间 */
  function predict(model, x0) {
    if (!model || !isFinite(x0)) throw new Error('请输入有效的 X 值');
    const hat = model.intercept + model.slope * x0;
    const result = {
      x: x0, fitted: hat,
      ci: null, pi: null, seMean: null, sePred: null,
      outside: x0 < model.xMin || x0 > model.xMax
    };
    if (!model.hasInference || !(model.se > 0)) return result;
    const dx2 = Math.pow(x0 - model.meanX, 2);
    result.seMean = model.se * Math.sqrt(1 / model.n + dx2 / model.sxx);
    result.sePred = model.se * Math.sqrt(1 + 1 / model.n + dx2 / model.sxx);
    result.ci = [hat - model.criticalT * result.seMean, hat + model.criticalT * result.seMean];
    result.pi = [hat - model.criticalT * result.sePred, hat + model.criticalT * result.sePred];
    return result;
  }

  return {
    parseData: parseData,
    parseLists: parseLists,
    parseList: parseList,
    linearRegression: linearRegression,
    predict: predict,
    studentTCdf: studentTCdf,
    studentTQuantile: studentTQuantile,
    twoSidedP: twoSidedP
  };
});
