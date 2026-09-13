# 技术架构

## 边界

```text
Browser: React UI ←→ Client Store / GameBridge ←→ Phaser 4
                          │ REST + WebSocket
FastAPI: Product Logic ← World Event → World Engine → Agent Runtime
                          │                    │
                    PostgreSQL          validated actions
```

React 管登录、项目、任务、专注、设置、NPC 对话框和进度面板；Phaser 管地图、碰撞、角色、座位、移动、动画和场景视觉。Client Store 保存服务器数据的前端投影与 UI 状态，不是第二套业务真相。

Phaser 4 已正式发布；官方提供 React / Vite 模板。实现时检查模板实际依赖并锁定稳定版本，不能直接套用旧 Phaser 3 示例。

- [Phaser 4.2 官方发布说明](https://phaser.io/news/2026/06/phaser-v4-2-0-released)
- [官方框架模板](https://docs.phaser.io/phaser/getting-started/project-templates)

FastAPI 按模块组织成单体；首版单服务实例，NPC worker 是同一进程中的后台任务，避免多进程各自维护房间或重复调度 NPC。以后再拆独立 worker、Redis presence 和分布式消息。

## Command、World Event 与实时状态

Command 表示请求做事；World Event 表示服务器已经确认发生的事实。玩家与模型均不能直接写已确认事件。所有跨领域的有意义变化以 World Event 连接，模块内部的读取和规则校验仍可直接调用。

开始专注的顺序：React 发 REST Command → 验证身份、任务归属、座位及会话规则 → 事务写入 FocusSession 和 WorldEvent → 提交 → 分发 → 看板投影、Phaser 动画、NPC perception。客户端点击只显示 loading，不能先宣称专注已成功。

同名事件贯穿全链路：使用 `focus.started`，不另建语义相同的 `player.focus_started`。事件名称与 payload 由 contracts 定义。

NPC 的移动目标、活动切换、说话等语义变化持久化。逐帧 x/y、朝向和插值动画是临时状态，经 WebSocket `state.delta` 同步，不逐帧写日志，也不逐帧触发 LLM。

## 一致性与投递

- 业务记录与 world_events 在同一 PostgreSQL 事务写入。单世界事务锁下分配单调递增 sequence，避免提交乱序；数据库约束 `(world_id, sequence)` 唯一。
- WorldEvent 同时作为首版持久化待分发日志：后台分发器读取已提交事件，订阅方各有消费游标。失败重试，按 event_id 去重。不要只依赖提交后的内存回调。
- 专注开始/暂停/恢复/结束等命令带 Idempotency-Key；服务端保存用户、路由、键、请求摘要与结果。相同键不同请求拒绝；相同请求返回原结果。
- FocusSession 的有效时长由一次状态迁移计算，投影不能在事件重投时再次累加。数据库对未结束会话加唯一性约束。
- 首版是业务状态表加事务事件日志，不做全量 event sourcing。快照从状态表生成；事件用于增量同步、感知和审计。

## REST 与 WebSocket

REST 负责持久业务操作与读取：`GET/POST /projects`、`POST/PATCH /tasks`、`POST /focus-sessions`、`POST /focus-sessions/{id}/pause|resume|finish|cancel`、`GET /world/library`、`GET /npcs/{id}`、`POST /npcs/{id}/messages`。

World Engine 执行坐下等交互前，检查距离、位置、障碍和座位占用。后端从认证上下文推导 actor_id / world_id；不信任客户端自报身份。

WebSocket 首版即使用，但只连接用户自己的世界。协议区分 snapshot、world.event、state.delta、resync.required 和客户端 resume / movement.intent。客户端永远不能上传 npc.spoke 或 focus.started 作为事实。

连接先鉴权并订阅、暂存事件，再在一致性读取事务中取得快照及 last_sequence，丢弃缓存中不大于该游标的事件，发送剩余事件。这样不会在快照读取与订阅之间丢事件。持久事件按 sequence 应用并按 event_id 去重。发现缺口或无法补发时要求重新获取快照。

坐标流使用单独的 revision，与 WorldEvent sequence 无关。RoomManager 重启生成新的 stream_id；旧 stream 的 delta 丢弃，重新取快照。delta 只描述变化实体，removed_actor_ids 表示离开；不得把缺失实体误判为删除。

命令响应可以返回 event_id，但同一事件经 WebSocket 到达不得重复更新。React 挂载时注册 bridge 监听，卸载时取消；Phaser Scene 销毁也必须解绑。

## GameBridge

仅承载类型化交互与渲染通知，不承载第二套业务总线：

- Phaser → React：`desk.interacted {seat_id}`、`npc.clicked {npc_id}`。
- Store → Phaser：已确认的 `world.event`、`world.snapshot` 和实时状态变化。
- Phaser → 网络层：限频的移动意图；服务端负责合法性检查。

React 不引用 LibraryScene.player；Phaser 不直接修改项目状态或调用模型。规范中的动作模型与 WorldEvent payload 分开：动作尚待验证，事件已经发生。

## 三类 State

| 类别 | 存放位置 | 内容 |
| --- | --- | --- |
| 持久业务状态 | PostgreSQL | users、avatars、projects、tasks、focus_sessions、locations、worlds、world_events |
| 实时物理状态 | RoomManager 内存 | 坐标、方向、插值、在线状态；npc_states 仅保存活动/位置目标检查点 |
| 认知状态 | PostgreSQL 独立表 | npcs、npc_goals、npc_memories、npc_relationships、npc_reflections、agent_decisions |

另需最小基础设施表：command_receipts 和 event_consumer_offsets。首版先普通索引检索记忆，不引入 pgvector。只有多实例/跨进程需求出现时引入 Redis。

项目、任务、NPC 认知状态和事件均关联 world_id。首版一个用户拥有一个私人世界；NPC 档案可用公共种子，但记忆、关系、目标按世界独立。未来联机通过成员与权限表显式扩展，不把所有私人世界直接合并。

数据库迁移在后端骨架阶段用 Alembic 管理；生产启动不得自动覆盖表结构。物理状态重建使用最近检查点与当前作息，不通过补跑所有错过的移动和 LLM 调用恢复。

## 扩展接口

Location 定义类型、地图资源和交互点；Avatar 使用外观配置引用；Furniture 用静态定义与实例分离；EnvironmentProvider 未来提供天气等表现输入。首版只注册 library、固定外观和静态家具。contracts 暂不接受未实现的事件；新增事件需同步 Schema、执行器、客户端和测试。

## 失败处理

数据库写入失败不发成功事件。模型超时、解析失败、动作过期回落到确定性作息。进度面板可以从服务器重新读取，不能依赖浏览器一直在线。浏览器失焦后依据服务器时间恢复倒计时。真正接入模型前补齐调用超时、配额、结构化日志和敏感字段裁剪。
