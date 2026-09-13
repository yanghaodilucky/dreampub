# NPC 设计

## 首批角色（可调整的创作草案）

| NPC | 背景与长期目标 | 日常行为 | 陪伴方式 |
| --- | --- | --- | --- |
| Mira | 准备个人插画集的自由插画师，正在完成关于城市旧建筑的一章 | 窗边画画、找参考书、整理草稿、休息 | 安静、善于观察，记得用户主动分享的项目细节 |
| Lin | 整理地方口述史的图书馆助理，希望做成一份可检索的目录 | 整理书架、查资料、写索引、给 Mira 推荐书 | 温和而有条理，主动交流简短、具体 |
| 第三个 NPC | 待前两个角色的作息、关系和记忆验证后再设计 | 不作为首个里程碑依赖 | 避免三个相似聊天机器人 |

实现人物档案时补充经历时间线、价值观、说话风格、已知事实、关系与阶段目标。表中只是方向，不冒充完整人物故事。

## 确定性 simulation

按用户配置的现实时间安排 arriving → reading/working → break → leaving/offstage。未实现家和咖啡馆时，离馆仅标记 offstage，不模拟不存在的场景。NPC 的低层寻路、碰撞、坐下、计时及日常活动不调用模型。

NPC 独立推进自己的活动和目标，也可在双方空闲且同处可交互区域时交流。为 NPC 对话设置轮数和冷却，事件携带 causation_id，防止 npc.spoke 互相无限唤醒。

## Agent 执行链

World Events → Perception → Relevant Events → Memory Retrieval + Current State → Policy → LLM → Structured Action → Schema Validator → World Rule Validator → Executor → World Event。

模型只能提出 speak / move / start_focus / wait；不能指定真实 actor_id、event_id 或直接修改数据库。首版模型每次返回一个动作。动作由执行器映射为事件，不照抄模型输出作为事件。

执行前重新检查：NPC 仍属于该世界、当前状态版本未过期、目标存在、说话双方同地点且在交互范围内、移动目标可达、座位可用、活动与时长允许、发言冷却及专注打扰策略。模型推理期间玩家可能离开，必须按执行时状态校验。

Schema 合法不等于世界合法：对异地玩家说话、向不存在的桌子移动等需执行器拒绝。speak 的 target_actor_id 使用内部 ID，不使用显示名；move 指向地图预定义的 target_anchor_id，而非任意坐标。

## 唤醒与预算

由主动对话、重要项目完成、关系相关重逢、目标变化等触发。普通移动和固定作息不唤醒模型；玩家接近先做去抖与显著性过滤。初始可调策略：每 NPC 被动唤醒间隔至少 120 秒，NPC 互聊最多两轮，每世界同时一个模型调用。显式用户对话单独限频并优先处理。

专注中默认屏蔽 NPC 主动对用户说话；用户主动打开对话则允许回应。专注开始可以被记忆与感知，不必立即发言。静默与 wait 都是正常结果。

超时、不可用、无效动作或预算耗尽时，继续确定性作息；UI 不声称规则模板回应来自模型。模型提供方、预算、调用超时及美术资源在实施前选择，不在仓库提交 API key。

## 长期记忆与关系

首版使用结构化事件摘要和 PostgreSQL 的元数据过滤/关键词检索，结合时间、重要性和实体相关性排序；记录实际取回的 memory_ids。后续基于检索评测再决定是否用向量索引。

NPCMemory 至少包含 world_id、npc_id、subject_id、kind、content、source_event_ids、created_at、importance、confidence、supersedes_id。对话仅对参与者可见；NPC 不默认读取其他人的私聊。用户自述与 NPC 推断区分，推断不覆盖事实；矛盾信息保留来源与修订关系。

关系、目标、反思与位置分开持久化。反思只在会话结束或积累到一定数量的重要事件后生成，必须关联已有事件或记忆，不凭空补写用户经历。离线期间不补跑模型。

## Decision Trace

agent_decisions 记录 world_id、npc_id、trigger_event_ids、retrieved_memory_ids、state_version、policy_version、prompt_version、模型标识、受长度限制的原始模型输出、parsed_action、accepted、reject_reason、执行产生的 event_id、latency_ms、token_usage、失败类别。

记录输入来源与决策结果，不索要或存储模型隐藏推理。原始输出可能含用户文本，仅作为本人可见调试资料，设置保存期限；不写入公开 WebSocket 广播。失败也要留记录。

## 验收与评测

- 自主性：无用户输入时，两名 NPC 按作息切换活动，完成一次有限的相互互动。
- 记忆：用户分享一个项目事实，服务重启后仍能按来源检索；其他世界检索不到。
- 约束：异地说话、未知目标、非法动作、过期状态均被拒绝且世界无变化。
- 陪伴：模拟专注期间，未经用户主动对话不出现打断发言。
- 恢复：模型超时、无效 JSON、WebSocket 重连、worker 重启均不打断计时或日常活动。
- 记录检索命中率、无来源事实比例、动作拒绝率、被动打断次数、延迟和 token 成本；数据实测后填写，不提前承诺数值。
