# 目录职责

仓库沿用 DreamPub 根目录，不另套一层 focus-world。下列目录已预留，标注的文件将在相应阶段实现；本次不创建空类伪装成功能。

```text
apps/web/src/
  app/                     React 入口、路由、页面布局
  game/
    scenes/                CafeScene.ts
    entities/              Player.ts、NPC.ts
    systems/               MovementSystem.ts、InteractionSystem.ts、AnimationSystem.ts
    bridge/                GameBridge.ts、事件类型与监听生命周期
  features/
    focus/                 任务选择、计时、会话状态
    projects/              项目、任务、进度板
    social/                第二阶段
    npc/                   NPC 资料、对话面板
  api/                     REST 客户端、WebSocket 连接与重连
  store/                   服务器数据投影、去重、UI 状态
  types/                   从契约生成的类型及前端局部类型
apps/web/public/assets/
  characters/ maps/ furniture/ audio/

apps/server/app/
  main.py                  FastAPI 入口、NPC worker、世界和角色模板 API
  api/                     focus.py、projects.py、world.py、users.py、npc.py
  domains/
    focus/ projects/ world/ social/
  realtime/                websocket.py、room_manager.py
  agents/                  当前的 DeepSeek 适配器与 NPC 运行档案；其余模块待实现
  characters/              问卷、模板编译、版本校验与 JSON 存储
  db/
    models/ repository/    数据模型、事务与查询
  workers/                 npc_worker.py、持久事件分发
contracts/                 唯一的跨语言消息结构来源
docs/                      产品、架构、角色与验收
scripts/                   契约校验
```

目前已有 `apps/server/tests/`、前端锁文件、后端 `pyproject.toml` / `uv.lock`，以及可启动的单进程 FastAPI NPC 服务。数据库迁移、领域 API、Compose 和 PostgreSQL 仍待真实专注闭环阶段实现；在那之前不提交无法运行的数据库配置。
