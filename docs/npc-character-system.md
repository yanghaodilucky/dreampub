# NPC Character Template System

## Scope

This system defines **who an NPC is at the beginning**. It provides a shared, versioned template for Evan and Loopy, a questionnaire compiler, validation and Awakening. It does not implement affection, relationship or personality scores; gifts; runtime memory; PostgreSQL; or a new behavior engine.

```text
Questionnaire → Character Compiler → validated Template Draft → Awakening → saved Template Version → active runtime context
```

Templates are durable JSON under `apps/server/data/characters/<character_id>/`. `index.json` selects an active version while `versions/vN.json` preserves historical documents. That directory is ignored by Git by default: a questionnaire can contain private relationships and memories, so it must not be published accidentally. Evan and Loopy demo seed templates are created on first startup.

## Character Questionnaire v2

Questionnaire v2 contains exactly twelve player-authored questions. `question_id` values are stable API identifiers:

| ID | Question | Primary meaning |
| --- | --- | --- |
| `first_meeting` | 你第一次遇见 TA，是在哪里？那一天发生了什么？ | Known history and world identity |
| `perfect_day` | 如果 TA 可以完全按照自己的心意度过一天，那会是什么样的一天？ | Activity, social and interest tendencies |
| `absorbing_activities` | TA 最喜欢做什么？有什么事情会让 TA 一做起来就忘记时间？ | Interests and activity preferences |
| `what_matters` | TA 最珍惜什么？可以是一件东西、一段关系、一种感觉，或者一种生活方式。 | Values and important objects |
| `precious_memory` | TA 有没有一段非常珍贵的回忆？如果有，那是什么？ | Creation-time formative backstory |
| `unfinished_dream` | TA 有没有一件一直想做、但还没有做到的事情？为什么还没有去做？ | Long-term desire |
| `meaning_of_love` | 对 TA 来说，爱一个人意味着什么？ | Relationship philosophy and care style |
| `showing_care` | TA 通常怎样表达关心？ | Care and communication tendencies |
| `relationship_with_player` | TA 和你是什么关系？这段关系最核心的感觉是什么？ | Free-text relationship premise and tone |
| `stress_response` | TA 累了、难过了，或者想一个人待一会儿时，通常会怎样？ | Stress and boundaries |
| `desired_ability` | 如果 TA 明天醒来，可以获得一种能力，TA 最希望得到什么能力？为什么？ | Deep desire only, never a system capability |
| `small_wish` | TA 最近有没有一个很小、但真的很想完成的愿望？ | Near-term initial goal |

Awakening is not a thirteenth player answer. Only after all twelve answers compile and validate does the generated character answer: “现在，你第一次真正醒来。你看见 TA 就在你面前。你最想对 TA 说什么？”

## Template schema and state boundary

Every template contains version metadata, `core_identity`, `tendencies`, important objects, initial goals, relationship details, boundaries, Awakening and source answers. V2 also includes:

```yaml
questionnaire_version: 2
template_schema_version: 2
backstory:
  formative_memories: []
aspirations:
  long_term_desires: []
  deep_desires: []
player_relationship:
  premise: ''
  tone: ''
  known_history: ''
  relationship_philosophy: ''
```

`backstory.formative_memories` is creation-time fiction supplied for the character. It is not a future runtime memory and is never represented as a WorldEvent. Likewise, `unfinished_dream` is a longer desire while `small_wish` is a near-term goal.

Stable core (identity, values, relationship premise and expression style) is not automatically modified by runtime behavior. Tendencies such as care style, activity preference and stress response influence future policy but never compel an action; for example, enjoying a thoughtful gift does not mandate daily gifts. `evolving_state_boundary` remains the explicit future home for runtime memories, unfinished threads, current intention and emotional context.

The validator rejects unknown fields. Narrative text cannot add tools, permissions, actor IDs or executable instructions. DreamPub deliberately models relationship through history, tendencies and future behavior—not a hidden affection, romance, personality or relationship score.

## Compiler and Awakening

The existing DeepSeek adapter receives the questionnaire version, answers and an allowed draft shape. Its result undergoes strict local validation and one bounded repair attempt. It may synthesize across related answers, but cannot invent system authority or expand one answer into unsupported major history.

Without a key or after failed validation, the deterministic compiler maps all twelve answers into a valid V2 template. `desired_ability` is retained only as `aspirations.deep_desires`; it never changes runtime permissions. Awakening receives only the validated template’s character context and relationship premise. It is short, preserves the core unchanged, and falls back deterministically without inventing new shared history.

## Compatibility and versioning

Questionnaire v1 remains a supported parser path. Historical v1 JSON lacks the V2-only sections, but is read with compatible defaults and retains `questionnaire_version: 1` / `template_schema_version: 1` in its normalized response. V2 templates require their new fields and use schema version 2.

Evan and Loopy have retained v1 documents and new v2 seed documents. V2 is saved with `parent_version: <character>-template-v1`, `Migrated to Character Questionnaire v2.` as the change note, and is **not automatically activated**. The index remains on v1 until a developer explicitly selects v2. New versions are monotonic, retain parent lineage, and content hashing prevents no-op duplicates.

API endpoints remain:

- `GET /characters/{character_id}` — active version.
- `GET /characters/{character_id}/versions` — history and active marker.
- `GET /characters/{character_id}/versions/{version}` — one version.
- `POST /characters/{character_id}/compile` — preview with `save: false`, or persist with `save: true`.
- `POST /characters/{character_id}/versions` — persist the exact reviewed `template_preview`; the in-game studio uses this so the preview is not compiled twice.
- `POST /characters/{character_id}/versions/{version}/activate` — explicitly select a version.

The front-end toolbar’s `✦ 人物` button opens the Character Questionnaire Studio. It pauses the Dream Cafe worker through `POST /world/cafe/pause`, presents one question at a time, previews the generated initial template and Awakening, then saves the exact preview. `继续 Dream Cafe` calls `POST /world/cafe/resume`; the worker does not advance NPC schedules while paused.

## Runtime integration

`CafeWorld` safely loads the active template. Existing schedules, positions, WebSocket behavior and deterministic activity fallback remain untouched. DeepSeek chat and activity prompts append the active template’s stable/tendency context when available.

## Future concept: Living Questions

In a later milestone, an NPC might answer additional questions about identity, relationships, dreams, memory or values in fitting life situations. Those answers may become `SelfReflection` records. They must not directly overwrite stable core, and this project currently has no scheduler, reflection agent, extra LLM loop or runtime implementation for them.
