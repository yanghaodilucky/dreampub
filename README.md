# DreamPub

一个可以进入的 2D 像素图书馆：完成真实专注任务、查看项目进度，与有自主作息和长期记忆的 NPC 一起学习。

个人仓库：<https://github.com/yanghaodilucky/dreampub>。

## 当前状态

处于设计与契约阶段。已确定首版范围、模块边界、World Event / NPC Action / WebSocket 契约与开发顺序；尚无可运行的前后端、地图或模型接入。目录中的 `.gitkeep` 仅保留结构。

## 首版

- 网页端，一个像素图书馆、一个玩家、两个 NPC（第三个待核心闭环验证后加入）。
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
