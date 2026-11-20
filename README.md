# 一元线性回归计算器

一个纯前端的在线一元线性回归计算工具。所有计算都在浏览器中完成，无需后端服务、无需构建步骤，可直接部署到各类静态托管平台。

## 功能特性

### 数据输入
- 三种输入方式：
  - 粘贴两列数据（`x,y`，支持逗号、分号、制表符、空格分隔，可从 Excel 直接粘贴）
  - 分别输入 X / Y 两列
  - 逐行输入：左侧填 X、右侧填 Y，可点击 `＋` 增加行、`−` 减少行
- 支持上传 CSV / TXT 文件
- 内置 4 组示例数据
- 可设置小数位数、置信水平、小数格式与分隔符

### 统计计算
- 回归方程、斜率、截距
- 相关系数 r、决定系数 R²、调整 R²
- 平方和 SST / SSR / SSE、均方 MSE、估计标准误
- 系数标准误、t 检验、双尾 p 值、F 统计量
- 回归系数置信区间、单点预测的均值置信区间 CI 与预测区间 PI
- 残差、标准化残差、杠杆值、Cook's D、Durbin–Watson
- 方差分析 ANOVA 表与逐步计算过程

### 可视化与导出
- 散点图 + 回归线 + 可配置的置信带 / 预测带
- 残差图
- 图表导出为 PNG / SVG
- 数据导出为 CSV，完整结果导出为 JSON
- 复制回归方程 / LaTeX、复制分享链接、打印或另存为 PDF

### 其他
- 三种显示模式：白天、黑夜、跟随系统（默认），用户选择会本地保存
- 统计名词后的 `?` 可点击查看概念解释
- 标题后的 `?` 可查看一元线性回归与本站介绍
- 页脚包含网站运行时间与访问统计

## 文件结构

```
.
├── index.html   # 页面结构与内容
├── styles.css   # 样式与浅色/深色主题变量
├── stats.js     # 统计计算引擎（无依赖）
├── app.js       # 交互、图表渲染与导出
└── README.md    # 本说明文件
```

## 本地使用

直接用浏览器打开 `index.html` 即可使用；也可以启动任意静态服务器：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000>。

## 部署方式

项目是纯静态文件，不需要 `npm install` 或任何构建命令。

### Cloudflare Pages（推荐）

1. 在 Cloudflare Pages 中连接本 GitHub 仓库。
2. 构建命令留空，输出目录填写 `/`。
3. 直接部署即可。

### GitHub Pages

1. 进入仓库 `Settings` → `Pages`。
2. `Build and deployment` 选择 `Deploy from a branch`。
3. 分支选择 `main`，目录选择 `/ (root)`，保存。

### Netlify / Vercel 等

- 导入仓库后，构建命令留空，发布目录填写 `.` 或 `/`。
- 无需环境变量。

### 任意静态主机

上传 `index.html`、`styles.css`、`stats.js`、`app.js` 四个文件到网站根目录即可。

## 说明

- 访问统计使用脚本 `https://stats.web.yjhup.com/js/index.min.js`。如果部署在自己的域名下且不需要该统计，可删除 `index.html` 中对应的 `<script>` 标签以及页脚的 `#page_pv`、`#page_uv` 元素。
- 支持现代浏览器（Chrome、Edge、Firefox、Safari 等）。
