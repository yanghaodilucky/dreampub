# 目录职责

仓库沿用 DreamPub 根目录，不另套一层 focus-world。下列目录已预留，标注的文件将在相应阶段实现；本次不创建空类伪装成功能。

```text
apps/web/src/
  app/                     React 入口、路由、页面布局
  game/
    scenes/                BootScene.ts、LibraryScene.ts
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
  main.py                  未来应用入口和 lifespan
  api/                     focus.py、projects.py、world.py、users.py、npc.py
  domains/
    focus/ projects/ world/ social/
  realtime/                websocket.py、room_manager.py
  agents/                  runtime.py、perception.py、memory.py、policy.py、
                           reflection.py、actions.py、prompts/
  db/
    models/ repository/    数据模型、事务与查询
  workers/                 npc_worker.py、持久事件分发
contracts/                 唯一的跨语言消息结构来源
docs/                      产品、架构、角色与验收
scripts/                   契约校验
```

后续加入 server 迁移和测试目录、前端 package.json/锁文件、后端 pyproject.toml/锁文件，以及能实际启动 PostgreSQL 与应用的 docker-compose.yml。目前没有启动服务，故不先提交无法运行的 Compose 文件。
