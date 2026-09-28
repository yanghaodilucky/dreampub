# DreamPub

一个可以进入的 2D 像素咖啡馆原型：管理本地任务、开始专注，并与有自主作息的 NPC 一起学习。

个人仓库：<https://github.com/yanghaodilucky/dreampub>。

## v0.1.1 当前状态

这是一个可本地运行、可部署演示的单人原型：React + Phaser 提供咖啡馆、项目／任务抽屉、本地专注记录和人物工作室；FastAPI 提供 Loopy 与 Evan 的实时作息、位置、聊天和人物模板 API。World Event / NPC Action / WebSocket 契约已确定。

重要边界：项目、任务、专注记录仍只保存在浏览器 `localStorage`；NPC 运行时状态和短期记忆只存在服务进程内。没有登录、数据库、跨设备同步、多人协作或可靠的服务端专注状态机。请勿将本原型数据视为可恢复记录。

启动本地原型：

```sh
cd apps/web
pnpm install --frozen-lockfile
pnpm dev
```

在浏览器打开命令显示的本地地址。使用方向键或 WASD 移动，靠近书桌按 E，或点击座位；选择任务后可查看本地计时。任务和计时会存储在当前浏览器，但并非服务端持久化。

## NPC 服务与 DeepSeek

先在一个终端启动后端：

```sh
cd apps/server
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

再在另一个终端启动 `apps/web` 的 Vite 服务。网页会自动连接 `ws://127.0.0.1:8000/ws/world/dream-cafe`；后端没有运行时，网页仍展示静态 NPC。

在 `apps/server/.env` 中填写 `DEEPSEEK_API_KEY=你的密钥` 即可启用 DeepSeek 决策。密钥不会进入浏览器或 Git；未配置时两名 NPC 使用确定性作息。`NPC_TICK_SECONDS` 是服务检查时间与玩家距离的间隔；NPC 的日常活动会持续约 12–90 分钟，不会因检查而频繁换状态。

人物工作室生成的本地模板保存在 `apps/server/data/characters/`，该目录已被 Git 忽略，避免把个人问卷回答或聊天设定意外公开。首次启动会自动创建 Evan 和 Loopy 的演示种子模板。

可手动编辑的运行时档案在 [NPC_PROFILES](apps/server/app/agents/profiles.py)：包括姓名、颜色、初始位置和允许活动。角色的稳定人设、倾向、问卷来源、醒来第一句话和版本历史由 [NPC Character Template System](docs/npc-character-system.md) 管理；运行时会读取当前 active template 作为模型聊天与活动建议的上下文。前端只负责显示和移动 NPC。

## 首版

- 网页端，一个像素咖啡馆、一个玩家、两个 NPC（Loopy 和 Evan；第三个待核心闭环验证后加入）。
- 项目、任务、真实专注计时与持久化记录、项目进度板。
- NPC 确定性作息、事件感知、受控动作、长期记忆和可追踪决策。
- 第二阶段加入好友联机。家、咖啡馆、换装、家具编辑、天气仅保留扩展位置。

## 文档

- [产品与验收标准](docs/product.md)
- [架构与数据流](docs/architecture.md)
- [NPC 设计](docs/npc-design.md)
- [NPC 角色模板与版本机制](docs/npc-character-system.md)
- [开发里程碑](docs/roadmap.md)
- [目录职责](docs/repository-layout.md)
- [契约说明](contracts/README.md)

计划技术栈：React + TypeScript + Vite、Phaser 4、FastAPI、PostgreSQL。React 管产品，Phaser 管世界。Redis 与 pgvector 暂不引入。依赖版本将在可运行骨架阶段锁定。

## 契约校验

安装 [uv](https://docs.astral.sh/uv/) 后，在仓库根目录执行：

```sh
uv run --with jsonschema==4.25.1 python scripts/validate_contracts.py
```

此命令校验 Schema、有效示例及应被拒绝的输入，不代表游戏或后端已经实现。

## 发布 GitHub 版本

发布边界、已知限制与检查清单见 [v0.1.1 发布说明](docs/releases/v0.1.1.md)。GitHub Actions 会在推送和拉取请求时构建前端、运行后端测试和校验契约。

部署前端并连接远程服务时，在构建环境设置 `VITE_NPC_SERVER_URL=wss://your-npc-service.example.com/ws/world/dream-cafe`；前端会从它推导 HTTP API 地址。生产服务还必须将前端域名加入 `ALLOWED_ORIGINS`。

确认 CI 通过且未暂存 `.env` 或密钥后，创建标签即可触发 GitHub Release 工作流：

```sh
git tag -a v0.1.1 -m "DreamPub v0.1.1"
git push origin main --follow-tags
```

标签工作流会先重新验证项目，再生成 GitHub Release 说明。当前仓库尚未声明开源许可证；在公开发布前请先选择并添加许可证。
