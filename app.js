/* app.js —— 界面交互、结果渲染、SVG 图表与导出 */
(function () {
  'use strict';

  const S = window.LRStats;
  const $ = function (id) { return document.getElementById(id); };

  let model = null;
  let points = [];
  let chartSvgs = { scatter: '', residual: '' };
  let toastTimer = null;
  let calcTimer = null;
  let activeTab = 'pairs';
  const CELL_INITIAL_ROWS = 5;

  const HELP = {
    ols: ['普通最小二乘法 (OLS)', '通过最小化所有数据点的残差平方和来拟合直线，是最常用的线性回归估计方法。'],
    slope: ['斜率 b₁', 'X 每增加 1 个单位时，Y 的平均变化量。斜率为正表示同向变化，为负表示反向变化。'],
    intercept: ['截距 b₀', '拟合直线与 Y 轴的交点，即 X = 0 时 Y 的预测值。若 0 不在数据范围内，截距的实际意义有限。'],
    r: ['相关系数 r', '衡量 X 与 Y 线性关系的方向和强度，取值在 −1 到 +1 之间。越接近 ±1，线性关系越强。'],
    r2: ['决定系数 R²', '表示 Y 的变异中有多少比例可以由 X 的线性变化解释，取值在 0 到 1 之间。'],
    adjR2: ['调整 R²', '考虑样本量和变量个数后对 R² 的修正，便于比较不同样本量下的模型。'],
    se: ['估计标准误 s', '观测值围绕回归线的平均偏离程度，反映模型拟合的离散程度。'],
    seSlope: ['斜率标准误', '斜率估计量的标准差，用来衡量斜率估计的不确定性。值越小，估计越稳定。'],
    p: ['p 值', '在「斜率实际为 0」的假设下，观察到当前结果的概率。p 值越小，说明线性关系越显著。'],
    f: ['F 统计量', '比较回归解释的变异与残差变异，用于检验整体回归是否显著。在一元回归中 F = t²。'],
    dw: ['Durbin–Watson', '检验残差是否存在一阶自相关。接近 2 表示无明显自相关，明显小于或大于 2 则可能存在问题。'],
    df: ['自由度 df', '计算统计量时可自由变化的观测值数量。一元线性回归残差自由度为 n − 2。'],
    ci: ['置信区间', '按设定的置信水平（如 95%）给出的参数可能范围。这里的区间针对回归系数或均值响应。'],
    pi: ['预测区间', '给定 X 时，单个新观测值 Y 的可能范围。它比均值置信区间更宽，因为还包含个体随机误差。'],
    band: ['置信带与预测带', '置信带描述回归线本身的不确定性；预测带描述单个新观测值的可能范围，因此更宽。'],
    residual: ['残差', '观测值 Y 与拟合值 ŷ 的差（e = Y − ŷ）。理想情况下残差应在 0 附近随机分布，没有明显规律。'],
    leverage: ['杠杆值', '衡量某个 X 值距离样本均值有多远。杠杆值越高，该点对拟合直线的影响越大。'],
    cooks: ["Cook's D", '衡量删除某个数据点后对整体拟合结果的影响，常用于识别强影响点。一般大于 1 值得关注。'],
    anova: ['方差分析 ANOVA', '把总变异分解为回归解释的部分和残差部分，并用 F 检验判断回归模型是否显著。'],
    basic: ['基础统计量', '样本量、均值、离差平方和与乘积和等中间量，它们是计算回归系数和标准误的基础。'],
    confidence: ['置信水平', '区间覆盖真实参数的长期比例，例如 95% 表示在重复抽样中有约 95% 的区间会覆盖真值。']
  };

  const EXAMPLES = {
    linear: 'x,y\n1,2.3\n2,4.1\n3,5.6\n4,8.2\n5,9.8\n6,12.1\n7,13.9\n8,16.2\n9,17.8\n10,20.1',
    strong: 'x,y\n1,1.1\n2,2.9\n3,4.8\n4,6.2\n5,8.1\n6,9.7\n7,11.6\n8,13.2\n9,15.1\n10,16.8\n11,18.6\n12,20.4',
    negative: 'x,y\n1,19.6\n2,17.9\n3,16.1\n4,14.4\n5,12.2\n6,10.8\n7,8.9\n8,7.1\n9,5.4\n10,3.6',
    small: 'x,y\n2,4.2\n4,7.8\n6,10.9\n8,15.1\n10,18.2\n12,21.6'
  };

  /* ---------------- 通用工具 ---------------- */

  function fmt(value, digits) {
    if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) return '—';
    if (typeof value === 'number' && !isFinite(value)) return value > 0 ? '∞' : '−∞';
    const p = digits === undefined ? $('precision').value : digits;
    if (p === 'auto') {
      const a = Math.abs(value);
      if (a === 0) return '0';
      if (a >= 1e7 || a < 1e-5) return value.toExponential(4).replace('e+', 'e');
      return String(Number(value.toPrecision(6)));
    }
    return Number(value).toFixed(Number(p));
  }

  function fmtP(p) {
    if (p === null || p === undefined || Number.isNaN(p)) return '—';
    if (p === 0) return '< 0.0001';
    if (p < 0.0001) return p.toExponential(2).replace('e+', 'e');
    return fmt(p);
  }

  function fmtTick(v) {
    const a = Math.abs(v);
    if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(1);
    return String(Number(v.toFixed(4)));
  }

  function helpBtn(key) {
    return '<button type="button" class="term-help" data-help="' + key + '" aria-label="查看说明">?</button>';
  }

  function isDarkMode() {
    const mode = document.documentElement.dataset.theme || 'system';
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function chartPalette() {
    return isDarkMode() ? {
      bg: '#152136', grid: '#2a3b56', axis: '#64748b', label: '#9aabc2',
      legendFill: '#1c2b43', legendStroke: '#405576', legendText: '#cbd5e1',
      line: '#60a5fa', point: '#38bdf8', outlier: '#f87171',
      ciFill: 'rgba(96,165,250,0.18)', ciStroke: 'rgba(96,165,250,0.5)',
      piFill: 'rgba(251,191,36,0.14)', piStroke: '#fbbf24'
    } : {
      bg: '#ffffff', grid: '#e8eef7', axis: '#94a3b8', label: '#64748b',
      legendFill: '#ffffff', legendStroke: '#e3e9f2', legendText: '#475569',
      line: '#2563eb', point: '#3b82f6', outlier: '#dc2626',
      ciFill: 'rgba(37,99,235,0.15)', ciStroke: 'rgba(37,99,235,0.45)',
      piFill: 'rgba(245,158,11,0.13)', piStroke: '#fbbf24'
    };
  }

  function showStatus(message, type) {
    const el = $('inputStatus');
    if (!message) { el.hidden = true; return; }
    el.textContent = message;
    el.className = 'status ' + (type || 'error');
    el.hidden = false;
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function debounce(fn, wait) {
    return function () {
      const args = arguments;
      clearTimeout(calcTimer);
      calcTimer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板'); }, fallback);
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板'); }
      catch (e) { toast('复制失败，请手动选择文本'); }
      document.body.removeChild(ta);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function readOptions() {
    return {
      decimalFormat: $('decimalFormat').value,
      delimiter: $('delimiter').value,
      confidence: Number($('confidence').value) / 100,
      precision: $('precision').value
    };
  }

  function setTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach(function (btn) {
      const on = btn.getAttribute('data-tab') === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('pairsPane').hidden = name !== 'pairs';
    $('listsPane').hidden = name !== 'lists';
    $('cellsPane').hidden = name !== 'cells';
  }

  function addCellRow(xValue, yValue) {
    const container = $('cellRows');
    const index = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'cell-row';
    row.innerHTML = '<span class="row-index">' + index + '</span>' +
      '<input type="text" class="cell-x" inputmode="decimal" placeholder="x">' +
      '<input type="text" class="cell-y" inputmode="decimal" placeholder="y">';
    row.querySelector('.cell-x').value = xValue || '';
    row.querySelector('.cell-y').value = yValue || '';
    container.appendChild(row);
    return row;
  }

  function resetCellRows(values) {
    $('cellRows').innerHTML = '';
    const list = values && values.length ? values : [];
    for (let i = 0; i < Math.max(CELL_INITIAL_ROWS, list.length); i++) {
      addCellRow(list[i] ? list[i][0] : '', list[i] ? list[i][1] : '');
    }
  }

  function collectCellText() {
    return Array.prototype.map.call($('cellRows').children, function (row) {
      return [row.querySelector('.cell-x').value.trim(), row.querySelector('.cell-y').value.trim()];
    }).filter(function (pair) { return pair[0] !== '' || pair[1] !== ''; })
      .map(function (pair) { return pair[0] + '\t' + pair[1]; }).join('\n');
  }

  function currentPoints(options) {
    if (activeTab === 'lists') return S.parseLists($('xInput').value, $('yInput').value, options);
    if (activeTab === 'cells') {
      const text = collectCellText();
      const cellOptions = Object.assign({}, options, { delimiter: 'tab' });
      if (options.decimalFormat === 'auto' && text.indexOf(',') >= 0) cellOptions.decimalFormat = 'comma';
      return S.parseData(text, cellOptions);
    }
    return S.parseData($('dataInput').value, options);
  }

  /* ---------------- 主流程 ---------------- */

  function calculate(silent) {
    const options = readOptions();
    let parsed;
    try {
      parsed = currentPoints(options);
      if (parsed.length < 2) throw new Error('至少需要 2 组有效数据');
      model = S.linearRegression(parsed, options);
      points = parsed;
    } catch (err) {
      showStatus(err.message || '数据解析失败', 'error');
      return;
    }

    renderAll();
    $('emptyState').hidden = true;
    $('resultContent').hidden = false;
    if (!silent) showStatus('计算完成：共 ' + model.n + ' 组数据', 'success');
  }

  const calculateDelayed = debounce(function () { calculate(true); }, 550);

  function renderAll() {
    renderHero();
    renderMetrics();
    renderBasicTable();
    renderCoefTable();
    renderAnovaTable();
    renderSteps();
    renderDataTable();
    renderCharts();
    $('predictResult').hidden = true;
    $('predictX').value = '';
  }

  /* ---------------- 结果渲染 ---------------- */

  function renderHero() {
    const sign = model.slope < 0 ? '−' : '+';
    $('equationText').textContent = 'ŷ = ' + fmt(model.intercept) + ' ' + sign + ' ' + fmt(Math.abs(model.slope)) + 'x';
    $('equationNote').textContent =
      '普通最小二乘法 (OLS) · ' + model.n + ' 组数据 · 区间置信水平 ' + Math.round(model.confidence * 100) + '%' +
      (model.hasInference ? '' : ' · 样本量不足，未计算显著性检验');
    $('heroR2').textContent = fmt(model.r2);
    $('heroR').textContent = fmt(model.r);
    $('heroN').textContent = String(model.n);
    $('confidenceLabel').textContent = '区间置信水平 ' + Math.round(model.confidence * 100) + '%';
    $('resultFootnote').textContent = model.warnings.length
      ? '提示：' + model.warnings.join(' ')
      : '说明：p 值为双尾检验；置信区间针对均值响应，预测区间针对单个新观测值。过远的 X 外推需谨慎。';
  }

  function renderMetrics() {
    const m = model;
    const metrics = [
      { label: '斜率' + helpBtn('slope'), sym: 'b₁', value: fmt(m.slope), hint: 'X 每增加 1，Y 的平均变化', accent: true },
      { label: '截距' + helpBtn('intercept'), sym: 'b₀', value: fmt(m.intercept), hint: 'X = 0 时 Y 的拟合值', accent: true },
      { label: '相关系数' + helpBtn('r'), sym: 'r', value: fmt(m.r), hint: '方向：正 / 负相关' },
      { label: '决定系数' + helpBtn('r2'), sym: 'R²', value: fmt(m.r2), hint: 'X 解释的 Y 变异比例' },
      { label: '调整 R²' + helpBtn('adjR2'), sym: 'adj R²', value: fmt(m.adjR2), hint: '考虑样本量后的修正' },
      { label: '估计标准误' + helpBtn('se'), sym: 's', value: fmt(m.se), hint: '观测值偏离回归线的平均尺度' },
      { label: '斜率标准误' + helpBtn('seSlope'), sym: 'SE(b₁)', value: fmt(m.seSlope), hint: '斜率估计的不确定性' },
      { label: '截距标准误' + helpBtn('se'), sym: 'SE(b₀)', value: fmt(m.seIntercept), hint: '截距估计的不确定性' },
      { label: '斜率 t 值' + helpBtn('df'), sym: 't', value: fmt(m.tSlope), hint: '自由度 df = ' + m.df },
      { label: '斜率 p 值' + helpBtn('p'), sym: 'p', value: fmtP(m.pSlope), hint: m.hasInference ? (m.pSlope < 0.05 ? '在 5% 水平显著' : '未达 5% 显著性') : '样本量不足' },
      { label: 'F 统计量' + helpBtn('f'), sym: 'F(1,' + m.df + ')', value: fmt(m.F), hint: '整体回归显著性' },
      { label: 'Durbin–Watson' + helpBtn('dw'), sym: 'DW', value: fmt(m.durbinWatson), hint: '残差一阶自相关检验' }
    ];
    $('metricGrid').innerHTML = metrics.map(function (item) {
      return '<div class="metric' + (item.accent ? ' accent' : '') + '">' +
        '<div class="metric-label"><span>' + item.label + '</span><em>' + item.sym + '</em></div>' +
        '<div class="metric-value">' + item.value + '</div>' +
        '<div class="metric-hint">' + item.hint + '</div></div>';
    }).join('');
  }

  function renderBasicTable() {
    const m = model;
    const pairs = [
      ['样本量 n', fmt(m.n)], ['自由度 df', fmt(m.df)],
      ['Σx', fmt(m.sumX)], ['Σy', fmt(m.sumY)],
      ['Σx²', fmt(m.sumX2)], ['Σy²', fmt(m.sumY2)],
      ['Σxy', fmt(m.sumXY)], ['x̄（x 均值）', fmt(m.meanX)],
      ['ȳ（y 均值）', fmt(m.meanY)], ['Sxx = Σ(x−x̄)²', fmt(m.sxx)],
      ['Syy = Σ(y−ȳ)²', fmt(m.syy)], ['Sxy = Σ(x−x̄)(y−ȳ)', fmt(m.sxy)]
    ];
    let html = '';
    for (let i = 0; i < pairs.length; i += 2) {
      html += '<tr><td>' + pairs[i][0] + '</td><td><strong>' + pairs[i][1] + '</strong></td>';
      if (pairs[i + 1]) html += '<td>' + pairs[i + 1][0] + '</td><td><strong>' + pairs[i + 1][1] + '</strong></td>';
      else html += '<td></td><td></td>';
      html += '</tr>';
    }
    $('basicTable').innerHTML = '<tbody>' + html + '</tbody>';
  }

  function renderCoefTable() {
    const m = model;
    let html = '<thead><tr><th>参数</th><th>估计值</th><th>标准误</th><th>t 值</th><th>p 值</th><th>CI 下限</th><th>CI 上限</th></tr></thead><tbody>';
    if (!m.hasInference) {
      html += '<tr><td colspan="7" style="text-align:center;color:#94a3b8">样本量不足（n ≥ 3 才能计算标准误与检验）</td></tr>';
    } else {
      const rows = [
        ['截距 b₀', m.intercept, m.seIntercept, m.tIntercept, m.pIntercept, m.ciIntercept],
        ['斜率 b₁', m.slope, m.seSlope, m.tSlope, m.pSlope, m.ciSlope]
      ];
      rows.forEach(function (r) {
        html += '<tr><td>' + r[0] + '</td><td><strong>' + fmt(r[1]) + '</strong></td><td>' + fmt(r[2]) +
          '</td><td>' + fmt(r[3]) + '</td><td>' + fmtP(r[4]) + '</td><td>' + fmt(r[5][0]) + '</td><td>' + fmt(r[5][1]) + '</td></tr>';
      });
    }
    $('coefTable').innerHTML = html + '</tbody>';
  }

  function renderAnovaTable() {
    const m = model;
    let html = '<thead><tr><th>变异来源</th><th>平方和 SS</th><th>自由度 df</th><th>均方 MS</th><th>F</th><th>p 值</th></tr></thead><tbody>';
    html += '<tr><td>回归</td><td>' + fmt(m.ssr) + '</td><td>1</td><td>' + fmt(m.ssr) + '</td><td>' + fmt(m.F) + '</td><td>' + fmtP(m.pF) + '</td></tr>';
    html += '<tr><td>残差</td><td>' + fmt(m.sse) + '</td><td>' + m.df + '</td><td>' + fmt(m.mse) + '</td><td>—</td><td>—</td></tr>';
    html += '<tr><td>总计</td><td>' + fmt(m.sst) + '</td><td>' + (m.n - 1) + '</td><td>—</td><td>—</td><td>—</td></tr>';
    $('anovaTable').innerHTML = html + '</tbody>';
  }

  function step(title, code) {
    return '<div class="step"><span class="step-title">' + title + '</span><code>' + code + '</code></div>';
  }

  function renderSteps() {
    const m = model;
    const steps = [
      step('1. 计算均值', 'x̄ = Σx / n = ' + fmt(m.sumX) + ' / ' + m.n + ' = ' + fmt(m.meanX) +
        '\nȳ = Σy / n = ' + fmt(m.sumY) + ' / ' + m.n + ' = ' + fmt(m.meanY)),
      step('2. 中心化平方和与乘积和', 'Sxx = Σ(x−x̄)² = ' + fmt(m.sxx) +
        '\nSyy = Σ(y−ȳ)² = ' + fmt(m.syy) + '\nSxy = Σ(x−x̄)(y−ȳ) = ' + fmt(m.sxy)),
      step('3. 最小二乘斜率', 'b₁ = Sxy / Sxx = ' + fmt(m.sxy) + ' / ' + fmt(m.sxx) + ' = ' + fmt(m.slope)),
      step('4. 截距', 'b₀ = ȳ − b₁·x̄ = ' + fmt(m.meanY) + ' − ' + fmt(m.slope) + ' × ' + fmt(m.meanX) + ' = ' + fmt(m.intercept)),
      step('5. 相关性与决定系数', 'r = Sxy / √(Sxx·Syy) = ' + fmt(m.r) + '\nR² = r² = ' + fmt(m.r2) +
        '；调整 R² = ' + fmt(m.adjR2)),
      step('6. 残差与标准误', 'SSE = Σ(y−ŷ)² = ' + fmt(m.sse) +
        '\n残差自由度 df = n−2 = ' + m.df + '\ns = √(SSE/df) = ' + fmt(m.se)),
      step('7. 显著性检验', 'SE(b₁) = s / √Sxx = ' + fmt(m.seSlope) +
        '\nt = b₁ / SE(b₁) = ' + fmt(m.tSlope) + '（df = ' + m.df + '）' +
        '\np 值（双尾）= ' + fmtP(m.pSlope) +
        '\n临界 t = ' + fmt(m.criticalT) + '，斜率 ' + Math.round(m.confidence * 100) + '% CI = [' + fmt(m.ciSlope && m.ciSlope[0]) + ', ' + fmt(m.ciSlope && m.ciSlope[1]) + ']'),
      step('8. 方差分析', 'SSR = SST − SSE = ' + fmt(m.ssr) + ' − ' + fmt(m.sse) + ' = ' + fmt(m.ssr) +
        '\nF = MSR / MSE = ' + fmt(m.F) + '，p = ' + fmtP(m.pF))
    ];
    $('stepsContent').innerHTML = steps.join('');
  }

  function renderDataTable() {
    let html = '<thead><tr><th>序号</th><th>x</th><th>y</th><th>拟合值 ŷ</th><th>残差 e</th><th>标准化残差</th><th>杠杆 hᵢ</th><th>Cook’s D</th></tr></thead><tbody>';
    model.rows.forEach(function (r) {
      html += '<tr><td>' + r.index + '</td><td>' + fmt(r.x) + '</td><td>' + fmt(r.y) + '</td><td>' + fmt(r.fitted) +
        '</td><td>' + fmt(r.residual) + '</td><td>' + fmt(r.stdResidual) + '</td><td>' + fmt(r.leverage) +
        '</td><td>' + fmt(r.cooksD) + '</td></tr>';
    });
    $('dataTable').innerHTML = html + '</tbody>';
  }

  /* ---------------- 图表 ---------------- */

  function niceNumber(range, round) {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let nice;
    if (round) {
      nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
    } else {
      nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    }
    return nice * Math.pow(10, exponent);
  }

  function niceTicks(min, max, target) {
    if (!(max > min)) { max = min + 1; }
    const range = niceNumber(max - min, false);
    const step = niceNumber(range / (target - 1), true);
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const arr = [];
    for (let v = start; v <= end + step * 1e-9; v += step) arr.push(Number(v.toFixed(10)));
    return { min: start, max: end, ticks: arr };
  }

  const FONT = "font-family='Arial, Microsoft YaHei, sans-serif'";

  function axisGrid(xd, yd, L, T, pw, ph, sx, sy, xLabel, yLabel, p) {
    let s = '';
    xd.ticks.forEach(function (v) {
      const x = sx(v).toFixed(2);
      s += '<line x1="' + x + '" y1="' + T + '" x2="' + x + '" y2="' + (T + ph) + '" stroke="' + p.grid + '" stroke-width="1"/>';
      s += '<text x="' + x + '" y="' + (T + ph + 19) + '" text-anchor="middle" font-size="11" fill="' + p.axis + '" ' + FONT + '>' + fmtTick(v) + '</text>';
    });
    yd.ticks.forEach(function (v) {
      const y = sy(v).toFixed(2);
      s += '<line x1="' + L + '" y1="' + y + '" x2="' + (L + pw) + '" y2="' + y + '" stroke="' + p.grid + '" stroke-width="1"/>';
      s += '<text x="' + (L - 9) + '" y="' + (Number(y) + 4) + '" text-anchor="end" font-size="11" fill="' + p.axis + '" ' + FONT + '>' + fmtTick(v) + '</text>';
    });
    s += '<line x1="' + L + '" y1="' + (T + ph) + '" x2="' + (L + pw) + '" y2="' + (T + ph) + '" stroke="' + p.axis + '" stroke-width="1.2"/>';
    s += '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (T + ph) + '" stroke="' + p.axis + '" stroke-width="1.2"/>';
    s += '<text x="' + (L + pw) + '" y="' + (T + ph + 40) + '" text-anchor="end" font-size="12" fill="' + p.label + '" ' + FONT + '>' + xLabel + '</text>';
    s += '<text x="' + (L - 4) + '" y="' + (T - 8) + '" text-anchor="start" font-size="12" fill="' + p.label + '" ' + FONT + '>' + yLabel + '</text>';
    return s;
  }

  function legendBox(items, x, y, p) {
    let s = '<rect x="' + (x - 8) + '" y="' + (y - 14) + '" width="' + (items.length * 84 + 12) + '" height="26" rx="6" fill="' + p.legendFill + '" opacity="0.94" stroke="' + p.legendStroke + '"/>';
    items.forEach(function (item, i) {
      const ix = x + i * 84;
      if (item.type === 'circle') s += '<circle cx="' + (ix + 5) + '" cy="' + y + '" r="4.5" fill="' + item.color + '" stroke="' + p.legendFill + '" stroke-width="1.2"/>';
      else if (item.type === 'line') s += '<line x1="' + ix + '" y1="' + y + '" x2="' + (ix + 12) + '" y2="' + y + '" stroke="' + item.color + '" stroke-width="2.6"/>';
      else s += '<rect x="' + ix + '" y="' + (y - 5) + '" width="12" height="10" rx="2" fill="' + item.color + '"/>';
      s += '<text x="' + (ix + 17) + '" y="' + (y + 4) + '" font-size="11" fill="' + p.legendText + '" ' + FONT + '>' + item.text + '</text>';
    });
    return s;
  }

  function scatterSvg(m) {
    const p = chartPalette();
    const W = 720, H = 420, L = 62, R = 22, T = 28, B = 56;
    const pw = W - L - R, ph = H - T - B;
    const showCi = $('showConfidence').checked && m.hasInference;
    const showPi = $('showPrediction').checked && m.hasInference;

    const yValues = m.rows.map(function (r) { return r.y; });
    yValues.push(m.intercept + m.slope * m.xMin, m.intercept + m.slope * m.xMax);
    if (showCi || showPi) {
      for (let i = 0; i <= 60; i++) {
        const x = m.xMin + (m.xMax - m.xMin) * i / 60;
        const pr = S.predict(m, x);
        if (showCi && pr.ci) yValues.push(pr.ci[0], pr.ci[1]);
        if (showPi && pr.pi) yValues.push(pr.pi[0], pr.pi[1]);
      }
    }
    const xPad = (m.xMax - m.xMin) * 0.08 || 1;
    const yPad = (Math.max.apply(null, yValues) - Math.min.apply(null, yValues)) * 0.08 || 1;
    const xd = niceTicks(m.xMin - xPad, m.xMax + xPad, 7);
    const yd = niceTicks(Math.min.apply(null, yValues) - yPad, Math.max.apply(null, yValues) + yPad, 7);
    const sx = function (x) { return L + (x - xd.min) / (xd.max - xd.min) * pw; };
    const sy = function (y) { return T + ph - (y - yd.min) / (yd.max - yd.min) * ph; };

    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" role="img" aria-label="散点图与回归线">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + p.bg + '"/>';
    s += axisGrid(xd, yd, L, T, pw, ph, sx, sy, 'X', 'Y', p);

    function bandPath(kind) {
      const upper = [], lower = [];
      for (let i = 0; i <= 80; i++) {
        const x = m.xMin + (m.xMax - m.xMin) * i / 80;
        const pr = S.predict(m, x);
        const pair = kind === 'ci' ? pr.ci : pr.pi;
        if (!pair) return '';
        upper.push(sx(x).toFixed(2) + ',' + sy(pair[1]).toFixed(2));
        lower.unshift(sx(x).toFixed(2) + ',' + sy(pair[0]).toFixed(2));
      }
      return 'M' + upper.join(' L') + ' L' + lower.join(' L') + ' Z';
    }
    if (showPi) s += '<path d="' + bandPath('pi') + '" fill="' + p.piFill + '" stroke="' + p.piStroke + '" stroke-width="1" stroke-dasharray="4 3"/>';
    if (showCi) s += '<path d="' + bandPath('ci') + '" fill="' + p.ciFill + '" stroke="' + p.ciStroke + '" stroke-width="1"/>';

    s += '<line x1="' + sx(m.xMin).toFixed(2) + '" y1="' + sy(m.intercept + m.slope * m.xMin).toFixed(2) +
      '" x2="' + sx(m.xMax).toFixed(2) + '" y2="' + sy(m.intercept + m.slope * m.xMax).toFixed(2) +
      '" stroke="' + p.line + '" stroke-width="2.8" stroke-linecap="round"/>';

    m.rows.forEach(function (r) {
      s += '<circle cx="' + sx(r.x).toFixed(2) + '" cy="' + sy(r.y).toFixed(2) + '" r="4.6" fill="' + p.point + '" stroke="' + p.bg + '" stroke-width="1.4"><title>x=' + fmt(r.x) + ', y=' + fmt(r.y) + ', 残差=' + fmt(r.residual) + '</title></circle>';
    });

    const legend = [{ type: 'circle', color: p.point, text: '数据点' }, { type: 'line', color: p.line, text: '回归线' }];
    if (showCi) legend.push({ type: 'rect', color: p.ciFill, text: '置信带' });
    if (showPi) legend.push({ type: 'rect', color: p.piFill, text: '预测带' });
    s += legendBox(legend, L + 12, T + 18, p);
    s += '</svg>';
    return s;
  }

  function residualSvg(m) {
    const p = chartPalette();
    const W = 720, H = 420, L = 62, R = 22, T = 28, B = 56;
    const pw = W - L - R, ph = H - T - B;
    const res = m.rows.map(function (r) { return r.residual; });
    const xPad = (m.xMax - m.xMin) * 0.08 || 1;
    let yMin = Math.min.apply(null, res), yMax = Math.max.apply(null, res);
    const yPad = Math.max((yMax - yMin) * 0.15, Math.abs(yMax) * 0.08, 0.5);
    const xd = niceTicks(m.xMin - xPad, m.xMax + xPad, 7);
    const yd = niceTicks(yMin - yPad, yMax + yPad, 7);
    const sx = function (x) { return L + (x - xd.min) / (xd.max - xd.min) * pw; };
    const sy = function (y) { return T + ph - (y - yd.min) / (yd.max - yd.min) * ph; };

    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" role="img" aria-label="残差图">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + p.bg + '"/>';
    s += axisGrid(xd, yd, L, T, pw, ph, sx, sy, 'X', '残差 e', p);
    if (yd.min < 0 && yd.max > 0) {
      s += '<line x1="' + L + '" y1="' + sy(0).toFixed(2) + '" x2="' + (L + pw) + '" y2="' + sy(0).toFixed(2) +
        '" stroke="' + p.axis + '" stroke-width="1.4" stroke-dasharray="6 4"/>';
    }
    m.rows.forEach(function (r) {
      const outlier = Math.abs(r.stdResidual) > 2;
      s += '<circle cx="' + sx(r.x).toFixed(2) + '" cy="' + sy(r.residual).toFixed(2) + '" r="4.4" fill="' +
        (outlier ? p.outlier : p.point) + '" stroke="' + p.bg + '" stroke-width="1.3"><title>x=' + fmt(r.x) +
        ', 残差=' + fmt(r.residual) + ', 标准化残差=' + fmt(r.stdResidual) + '</title></circle>';
    });
    s += legendBox([{ type: 'circle', color: p.point, text: '残差' }, { type: 'circle', color: p.outlier, text: '|标准化残差| > 2' }], L + 12, T + 18, p);
    s += '</svg>';
    return s;
  }

  function renderCharts() {
    if (!model) return;
    chartSvgs.scatter = scatterSvg(model);
    chartSvgs.residual = residualSvg(model);
    $('scatterChart').innerHTML = chartSvgs.scatter;
    $('residualChart').innerHTML = chartSvgs.residual;
    const parts = ['回归线 ŷ = ' + fmt(model.intercept) + (model.slope < 0 ? ' − ' : ' + ') + fmt(Math.abs(model.slope)) + 'x'];
    if ($('showConfidence').checked && model.hasInference) parts.push(Math.round(model.confidence * 100) + '% 置信带');
    if ($('showPrediction').checked && model.hasInference) parts.push(Math.round(model.confidence * 100) + '% 预测带');
    $('scatterLegend').textContent = parts.join(' · ');
  }

  function exportChart(kind, format) {
    const svgText = chartSvgs[kind];
    if (!svgText) { toast('请先计算'); return; }
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '1440');
    svg.setAttribute('height', '840');
    const serialized = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + serialized], { type: 'image/svg+xml;charset=utf-8' });
    const name = 'linear-regression-' + kind;
    if (format === 'svg') { downloadBlob(svgBlob, name + '.svg'); return; }
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = 1440; canvas.height = 840;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = chartPalette().bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        if (blob) downloadBlob(blob, name + '.png'); else toast('PNG 导出失败');
      }, 'image/png');
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('图表导出失败'); };
    img.src = url;
  }

  /* ---------------- 导出数据 ---------------- */

  function csvCell(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    if (!model) { toast('请先计算'); return; }
    const head = ['序号', 'x', 'y', '拟合值', '残差', '标准化残差', '杠杆值', "Cook's D"];
    const lines = [head.join(',')];
    model.rows.forEach(function (r) {
      lines.push([r.index, r.x, r.y, r.fitted, r.residual, r.stdResidual, r.leverage, r.cooksD]
        .map(function (v) { return csvCell(Number.isFinite(v) ? Number(v.toPrecision(12)) : ''); }).join(','));
    });
    downloadBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'linear-regression-data.csv');
    toast('数据 CSV 已导出');
  }

  function exportJson() {
    if (!model) { toast('请先计算'); return; }
    const payload = {
      title: '一元线性回归结果',
      generatedAt: new Date().toISOString(),
      equation: 'y = ' + model.intercept + ' + ' + model.slope + ' * x',
      confidenceLevel: model.confidence,
      summary: {
        n: model.n, df: model.df, slope: model.slope, intercept: model.intercept,
        r: model.r, r2: model.r2, adjustedR2: model.adjR2,
        sst: model.sst, ssr: model.ssr, sse: model.sse, mse: model.mse, standardError: model.se,
        seSlope: model.seSlope, seIntercept: model.seIntercept,
        tSlope: model.tSlope, pSlope: model.pSlope,
        tIntercept: model.tIntercept, pIntercept: model.pIntercept,
        F: model.F, pF: model.pF, criticalT: model.criticalT,
        ciSlope: model.ciSlope, ciIntercept: model.ciIntercept,
        durbinWatson: model.durbinWatson
      },
      data: model.rows
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), 'linear-regression-result.json');
    toast('结果 JSON 已导出');
  }

  function shareUrl() {
    const payload = {
      d: points.map(function (p) { return [p.x, p.y]; }),
      o: {
        decimalFormat: $('decimalFormat').value, delimiter: $('delimiter').value,
        precision: $('precision').value, confidence: $('confidence').value,
        ci: $('showConfidence').checked, pi: $('showPrediction').checked
      }
    };
    return location.href.split('#')[0] + '#data=' + encodeURIComponent(JSON.stringify(payload));
  }

  function loadFromHash() {
    const match = location.hash.match(/data=([^&]+)/);
    if (!match) return false;
    try {
      const payload = JSON.parse(decodeURIComponent(match[1]));
      if (!Array.isArray(payload.d)) return false;
      $('dataInput').value = payload.d.map(function (p) { return p[0] + ',' + p[1]; }).join('\n');
      const o = payload.o || {};
      if (o.decimalFormat) $('decimalFormat').value = o.decimalFormat;
      if (o.delimiter) $('delimiter').value = o.delimiter;
      if (o.precision) $('precision').value = o.precision;
      if (o.confidence) $('confidence').value = o.confidence;
      $('showConfidence').checked = !!o.ci;
      $('showPrediction').checked = !!o.pi;
      setTab('pairs');
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 概念提示、主题与页脚 ---------------- */

  let activeHelpButton = null;
  let introReturnFocus = null;

  function openIntro() {
    introReturnFocus = document.activeElement;
    $('introModal').hidden = false;
    document.body.style.overflow = 'hidden';
    const close = $('introModal').querySelector('.modal-close');
    if (close) close.focus();
  }

  function closeIntro() {
    if ($('introModal').hidden) return;
    $('introModal').hidden = true;
    document.body.style.overflow = '';
    if (introReturnFocus && introReturnFocus.focus) introReturnFocus.focus();
  }

  function closeHelp() {
    $('termPopover').hidden = true;
    if (activeHelpButton) activeHelpButton.classList.remove('open');
    activeHelpButton = null;
  }

  function openHelp(button, key) {
    const info = HELP[key];
    if (!info) return;
    if (activeHelpButton === button) { closeHelp(); return; }
    closeHelp();
    activeHelpButton = button;
    button.classList.add('open');
    $('termPopoverTitle').textContent = info[0];
    $('termPopoverText').textContent = info[1];
    const popover = $('termPopover');
    popover.hidden = false;
    const rect = button.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 12) top = rect.top - height - 8;
    popover.style.left = left + 'px';
    popover.style.top = Math.max(12, top) + 'px';
  }

  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem('lr-theme', mode); } catch (e) { /* 忽略存储限制 */ }
    document.querySelectorAll('.theme-switch button').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === mode);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDarkMode() ? '#0b1220' : '#2563eb');
    if (model) renderCharts();
  }

  function initTheme() {
    let saved = 'system';
    try { saved = localStorage.getItem('lr-theme') || 'system'; } catch (e) { /* 忽略 */ }
    if (['light', 'dark', 'system'].indexOf(saved) < 0) saved = 'system';
    applyTheme(saved);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function () {
      if ((document.documentElement.dataset.theme || 'system') === 'system') {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', mq.matches ? '#0b1220' : '#2563eb');
        if (model) renderCharts();
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function initUptime() {
    const el = $('site_uptime');
    if (!el) return;
    const startedAt = new Date(2026, 10, 20, 18, 15, 0);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    function render() {
      const elapsed = Math.max(0, Date.now() - startedAt.getTime());
      const days = Math.floor(elapsed / 86400000);
      const hours = Math.floor(elapsed / 3600000) % 24;
      const minutes = Math.floor(elapsed / 60000) % 60;
      const seconds = Math.floor(elapsed / 1000) % 60;
      el.textContent = days + '天 ' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
    }
    render();
    setInterval(render, 1000);
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () { setTab(btn.getAttribute('data-tab')); closeHelp(); });
    });

    document.querySelectorAll('.theme-switch button').forEach(function (btn) {
      btn.addEventListener('click', function () { applyTheme(btn.getAttribute('data-theme')); });
    });

    document.addEventListener('click', function (e) {
      const target = e.target.closest ? e.target.closest('[data-help]') : null;
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        openHelp(target, target.getAttribute('data-help'));
      } else if (!e.target.closest || !e.target.closest('#termPopover')) {
        closeHelp();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeHelp(); closeIntro(); }
    });
    window.addEventListener('resize', closeHelp);

    $('introToggle').addEventListener('click', function (e) {
      e.stopPropagation();
      openIntro();
    });
    $('introModal').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-close-intro]')) closeIntro();
    });

    $('addRowBtn').addEventListener('click', function () {
      addCellRow('', '');
      $('removeRowBtn').disabled = false;
    });
    $('removeRowBtn').addEventListener('click', function () {
      if ($('cellRows').children.length <= 2) return;
      $('cellRows').removeChild($('cellRows').lastElementChild);
    });
    $('cellRows').addEventListener('input', calculateDelayed);

    $('calcBtn').addEventListener('click', function () { calculate(false); });
    $('resetBtn').addEventListener('click', function () {
      $('dataInput').value = ''; $('xInput').value = ''; $('yInput').value = '';
      resetCellRows();
      $('csvFile').value = ''; $('fileName').textContent = '未选择文件';
      $('predictX').value = ''; $('predictResult').hidden = true;
      model = null; points = []; chartSvgs = { scatter: '', residual: '' };
      $('resultContent').hidden = true; $('emptyState').hidden = false;
      showStatus('');
    });
    $('loadExampleBtn').addEventListener('click', function () {
      $('dataInput').value = EXAMPLES[$('exampleSelect').value];
      $('csvFile').value = ''; $('fileName').textContent = '未选择文件';
      setTab('pairs');
      calculate(false);
    });
    $('clearBtn').addEventListener('click', function () {
      if (activeTab === 'pairs') $('dataInput').value = '';
      else if (activeTab === 'cells') resetCellRows();
      else { $('xInput').value = ''; $('yInput').value = ''; }
      showStatus('');
    });

    $('uploadBtn').addEventListener('click', function () { $('csvFile').click(); });
    $('csvFile').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        $('dataInput').value = String(reader.result || '');
        $('fileName').textContent = file.name;
        setTab('pairs');
        calculate(false);
      };
      reader.onerror = function () { showStatus('文件读取失败', 'error'); };
      reader.readAsText(file, 'UTF-8');
    });

    ['dataInput', 'xInput', 'yInput'].forEach(function (id) {
      $(id).addEventListener('input', calculateDelayed);
    });
    ['precision', 'confidence', 'decimalFormat', 'delimiter'].forEach(function (id) {
      $(id).addEventListener('change', function () { calculate(true); });
    });
    ['showConfidence', 'showPrediction'].forEach(function (id) {
      $(id).addEventListener('change', renderCharts);
    });

    function runPrediction() {
      if (!model) { toast('请先完成计算'); return; }
      const raw = $('predictX').value.trim();
      if (!raw) { toast('请输入 X 值'); return; }
      const x0 = Number(raw.replace(/，/g, '.'));
      if (!isFinite(x0)) { toast('X 值无效'); return; }
      const pr = S.predict(model, x0);
      const box = $('predictResult');
      box.innerHTML =
        '<div class="predict-item"><span>x = ' + fmt(pr.x) + ' 时的预测值 ŷ</span><strong>' + fmt(pr.fitted) + '</strong></div>' +
        '<div class="predict-item"><span>' + Math.round(model.confidence * 100) + '% 均值置信区间 CI' + helpBtn('ci') + '</span><strong>' +
        (pr.ci ? '[' + fmt(pr.ci[0]) + ', ' + fmt(pr.ci[1]) + ']' : '—') + '</strong></div>' +
        '<div class="predict-item"><span>' + Math.round(model.confidence * 100) + '% 单点预测区间 PI' + helpBtn('pi') + '</span><strong>' +
        (pr.pi ? '[' + fmt(pr.pi[0]) + ', ' + fmt(pr.pi[1]) + ']' : '—') + '</strong></div>' +
        (pr.outside || !model.hasInference ? '<p class="predict-note">' +
          (pr.outside ? '该 X 值超出样本范围 [' + fmt(model.xMin) + ', ' + fmt(model.xMax) + ']，属于外推，请谨慎解读。' : '样本量不足，无法计算区间。') + '</p>' : '');
      box.hidden = false;
    }
    $('predictBtn').addEventListener('click', runPrediction);
    $('predictX').addEventListener('keydown', function (e) { if (e.key === 'Enter') runPrediction(); });

    $('copyEquationBtn').addEventListener('click', function () {
      if (!model) return;
      copyText('ŷ = ' + model.intercept.toPrecision(10) + ' + (' + model.slope.toPrecision(10) + ')x  (R² = ' + model.r2.toPrecision(6) + ')');
    });
    $('copyLatexBtn').addEventListener('click', function () {
      if (!model) return;
      copyText('\\hat{y} = ' + model.intercept.toPrecision(8) + ' + ' + model.slope.toPrecision(8) + 'x, \\quad R^2 = ' + model.r2.toPrecision(6));
    });
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('shareBtn').addEventListener('click', function () {
      if (!model) return;
      copyText(shareUrl());
      toast('分享链接已复制（包含当前数据）');
    });
    $('printBtn').addEventListener('click', function () { window.print(); });
    document.querySelectorAll('[data-chart]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        exportChart(btn.getAttribute('data-chart'), btn.getAttribute('data-format'));
      });
    });
  }

  /* ---------------- 启动 ---------------- */

  bindEvents();
  initTheme();
  initUptime();
  resetCellRows();
  if (!loadFromHash()) {
    $('dataInput').value = EXAMPLES.linear;
  }
  calculate(true);
})();
