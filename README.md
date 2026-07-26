# Shnlfriberg Helper v2.7

> shnlfriberg.online CS2 职业选手猜谜游戏的浏览器辅助助手

## 项目简介

自动读取 [shnlfriberg.online](https://shnlfriberg.online/) 猜选手游戏的页面反馈，
通过本地推荐引擎计算信息熵最优猜测，帮你快速缩小候选池。

**原理：** Tampermonkey 用户脚本读取游戏表格的 CSS 类名（correct/close/wrong）→
发送到本地 Flask 服务器 → 过滤引擎 + 信息熵推荐算法 → 返回最优下一猜 → 自动填入搜索框。

## 项目文件

| 文件 | 作用 |
|------|------|
| shnlfriberg-helper-v2.user.js | Tampermonkey 用户脚本（拖入浏览器安装） |
| server.py | Flask 后端服务器 |
| engine.py | 过滤引擎：根据反馈缩小候选池 |
| ecommender.py | 信息熵推荐算法 |
| database.py | 选手数据库（从 Excel 读取 645 人） |
| equirements.txt | Python 依赖 |
| 一键启动.bat | 一键启动服务器 + 安装脚本 + 打开游戏 |
| start_server.bat | 仅启动服务器 |
| igdog_b64.txt | 辅助数据文件 |

## 安装使用

### 1. 安装 Tampermonkey

- [Chrome 安装](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Edge 安装](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- [Firefox 安装](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)

安装后浏览器右上角会出现 🐵 图标。

### 2. 安装用户脚本

- **方法一：** 将 shnlfriberg-helper-v2.user.js 拖入浏览器窗口，
  Tampermonkey 会自动弹出安装页面，点击「安装」。
- **方法二：** 点击 🐵 图标 → 添加新脚本 →
  复制 .user.js 文件内容粘贴 → Ctrl+S 保存。

### 3. 启动服务器

**方法一（推荐）：** 双击 一键启动.bat，自动完成以下三步：
  1. 检查 Python 并安装依赖
  2. 在后台启动推荐服务器
  3. 打开 .user.js 安装页面 + 游戏网址

**方法二（手动）：**
`ash
pip install -r requirements.txt
python server.py
`

终端显示 Running on http://127.0.0.1:5000 即为启动成功。

### 4. 开始游戏

打开 https://shnlfriberg.online/ 开始一局游戏。
页面右下角会出现浮动推荐面板。按面板推荐的名字输入即可。

## 可配置选项

在脚本开头（第 30~36 行）可以修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| _shnl_autoFill | 	rue | 自动将推荐名填入搜索框 |
| _shnl_autoSubmit | 	rue | 自动点击提交按钮 |
| _shnl_confuse | alse | 混淆模式（随机错误反馈，增加难度） |
| _shnl_responseDelay | 1500 | 提交后等待时间，单位毫秒 |

## 技术栈

- **Tampermonkey** — 浏览器用户脚本
- **Python 3.11+** — 后端
- **Flask** — HTTP API 服务器
- **openpyxl** — Excel 数据库读取
- **信息熵算法** — 最优猜测推荐

## 在线页面

项目展示页（GitHub Pages）：
https://atemmie.github.io/shnlfriberg-assistant/

## 许可证

开源项目，仅供学习参考。