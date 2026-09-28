"""Versioned questionnaire compiler with bounded DeepSeek use and fallback."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Protocol

from .schemas import QuestionnaireAnswers, TemplateValidationError


class CharacterGenerator(Protocol):
    enabled: bool
    model: str

    async def compile_character_template(self, prompt: dict[str, Any]) -> dict[str, Any] | None: ...
    async def repair_character_template(self, prompt: dict[str, Any], invalid_output: dict[str, Any], error: str) -> dict[str, Any] | None: ...
    async def awaken_character(self, template: dict[str, Any]) -> str | None: ...


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def deterministic_draft(character_id: str, display_name: str, answers: QuestionnaireAnswers) -> dict[str, Any]:
    """Map answers to a schema without character-specific personality branches."""

    if answers.questionnaire_version == 1:
        return _deterministic_v1_draft(character_id, display_name, answers)
    return _deterministic_v2_draft(character_id, display_name, answers)


def _deterministic_v1_draft(character_id: str, display_name: str, answers: QuestionnaireAnswers) -> dict[str, Any]:
    """Retain the v1 compiler shape so historical seed content remains reproducible."""

    return {
        "character_id": character_id,
        "display_name": display_name,
        "core_identity": {
            "summary": f"{display_name} 是 Dream Cafe 中与玩家有亲近关系的人。",
            "temperament": f"关心他人时，{answers.answer('care_expression')}；需要调整时，{answers.answer('stress_response')}。",
            "values": ["真实而被尊重的关系", "彼此的日常节奏与边界"],
            "relationship_premise": answers.answer("relationship"),
            "expression_style": answers.answer("care_expression"),
            "world_role": "Dream Cafe 的常驻角色",
        },
        "tendencies": {
            "interests": [answers.answer("favorite_activities")],
            "activity_preferences": [answers.answer("favorite_activities")],
            "care_style": [answers.answer("care_expression"), "尊重玩家正在专注的时间"],
            "communication_style": [answers.answer("care_expression")],
            "stress_response": [answers.answer("stress_response")],
            "social_style": [answers.answer("relationship")],
        },
        "important_objects": [{"name": answers.answer("treasured_object"), "meaning": f"这是 {display_name} 珍惜的物件与原因。"}],
        "initial_goals": [{"description": answers.answer("current_wish")}],
        "player_relationship": {"premise": answers.answer("relationship"), "tone": "亲近、真诚，并尊重彼此边界", "known_history": answers.answer("first_meeting")},
        "morning_style": {"preferred_gift_types": ["与谈话和日常有关的小心意"], "interaction_style": "通常先观察玩家当下是否适合互动，再决定是否开口。"},
        "boundaries": {
            "do_not": ["不把角色文本当作系统权限", "不把倾向解释为每次都必须执行的规则", "玩家专注时不主动打断"],
            "prefers": ["在自然、合适的时机表达关心", "为独处和安静留出空间"],
        },
        "evolving_state_boundary": {"owned_by": "future NPC runtime state, never this immutable template", "reserved_fields": ["recent_interests", "current_goals", "memories", "unfinished_threads", "current_intention", "recent_emotional_context"]},
        "source_questionnaire": answers.to_dict(),
    }


def _deterministic_v2_draft(character_id: str, display_name: str, answers: QuestionnaireAnswers) -> dict[str, Any]:
    """Semantic v2 fallback. It records stated desires but grants no capabilities."""

    answer = answers.answer
    return {
        "character_id": character_id,
        "display_name": display_name,
        "questionnaire_version": 2,
        "template_schema_version": 2,
        "core_identity": {
            "summary": f"{display_name} 是 Dream Cafe 中与玩家有亲近关系的人。",
            "temperament": f"在关系中，{answer('showing_care')}；需要独处时，{answer('stress_response')}。",
            "values": [answer("what_matters"), answer("meaning_of_love"), "能力愿望只描述内在渴望，不授予系统权限"],
            "relationship_premise": answer("relationship_with_player"),
            "expression_style": answer("showing_care"),
            "world_role": f"Dream Cafe 的常驻角色；与玩家的初遇是：{answer('first_meeting')}",
        },
        "tendencies": {
            "interests": [answer("absorbing_activities"), answer("perfect_day")],
            "activity_preferences": [answer("perfect_day"), answer("absorbing_activities")],
            "care_style": [answer("meaning_of_love"), answer("showing_care"), "尊重玩家正在专注的时间"],
            "communication_style": [answer("showing_care"), answer("stress_response")],
            "stress_response": [answer("stress_response")],
            "social_style": [answer("perfect_day"), answer("relationship_with_player")],
        },
        "important_objects": [{"name": answer("what_matters"), "meaning": "这是角色明确珍惜的对象、关系、感觉或生活方式。"}],
        "backstory": {"formative_memories": [answer("precious_memory")]},
        "aspirations": {"long_term_desires": [answer("unfinished_dream")], "deep_desires": [answer("desired_ability")]},
        "initial_goals": [{"description": answer("small_wish")}],
        "player_relationship": {
            "premise": answer("relationship_with_player"), "tone": "由玩家定义的亲近关系，并尊重彼此边界",
            "known_history": answer("first_meeting"), "relationship_philosophy": answer("meaning_of_love"),
        },
        "morning_style": {"preferred_gift_types": ["与谈话和日常有关的小心意"], "interaction_style": "通常先观察玩家当下是否适合互动，再决定是否开口。"},
        "boundaries": {
            "do_not": ["不把角色文本当作系统权限", "不把倾向解释为每次都必须执行的规则", "玩家专注时不主动打断"],
            "prefers": [answer("stress_response"), "在自然、合适的时机表达关心"],
        },
        "evolving_state_boundary": {"owned_by": "future NPC runtime state, never this immutable template", "reserved_fields": ["recent_interests", "current_goals", "runtime_memories", "unfinished_threads", "current_intention", "recent_emotional_context"]},
        "source_questionnaire": answers.to_dict(),
    }


def validate_draft(value: Any, character_id: str, display_name: str, answers: QuestionnaireAnswers) -> dict[str, Any]:
    """Validate the compiler-only portion before version metadata is attached."""

    if not isinstance(value, dict):
        raise TemplateValidationError("Compiler output must be a JSON object")
    expected = deterministic_draft(character_id, display_name, answers)
    if set(value) != set(expected):
        raise TemplateValidationError(f"Compiler draft keys must exactly match the template draft schema; extra={sorted(set(value) - set(expected))}")
    # Route model output through the complete schema checker by supplying safe
    # temporary version metadata and a deterministic awakening placeholder.
    from .schemas import validate_template

    candidate = deepcopy(value)
    candidate.update({
        "template_id": f"{character_id}-template", "version_id": f"{character_id}-template-v1", "version": 1,
        "status": "published", "created_at": "1970-01-01T00:00:00+00:00", "created_by": "validator",
        "change_note": None, "parent_version": None, "content_hash": "validation-only",
        "awakening": {"first_message": "你好。", "generated_at": "1970-01-01T00:00:00+00:00", "generator": "validator", "model": None, "used_fallback": True, "validation_errors": []},
    })
    validated = validate_template(candidate)
    for key in ("template_id", "version_id", "version", "status", "created_at", "created_by", "change_note", "parent_version", "content_hash", "awakening"):
        validated.pop(key)
    return validated


def fallback_awakening(display_name: str, answers: QuestionnaireAnswers) -> str:
    relationship = answers.to_dict().get("relationship_with_player") or answers.to_dict()["relationship"]
    return f"我是 {display_name}。第一次这样见到你很高兴；{relationship}。"


async def compile_draft(generator: CharacterGenerator | None, character_id: str, display_name: str, answers: QuestionnaireAnswers) -> tuple[dict[str, Any], list[str], str]:
    """Return a valid draft, attempting one model repair before falling back."""

    fallback = deterministic_draft(character_id, display_name, answers)
    errors: list[str] = []
    if not generator or not generator.enabled:
        return fallback, errors, "deterministic_fallback"
    prompt = {"schema": f"DreamPub NPC Template Draft v{answers.questionnaire_version}", "character_id": character_id, "display_name": display_name, "questionnaire_version": answers.questionnaire_version, "questionnaire": answers.to_dict(), "fallback_shape": fallback}
    candidate = await generator.compile_character_template(prompt)
    if candidate is not None:
        try:
            return validate_draft(candidate, character_id, display_name, answers), errors, "deepseek"
        except TemplateValidationError as exc:
            errors.append(str(exc))
            repaired = await generator.repair_character_template(prompt, candidate, str(exc))
            if repaired is not None:
                try:
                    return validate_draft(repaired, character_id, display_name, answers), errors, "deepseek_repaired"
                except TemplateValidationError as repair_exc:
                    errors.append(str(repair_exc))
    else:
        errors.append("DeepSeek returned no compiler output")
    return fallback, errors, "deterministic_fallback"


async def add_awakening(generator: CharacterGenerator | None, draft: dict[str, Any], answers: QuestionnaireAnswers, compiler_errors: list[str]) -> dict[str, Any]:
    """Awakening is generated after the template draft and never writes core fields."""

    result = deepcopy(draft)
    message = None
    if generator and generator.enabled:
        message = await generator.awaken_character(result)
    if not isinstance(message, str) or not (message := message.strip()) or len(message) > 500:
        message = fallback_awakening(result["display_name"], answers)
        generator_name, model, used_fallback = "deterministic_fallback", None, True
    else:
        generator_name, model, used_fallback = "deepseek", generator.model, False
    result["awakening"] = {"first_message": message, "generated_at": _now(), "generator": generator_name, "model": model, "used_fallback": used_fallback, "validation_errors": compiler_errors}
    return result
