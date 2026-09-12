# DeepSeek Harness Research 求职准备

本项目面向 DeepSeek Harness 深度学习研究员方向，目标是形成一套能够在面试中直接展示的材料：

- 有明确研究问题和假设；
- 有可运行的 Agent Harness 原型；
- 有可复现的基准、消融实验和失败分析；
- 能把真实任务反馈转成数据、评测和迭代策略；
- 能清楚解释模型、Harness、工具和用户体验之间的关系。

## 当前推荐路线

旗舰项目：**Evidence-Driven Context & Memory Harness**。

它把上下文管理、长期记忆、工具调用、真实任务评测串成一个完整闭环，最适合体现研究员岗位要求。建议先完成一个窄而深的版本，再用两个补充项目扩展到 Subagent/Multi-Agent 和用户反馈评测。

## 文件说明

- [项目推荐](./01-project-recommendations.md)：候选项目、优先级、研究问题、实验设计和交付物。
- [面试问答](./02-interview-qa.md)：研究员方向的高频问题与回答要点。
- [项目问答](./03-project-qa.md)：围绕旗舰项目的追问、技术细节和反驳准备。
- [行动计划](./04-action-plan.md)：建议的 8 周执行顺序和每周产出。
- [ByteDance 岗位分析](./05-bytedance-jd-analysis.md)：新增 AI Agent 工程师、大模型应用算法工程师材料的提炼、启发和匹配度排序。
- [Agent 算法工程师（游戏方向）](./06-game-agent-jd-analysis.md)：岗位职责、Agent 架构与长期记忆要求，以及对应的项目展示和面试准备方向；公司待补充。
- [DreamBob 项目计划书](./07-dreambob-project-plan.md)：像素多人专注空间的产品设想、首版范围、NPC 技术路线、开发阶段及新仓库交接说明，面向用户所指的米哈游 Agent 岗位进行项目探索。

## 使用方式

先选定一个旗舰项目，完成最小可运行原型和 baseline，再补齐评测与失败案例。面试材料中的数字必须来自自己的实验；在实验完成前，统一使用“待实测”而不是编造结果。
