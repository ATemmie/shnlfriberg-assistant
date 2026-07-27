# Shnlfriberg Helper

> shnlfriberg.online CS2 职业选手猜谜游戏的浏览器辅助助手
> **两款版本可选，满足不同需求。**

---

## 版本对比

| 特性 | v3.2 Chrome 扩展版 ✅ **推荐** | v3.1 Chrome 扩展版 | v2.9 用户脚本 + 服务器版 |
|------|-------------------------------|-------------------|------------------------|
| **模式检测** | ✅ 自动识别简单版/完整版 | ❌ | ❌ |
| **首猜优化** | ✅ 预计算 | ✅ 预计算 | ❌ 动态算熵 |
| **双胞胎检测** | ✅ 16组自动识别 | ✅ 16组自动识别 | ❌ |
| **选手数据** | 200(简单) / 645(完整) 人内嵌 | 645 人内嵌 | 从 Excel 读取 |
| **安装复杂度** | ⭐ 解压→拖入浏览器 | ⭐ 解压→拖入浏览器 | ⭐⭐⭐ 装Tampermonkey+装脚本+启动Python |
| **依赖** | 无（浏览器内置） | 无 | Python 3.11+、Flask、openpyxl |
| **稳定性** | ⭐⭐⭐ 不依赖服务器 | ⭐⭐⭐ 不依赖服务器 | ⭐⭐ 依赖Python进程存活 |
| **自动填入** | 点击推荐名→手动提交 | 点击推荐名→手动提交 | 全自动填入+提交 |

---

## 安装使用

### 方式一：Chrome 扩展版（推荐）

**无需 Tampermonkey，无需 Python，装好即用。**

1. [下载 ZIP](https://github.com/ATemmie/shnlfriberg-assistant/releases/latest/download/shnlfriberg-helper-v3.2-chrome-extension.zip)
2. 解压到任意文件夹
3. 打开浏览器扩展管理页：
   - **Edge:** `edge://extensions/`
   - **Chrome:** `chrome://extensions/`
4. 打开右上角 **"开发人员模式"**
5. 点击 **"加载解压缩的扩展"** → 选择解压后的文件夹
6. 去 [shnlfriberg.online](https://shnlfriberg.online/) 开玩 🎮

**使用方式：**
- 扩展自动读取游戏反馈
- 面板显示推荐 → **点击名字** 自动填入输入框
- 自己点游戏内的"提交猜测"按钮
- 猜中后答案卡片可点击填入

### 方式二：用户脚本 + 服务器版

**需 Tampermonkey + Python 环境。**

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. [下载 ZIP](https://github.com/ATemmie/shnlfriberg-assistant/releases/latest/download/shnlfriberg-helper-v2.9-server.zip)
3. 将 `.user.js` 拖入浏览器安装脚本
4. 双击 `一键启动.bat`（自动装依赖 + 启动服务器 + 打开游戏）

---

## 技术原理

### 反馈读取
读取游戏表格每一行的 CSS 类名：
- **correct**（绿色）= 完全匹配
- **close**（黄色）= 接近（同赛区 / 数值差 ≤ 3 岁或 1 次 Major）
- **wrong / miss**（灰色）= 不匹配
- **SVG 箭头** → 指示年龄 / Major 数值的更高/更低方向

### 过滤引擎
逐层排除不符合反馈条件的候选人：
- 队伍错 → 排除同队
- 国籍同区 → 只保留同赛区不同国
- 年龄错+箭头↑ → 排除年龄更大或差>3岁的
- 角色对 → 只保留同位置

### 推荐引擎（信息熵）
对每个剩余候选人计算**信息熵评分**——猜这个人的期望信息增益。取 Top 5 推荐给用户。

熵值越高说明越能有效缩小候选池。

---

## 技术栈

### 扩展版 (v3.2)
- **Manifest V3** — Chrome 扩展标准
- **纯 JavaScript** — 推荐引擎完全浏览器端运行
- **Chrome Storage API** — 设置持久化
- **模式检测** — URL + 页面内容自动识别简单版/完整版
- **双胞胎检测** — 自动识别属性相同选手

### 服务器版 (v2.9)
- **Tampermonkey** — 浏览器用户脚本
- **Python 3.11+ / Flask** — 后端 API 服务器
- **openpyxl** — Excel 数据库读取
- **信息熵算法** — Python 版推荐引擎

---

## 在线页面

项目展示页（GitHub Pages）：
https://atemmie.github.io/shnlfriberg-assistant/

---

## 更新日志

### v3.2 (2026-07-27)
- 🎮 自动检测简单版/完整版模式
- 🎯 简单版只从前 200 名知名选手推荐
- 📊 面板剩余候选数随模式动态显示

### v3.1 (2026-07-27)
- 🎯 首猜预计算，省去 1-2 秒熵值计算
- 🔍 双胞胎检测：16 组属性相同选手自动识别

### v3.0 (2026-07-27)
- 🚀 Chrome 扩展版发布，无需 Tampermonkey / Python
- 🧠 JS 信息熵引擎，完全浏览器端运行
- 📦 645 名选手数据内嵌

### v2.9 (2026-07-26)
- 📜 Tampermonkey 用户脚本 + Python Flask 服务器
- 🐍 信息熵推荐引擎
- ⚡ 全自动填入+提交（React 渲染时机不稳）

---

## 许可证

MIT — 开源项目，仅供学习参考。
