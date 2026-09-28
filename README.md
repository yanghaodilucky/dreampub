# DreamPub

> 一个下载后在自己电脑上运行的 2D 像素咖啡馆：管理项目、进入专注，并与拥有记忆和日常作息的 NPC 一起生活。

[![Verify](https://github.com/yanghaodilucky/dreampub/actions/workflows/verify.yml/badge.svg)](https://github.com/yanghaodilucky/dreampub/actions/workflows/verify.yml)

DreamPub 是一款 macOS 优先的单人离线游戏。它不要求登录，也不会把项目、任务、人物设定或 NPC 记忆上传到服务器。网页界面与本机游戏服务共同运行：前者呈现咖啡馆，后者负责存档、专注状态和 NPC 世界。

## 你可以做什么

- 在 Dream Cafe 中用方向键或 WASD 移动，坐到座位上开始专注。
- 创建项目和任务，查看保存在本机的专注记录、完成状态和进度概览。
- 观察 Mia（活泼的女咖啡店员）与 Noah（成熟稳重的常客）的日常活动；他们会根据上海时间出现、移动、聊天和占用座位，并记住与你专注有关的事件。
- 通过“人物”工作室填写问卷，编辑初始 NPC，或把自己创建的新 NPC 加入咖啡馆。

## 快速开始

### 环境要求

- Node.js 22+
- [pnpm](https://pnpm.io/)
- [uv](https://docs.astral.sh/uv/)

### 从源码运行（当前 macOS 开发版）

先开一个终端启动本机游戏服务。第一次启动会创建你的默认咖啡馆、两条引导任务和本地存档：

```sh
cd apps/server
uv run uvicorn app.main:app --port 8000
```

再开另一个终端启动网页：

```sh
cd apps/web
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的网页地址，通常是 `http://localhost:5173`。网页会连接本机的 `http://127.0.0.1:8000`；请让这个终端保持运行。后端健康检查位于 `http://127.0.0.1:8000/health`。

## macOS 独立应用

Apple Silicon（M 系列）Mac 的构建产物是一个包含本机游戏服务的 DMG，不需要用户安装 Node.js、Python 或 uv。下载 GitHub Release 中的 `DreamPub_0.2.1_aarch64.dmg`，打开后将 `DreamPub.app` 拖进 Applications，再双击启动即可。

当前仓库生成的是 ad-hoc 本地签名，适合本机测试；首次从 GitHub 下载时 macOS 可能要求按住 Control 点击 App 并选择“打开”。公开发布前，请使用 Apple Developer ID 重新签名并完成 Apple 公证，避免此提示。

从源码构建安装包：

```sh
# 仅需在发布机器安装一次：Node.js、pnpm、uv、Rust 和 Xcode Command Line Tools
cd apps/desktop
pnpm install
pnpm run bundle:dmg
```

产物位于 `apps/desktop/src-tauri/target/release/bundle/macos/DreamPub_0.2.1_aarch64.dmg`。如持有 Developer ID，在构建前设置 `DREAMPUB_CODESIGN_IDENTITY`，构建脚本会用它签名 App。

## 使用说明

| 目标 | 操作 |
| --- | --- |
| 在咖啡馆移动 | 使用方向键或 WASD。 |
| 坐下并专注 | 靠近座位按 `E`，或直接点击座位；在专注抽屉中选择一个任务。 |
| 离开座位 | 按方向键或 `E`，或在专注面板中选择离开。 |
| 管理项目和任务 | 点击顶部“项目”，创建、编辑、完成或删除项目与任务。 |
| 查看专注记录 | 点击顶部“专注”，选择任务后开始。可以暂停、继续或结束；结束时会保存一段本地记录。 |
| 与 NPC 对话 | 后端运行时，在底部聊天框输入文字；系统会将消息发给最近、可见的 NPC。 |
| 编辑或新增 NPC | 点击顶部“人物”。可选择已有 NPC 填写问卷、预览并保存，也可点“+ 新 NPC”设置名字与身份后加入咖啡馆。编辑期间 NPC 世界会暂停。 |

## 可选：启用 DeepSeek

默认情况下，NPC 使用确定性的作息与回退回复，不需要 API 密钥。若想让 NPC 根据人物模板生成活动建议和聊天回复，在桌面游戏顶部点击“⚙ AI”，填写你自己的兼容 OpenAI 的 API 地址、模型名与 API Key（DeepSeek 默认值已预填）。

Key 只会写入当前 macOS 用户的 Keychain：不会进入 SQLite 存档、不会回显给网页、不会打进 DMG，也不会提交到 GitHub。设置面板可测试连接或随时移除 Key；移除后 NPC 会立刻退回离线规则模式。

仅在从源码调试服务时，也可以在 `apps/server/.env` 中填写环境变量：

```dotenv
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-chat
```

`.env` 已被 Git 忽略，但它仅适合开发机，不会随 macOS App 发布。请不要把密钥提交、粘贴到 Issue，或暴露给浏览器。

## 本地存档与隐私

DreamPub 的可玩数据存放在本机，不需要账号：

- macOS 默认位置：`~/Library/Application Support/DreamPub/dreampub.sqlite3`
- 人物工作室的问卷、模板和版本：`~/Library/Application Support/DreamPub/characters/`
- 首次启动只会创建公开的基础角色：Mia（活泼女咖啡店员）与 Noah（成熟稳重的常客）。不会包含开发者的私人 NPC 设定或 API Key。
- 你可以在“人物”工作室改写任何角色的性格、关系、关心方式和人生愿望，也可以新增最多四位 NPC。新增的角色和记忆只保存在自己的这台 Mac。

当前阶段只自定义 NPC 的内在设定，仍保留游戏中的像素方块形象。它们不会自动同步到别的设备；如要备份，请在关闭游戏服务后复制整个 `DreamPub` 文件夹。

## 验证与开发

```sh
# 前端：TypeScript 检查和生产构建
cd apps/web
pnpm build

# 后端：人物模板和运行时回退测试
cd ../server
uv run python -m unittest discover -s tests -v

# 仓库根目录：JSON Schema 契约校验
cd ../..
uv run --with jsonschema==4.25.1 python scripts/validate_contracts.py
```

GitHub Actions 会在推送和拉取请求时运行相同的构建、测试和契约校验。

## 当前阶段与边界

DreamPub 正在从可运行原型收敛为可发布的离线单机游戏。目前已经具备本机 SQLite 存档、服务端专注状态机、NPC 长期记忆、人物模板版本和 Apple Silicon macOS 独立应用；还未完成以下发布体验：

- Apple Developer ID 签名与 Apple 公证（当前 DMG 是可本机安装的 ad-hoc 签名版本）。
- NPC 外表、服装或换装自定义（本阶段刻意保留原有像素方块）。
- 跨设备同步、多用户协作与在线账号系统（当前不在产品范围内）。
- 使用用户自带 DeepSeek Key 时的用量提示和隐私说明页面。

完整边界和版本变更见 [v0.1.3 发布说明](docs/releases/v0.1.3.md)。

## 项目文档

- [产品范围与验收标准](docs/product.md)
- [架构与数据流](docs/architecture.md)
- [NPC 设计](docs/npc-design.md)
- [人物模板与版本机制](docs/npc-character-system.md)
- [开发路线图](docs/roadmap.md)
- [目录职责](docs/repository-layout.md)
- [实时与领域契约](contracts/README.md)

## 许可证

仓库目前尚未声明开源许可证。若要公开复用、贡献或再分发，请先由项目维护者选择并添加合适的许可证。
