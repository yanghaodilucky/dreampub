"""Strict, dependency-free schemas for NPC character templates.

The persisted template describes the initial character. Runtime experiences belong
to a separate evolving-state store in a later milestone and must not mutate this
document automatically.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Mapping


class TemplateValidationError(ValueError):
    """Raised when untrusted compiler output is not a character template."""


QUESTIONNAIRE_V1 = (
    ("first_meeting", "玩家第一次遇见 TA 是在哪里？当时是什么情景？"),
    ("favorite_activities", "TA 平时最喜欢做什么？"),
    ("care_expression", "TA 通常怎样表达关心？"),
    ("stress_response", "TA 累了、不开心或需要独处时通常会怎样？"),
    ("treasured_object", "TA 最珍惜的一件小东西是什么？为什么？"),
    ("current_wish", "TA 最近有什么想完成的小愿望或目标？"),
    ("relationship", "TA 和玩家是什么关系？这段关系最核心的感觉是什么？"),
)
QUESTIONNAIRE_V2 = (
    ("first_meeting", "你第一次遇见 TA，是在哪里？那一天发生了什么？"),
    ("perfect_day", "如果 TA 可以完全按照自己的心意度过一天，那会是什么样的一天？"),
    ("absorbing_activities", "TA 最喜欢做什么？有什么事情会让 TA 一做起来就忘记时间？"),
    ("what_matters", "TA 最珍惜什么？可以是一件东西、一段关系、一种感觉，或者一种生活方式。"),
    ("precious_memory", "TA 有没有一段非常珍贵的回忆？如果有，那是什么？"),
    ("unfinished_dream", "TA 有没有一件一直想做、但还没有做到的事情？为什么还没有去做？"),
    ("meaning_of_love", "对 TA 来说，爱一个人意味着什么？"),
    ("showing_care", "TA 通常怎样表达关心？"),
    ("relationship_with_player", "TA 和你是什么关系？这段关系最核心的感觉是什么？"),
    ("stress_response", "TA 累了、难过了，或者想一个人待一会儿时，通常会怎样？"),
    ("desired_ability", "如果 TA 明天醒来，可以获得一种能力，TA 最希望得到什么能力？为什么？"),
    ("small_wish", "TA 最近有没有一个很小、但真的很想完成的愿望？"),
)
QUESTIONNAIRES = {1: QUESTIONNAIRE_V1, 2: QUESTIONNAIRE_V2}


@dataclass(frozen=True)
class QuestionnaireAnswers:
    """A versioned player-authored questionnaire, excluding Awakening."""

    questionnaire_version: int
    values: dict[str, str]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "QuestionnaireAnswers":
        if not isinstance(value, Mapping):
            raise TemplateValidationError("Questionnaire answers must be an object")
        matching_versions = [version for version, questions in QUESTIONNAIRES.items() if set(value) == {key for key, _ in questions}]
        if len(matching_versions) != 1:
            expected = {f"v{version}": [key for key, _ in questions] for version, questions in QUESTIONNAIRES.items()}
            raise TemplateValidationError(f"Questionnaire keys must exactly match one supported questionnaire: {expected}")
        version = matching_versions[0]
        cleaned: dict[str, str] = {}
        for key, _ in QUESTIONNAIRES[version]:
            answer = value[key]
            if not isinstance(answer, str) or not (text := answer.strip()):
                raise TemplateValidationError(f"Questionnaire answer {key!r} must be a non-empty string")
            if len(text) > 1_500:
                raise TemplateValidationError(f"Questionnaire answer {key!r} exceeds 1500 characters")
            cleaned[key] = text
        return cls(questionnaire_version=version, values=cleaned)

    def to_dict(self) -> dict[str, str]:
        return dict(self.values)

    def answer(self, question_id: str) -> str:
        return self.values[question_id]


TEMPLATE_ROOT_KEYS = {
    "template_id", "character_id", "display_name", "version_id", "version", "status",
    "created_at", "created_by", "change_note", "parent_version", "content_hash",
    "core_identity", "tendencies", "important_objects", "initial_goals", "player_relationship",
    "morning_style", "boundaries", "evolving_state_boundary", "awakening", "source_questionnaire",
    "questionnaire_version", "template_schema_version", "backstory", "aspirations",
}
LEGACY_TEMPLATE_ROOT_KEYS = TEMPLATE_ROOT_KEYS - {"questionnaire_version", "template_schema_version", "backstory", "aspirations"}


def _expect_mapping(value: Any, field: str, allowed: set[str], required: set[str]) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise TemplateValidationError(f"{field} must be an object")
    keys = set(value)
    if keys - allowed or required - keys:
        raise TemplateValidationError(f"{field} has invalid keys; missing={sorted(required - keys)}, extra={sorted(keys - allowed)}")
    return dict(value)


def _expect_text(value: Any, field: str, *, allow_empty: bool = False, maximum: int = 2_000) -> str:
    if not isinstance(value, str):
        raise TemplateValidationError(f"{field} must be a string")
    value = value.strip()
    if not value and not allow_empty:
        raise TemplateValidationError(f"{field} cannot be empty")
    if len(value) > maximum:
        raise TemplateValidationError(f"{field} exceeds {maximum} characters")
    return value


def _expect_text_list(value: Any, field: str, *, maximum: int = 12) -> list[str]:
    if not isinstance(value, list) or not value or len(value) > maximum:
        raise TemplateValidationError(f"{field} must be a non-empty list of at most {maximum} strings")
    return [_expect_text(item, f"{field}[]", maximum=600) for item in value]


def validate_template(value: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and normalize a fully versioned template without executing content.

    This deliberately rejects unknown fields, so model output cannot smuggle a
    tool, permission, actor ID, or other runtime instruction into the template.
    """

    root = _expect_mapping(value, "template", TEMPLATE_ROOT_KEYS, LEGACY_TEMPLATE_ROOT_KEYS)
    result = {key: deepcopy(root[key]) for key in root}
    questionnaire = QuestionnaireAnswers.from_mapping(result["source_questionnaire"])
    result.setdefault("questionnaire_version", questionnaire.questionnaire_version)
    result.setdefault("template_schema_version", 1 if questionnaire.questionnaire_version == 1 else 2)
    if not isinstance(result["questionnaire_version"], int) or result["questionnaire_version"] != questionnaire.questionnaire_version:
        raise TemplateValidationError("questionnaire_version must match source_questionnaire")
    if result["questionnaire_version"] not in QUESTIONNAIRES:
        raise TemplateValidationError("Unsupported questionnaire_version")
    if not isinstance(result["template_schema_version"], int) or result["template_schema_version"] not in {1, 2}:
        raise TemplateValidationError("template_schema_version must be 1 or 2")
    if result["questionnaire_version"] == 2:
        if result["template_schema_version"] != 2 or "backstory" not in result or "aspirations" not in result:
            raise TemplateValidationError("Questionnaire v2 templates require schema v2, backstory, and aspirations")
    for key in ("template_id", "character_id", "display_name", "version_id", "status", "created_at", "created_by", "content_hash"):
        result[key] = _expect_text(result[key], key, maximum=200)
    if not isinstance(result["version"], int) or result["version"] < 1:
        raise TemplateValidationError("version must be a positive integer")
    if result["parent_version"] is not None:
        result["parent_version"] = _expect_text(result["parent_version"], "parent_version", maximum=200)
    if result["change_note"] is not None:
        result["change_note"] = _expect_text(result["change_note"], "change_note", maximum=800)
    if result["status"] != "published":
        raise TemplateValidationError("status must be 'published'; active selection is held by the character index")

    core = _expect_mapping(result["core_identity"], "core_identity", {"summary", "temperament", "values", "relationship_premise", "expression_style", "world_role"}, {"summary", "temperament", "values", "relationship_premise", "expression_style", "world_role"})
    for key in ("summary", "temperament", "relationship_premise", "expression_style", "world_role"):
        core[key] = _expect_text(core[key], f"core_identity.{key}")
    core["values"] = _expect_text_list(core["values"], "core_identity.values")
    result["core_identity"] = core

    tendency_keys = {"interests", "activity_preferences", "care_style", "communication_style", "stress_response", "social_style"}
    tendencies = _expect_mapping(result["tendencies"], "tendencies", tendency_keys, tendency_keys)
    for key in tendency_keys:
        tendencies[key] = _expect_text_list(tendencies[key], f"tendencies.{key}")
    result["tendencies"] = tendencies

    if not isinstance(result["important_objects"], list) or not result["important_objects"]:
        raise TemplateValidationError("important_objects must be a non-empty list")
    objects = []
    for item in result["important_objects"]:
        item = _expect_mapping(item, "important_objects[]", {"name", "meaning"}, {"name", "meaning"})
        objects.append({"name": _expect_text(item["name"], "important_objects[].name"), "meaning": _expect_text(item["meaning"], "important_objects[].meaning")})
    result["important_objects"] = objects

    if not isinstance(result["initial_goals"], list) or not result["initial_goals"]:
        raise TemplateValidationError("initial_goals must be a non-empty list")
    goals = []
    for item in result["initial_goals"]:
        item = _expect_mapping(item, "initial_goals[]", {"description"}, {"description"})
        goals.append({"description": _expect_text(item["description"], "initial_goals[].description")})
    result["initial_goals"] = goals

    relationship_keys = {"premise", "tone", "known_history", "relationship_philosophy"}
    required_relationship_keys = relationship_keys if result["questionnaire_version"] == 2 else relationship_keys - {"relationship_philosophy"}
    relationship = _expect_mapping(result["player_relationship"], "player_relationship", relationship_keys, required_relationship_keys)
    for key in relationship:
        relationship[key] = _expect_text(relationship[key], f"player_relationship.{key}")
    result["player_relationship"] = relationship

    if result["questionnaire_version"] == 2:
        backstory = _expect_mapping(result["backstory"], "backstory", {"formative_memories"}, {"formative_memories"})
        if not isinstance(backstory["formative_memories"], list) or len(backstory["formative_memories"]) > 12:
            raise TemplateValidationError("backstory.formative_memories must be a list of at most 12 strings")
        backstory["formative_memories"] = [_expect_text(item, "backstory.formative_memories[]", maximum=800) for item in backstory["formative_memories"]]
        result["backstory"] = backstory
        aspirations = _expect_mapping(result["aspirations"], "aspirations", {"long_term_desires", "deep_desires"}, {"long_term_desires", "deep_desires"})
        aspirations["long_term_desires"] = _expect_text_list(aspirations["long_term_desires"], "aspirations.long_term_desires")
        aspirations["deep_desires"] = _expect_text_list(aspirations["deep_desires"], "aspirations.deep_desires")
        result["aspirations"] = aspirations

    morning = _expect_mapping(result["morning_style"], "morning_style", {"preferred_gift_types", "interaction_style"}, {"preferred_gift_types", "interaction_style"})
    morning["preferred_gift_types"] = _expect_text_list(morning["preferred_gift_types"], "morning_style.preferred_gift_types")
    morning["interaction_style"] = _expect_text(morning["interaction_style"], "morning_style.interaction_style")
    result["morning_style"] = morning

    boundaries = _expect_mapping(result["boundaries"], "boundaries", {"do_not", "prefers"}, {"do_not", "prefers"})
    boundaries["do_not"] = _expect_text_list(boundaries["do_not"], "boundaries.do_not")
    boundaries["prefers"] = _expect_text_list(boundaries["prefers"], "boundaries.prefers")
    result["boundaries"] = boundaries

    evolving = _expect_mapping(result["evolving_state_boundary"], "evolving_state_boundary", {"owned_by", "reserved_fields"}, {"owned_by", "reserved_fields"})
    evolving["owned_by"] = _expect_text(evolving["owned_by"], "evolving_state_boundary.owned_by")
    evolving["reserved_fields"] = _expect_text_list(evolving["reserved_fields"], "evolving_state_boundary.reserved_fields", maximum=16)
    result["evolving_state_boundary"] = evolving

    awakening = _expect_mapping(result["awakening"], "awakening", {"first_message", "generated_at", "generator", "model", "used_fallback", "validation_errors"}, {"first_message", "generated_at", "generator", "model", "used_fallback", "validation_errors"})
    for key in ("first_message", "generated_at", "generator"):
        awakening[key] = _expect_text(awakening[key], f"awakening.{key}", maximum=600)
    if awakening["model"] is not None:
        awakening["model"] = _expect_text(awakening["model"], "awakening.model", maximum=200)
    if not isinstance(awakening["used_fallback"], bool):
        raise TemplateValidationError("awakening.used_fallback must be a boolean")
    if not isinstance(awakening["validation_errors"], list):
        raise TemplateValidationError("awakening.validation_errors must be a list")
    awakening["validation_errors"] = [_expect_text(item, "awakening.validation_errors[]", maximum=500) for item in awakening["validation_errors"]]
    result["awakening"] = awakening

    result["source_questionnaire"] = questionnaire.to_dict()
    return result
