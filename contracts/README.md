# 契约 v1 草案

所有 Schema 使用 JSON Schema Draft 2020-12。`world_event` 是持久事实，`npc_action` 是模型待验证提案，`websocket_event` 是双向传输信封。它们不是三份同义事件。

| 文件 | 用途 |
| --- | --- |
| world_event.schema.json | 服务端已确认的领域事件；类型与 payload 严格对应 |
| npc_action.schema.json | 模型一次只能提出一个白名单动作 |
| websocket_event.schema.json | 事实广播、快照、实时增量和客户端意图 |
| examples/ | 可校验的具体例子，不是运行中的真实用户记录 |

## WorldEvent

必需字段：schema_version、event_id、world_id、sequence、type、timestamp、actor_id、actor_kind、location_id、causation_id、payload。无前因时 causation_id 为 null；有前因时关联触发事件。HTTP 幂等键与 causation_id 不同，不混用。

event_id 为 UUID；sequence 在单个世界内单调递增；timestamp 为服务端生成、带时区的 ISO 8601 时间戳。服务端规范化到 UTC。事件本身不接受权限指令，消费者必须按认证身份和来源做投影。持久日志不原样公开给房间所有成员。

首版 catalog 覆盖玩家进入/坐下/起身，项目创建/修改/完成，任务创建/修改/状态变化，专注开始/暂停/恢复/完成/中断，用户对 NPC 说话，NPC 进入/离开/移动目标/活动/等待/说话。未知事件及未知字段拒绝。未来的 weather.changed 等须先扩展契约，不能仅靠任意字符串绕过类型检查。

`focus.finished` 表示达到目标的完成；提前结束是 `focus.cancelled`。elapsed_seconds 是已累计有效秒数的绝对值，不能在收到重投事件后再次相加。

NPC 本身的活动使用 `npc.activity_started`，不冒充用户的 FocusSession，不计入用户项目统计。

## NPCAction

speak、move、start_focus、wait 是仅有的四种提案。使用内部目标 ID、有限枚举和时长上限，禁止多余字段。模型输出中的 actor_id / world_id / SQL / prompt 等额外指令不被接受。

Schema 只验证结构。跨世界、异地说话、距离、路径、座位、当前活动、冷却、时长合法性及状态过期由执行器验证。字符串只按文本渲染，不能作为 HTML 或命令执行。

## WebSocket

server → client：snapshot、world.event、state.delta、resync.required。

client → server：resume、movement.intent。服务端路由按方向白名单校验，不能因为 union Schema 合法就接收客户端发来的 world.event。身份与所在世界由连接鉴权校验，不靠客户端消息自报。

`snapshot` 是世界渲染快照；项目/任务详细列表走 REST。`state.delta.entities` 中每个变化实体提供完整当前物理状态，删除使用 removed_actor_ids。持久事件 sequence 与临时状态 revision 是两套独立游标，stream_id 改变时重取快照。

schema_version 用于线上的协议选择；npc_action 的版本由调用端选定的 Schema 决定，不让模型自选版本。修改必需字段或语义时升版，同步更新两端类型、例子和校验。

## 验证

在根目录运行 `uv run --with jsonschema==4.25.1 python scripts/validate_contracts.py`。校验启用 format 检查和本地引用 registry，不从网络解析 Schema 引用。它覆盖有效示例、错误事件 payload、伪造主体、错误时间戳和非法动作等输入；世界规则需在实现执行器后另测。
