# DreamPub

一个可以进入的 2D 像素咖啡馆：完成真实专注任务、查看项目进度，与有自主作息和长期记忆的 NPC 一起学习。

个人仓库：<https://github.com/yanghaodilucky/dreampub>。

## 当前状态

已有可运行的前端 Game Shell：React 右侧任务／专注抽屉、Phaser Dream Cafe、玩家移动与碰撞、座位和项目板交互、前端任务选择和临时专注计时。World Event / NPC Action / WebSocket 契约已确定。后端、持久化、真实专注记录、NPC simulation 和模型接入尚未实现。

启动本地原型：

```sh
cd apps/web
pnpm install
pnpm dev
```

在浏览器打开命令显示的本地地址。使用方向键或 WASD 移动，靠近书桌按 E，或点击座位；选择任务后可查看临时计时。原型任务与计时刷新后会清空。

## NPC 服务与 DeepSeek

先在一个终端启动后端：

```sh
cd apps/server
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

再在另一个终端启动 `apps/web` 的 Vite 服务。网页会自动连接 `ws://127.0.0.1:8000/ws/world/dream-cafe`；后端没有运行时，网页仍展示静态 NPC。

在 `apps/server/.env` 中填写 `DEEPSEEK_API_KEY=你的密钥` 即可启用 DeepSeek 决策。密钥不会进入浏览器或 Git；未配置时两名 NPC 使用确定性作息。可修改 `NPC_TICK_SECONDS` 控制每次高层活动决策的间隔。

可手动编辑的角色设定在 [NPC_PROFILES](apps/server/app/agents/profiles.py)：包括姓名、颜色、初始位置、身份、性格、背景和允许活动。前端只负责显示和移动 NPC。

## 首版

- 网页端，一个像素咖啡馆、一个玩家、两个 NPC（Loopy 和 Evan；第三个待核心闭环验证后加入）。
- 项目、任务、真实专注计时与持久化记录、项目进度板。
- NPC 确定性作息、事件感知、受控动作、长期记忆和可追踪决策。
- 第二阶段加入好友联机。家、咖啡馆、换装、家具编辑、天气仅保留扩展位置。

## 文档

- [产品与验收标准](docs/product.md)
- [架构与数据流](docs/architecture.md)
- [NPC 设计](docs/npc-design.md)
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
