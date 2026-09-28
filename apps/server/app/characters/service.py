"""Application service for compiling, previewing, and versioning NPC templates."""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import uuid4

from app.local_store import LocalStore
from .compiler import CharacterGenerator, add_awakening, compile_draft, deterministic_draft, fallback_awakening
from .schemas import QuestionnaireAnswers, TemplateValidationError, validate_template
from .seeds import SEED_CHARACTERS
from .storage import CharacterNotFoundError, CharacterTemplateStorage


class CharacterTemplateService:
    def __init__(self, storage: CharacterTemplateStorage | None = None, generator: CharacterGenerator | None = None, store: LocalStore | None = None) -> None:
        self.storage = storage or CharacterTemplateStorage()
        self.generator = generator
        self.store = store or LocalStore()

    def ensure_seed_templates(self) -> None:
        self.store.ensure_npc_profiles()
        for character_id, seed in SEED_CHARACTERS.items():
            try:
                self.storage.index(character_id)
            except CharacterNotFoundError:
                answers = seed["v1_answers"]
                draft = deterministic_draft(character_id, seed["display_name"], answers)
                draft["awakening"] = {
                    "first_message": fallback_awakening(seed["display_name"], answers),
                    "generated_at": "2026-09-22T00:00:00+00:00", "generator": "deterministic_seed", "model": None,
                    "used_fallback": True, "validation_errors": [],
                }
                template = self._versioned(draft, created_by=seed["created_by"], change_note=seed["v1_change_note"], version=1, parent_version=None, created_at="2026-09-22T00:00:00+00:00")
                self.storage.save_new_version(template)
            try:
                self.storage.get_version(character_id, 2)
            except CharacterNotFoundError:
                answers = seed["v2_answers"]
                draft = deterministic_draft(character_id, seed["display_name"], answers)
                draft["awakening"] = {
                    "first_message": fallback_awakening(seed["display_name"], answers),
                    "generated_at": "2026-09-22T00:00:00+00:00", "generator": "deterministic_seed", "model": None,
                    "used_fallback": True, "validation_errors": [],
                }
                template = self._versioned(draft, created_by=seed["created_by"], change_note="Migrated to Character Questionnaire v2.", version=2, parent_version=f"{character_id}-template-v1", created_at="2026-09-22T00:00:00+00:00")
                # Migration is deliberately non-destructive: existing v1 stays
                # selected until a developer explicitly activates v2.
                self.storage.save_new_version(template, activate=False)

    def list_characters(self) -> list[dict[str, Any]]:
        self.ensure_seed_templates()
        return self.store.list_npc_profiles()

    @staticmethod
    def _new_character_answers(name: str, role: str, archetype: str) -> QuestionnaireAnswers:
        is_staff = archetype == "staff"
        place = "吧台" if is_staff else "靠窗的长桌"
        activity = "调咖啡、整理吧台和研究饮品" if is_staff else "读书、整理笔记和安静工作"
        return QuestionnaireAnswers.from_mapping({
            "first_meeting": f"在 Dream Cafe 的{place}，{name} 以 {role} 的身份和玩家第一次打招呼。",
            "perfect_day": f"在咖啡馆里{activity}，也留一点时间观察来往的人。",
            "absorbing_activities": activity,
            "what_matters": "被尊重的边界、真诚的交流，以及能安心停留的日常。",
            "precious_memory": "第一次在咖啡馆里被认真倾听、也认真倾听别人的时刻。",
            "unfinished_dream": "在这里慢慢找到一件真正想长期做下去的事。",
            "meaning_of_love": "先认真理解，再用不打扰对方节奏的方式陪伴。",
            "showing_care": "先问对方现在是否方便，再用真诚的一句话回应。",
            "relationship_with_player": "与玩家刚刚认识；愿意慢慢建立可靠、彼此尊重的关系。",
            "stress_response": "会暂时安静下来，整理手边的事情，等准备好再回来。",
            "desired_ability": "希望能更好地理解眼前人的需要，让陪伴恰到好处。",
            "small_wish": "今天在咖啡馆里完成一件小而确定的事。",
        })

    def create_character(self, *, display_name: str, role: str, archetype: str, color: str) -> dict[str, Any]:
        self.ensure_seed_templates()
        if archetype not in {"staff", "guest"}:
            raise TemplateValidationError("archetype must be staff or guest")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise TemplateValidationError("color must be a #RRGGBB value")
        if not display_name or len(display_name) > 40 or not role or len(role) > 80:
            raise TemplateValidationError("display_name and role must be non-empty and within their length limits")
        if len(self.store.list_npc_profiles()) >= 6:
            raise TemplateValidationError("The cafe currently supports up to six NPCs")
        stem = re.sub(r"[^a-z0-9]+", "-", display_name.lower()).strip("-")[:24] or "npc"
        character_id = f"{stem}-{uuid4().hex[:6]}"
        profile = self.store.create_npc_profile(npc_id=character_id, name=display_name, color=color.lower(), role=role, archetype=archetype)
        answers = self._new_character_answers(display_name, role, archetype)
        draft = deterministic_draft(character_id, display_name, answers)
        draft["awakening"] = {
            "first_message": fallback_awakening(display_name, answers), "generated_at": datetime.now(timezone.utc).isoformat(),
            "generator": "deterministic_seed", "model": None, "used_fallback": True, "validation_errors": [],
        }
        self.storage.save_new_version(self._versioned(draft, created_by="local_player", change_note="Created in the local NPC roster.", version=1, parent_version=None))
        return profile

    @staticmethod
    def _content_hash(draft: Mapping[str, Any]) -> str:
        stable = deepcopy(dict(draft))
        if "awakening" in stable:
            # Provenance changes on every compile attempt, but it is not character
            # content. Hash the actual first message, not transport metadata.
            stable["awakening"] = {"first_message": stable["awakening"].get("first_message", "")}
        raw = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _versioned(self, draft: dict[str, Any], *, created_by: str, change_note: str | None, version: int, parent_version: str | None, created_at: str | None = None) -> dict[str, Any]:
        character_id = draft["character_id"]
        result = deepcopy(draft)
        result.update({
            "template_id": f"{character_id}-template", "version_id": f"{character_id}-template-v{version}", "version": version,
            "status": "published", "created_at": created_at or datetime.now(timezone.utc).isoformat(), "created_by": created_by,
            "change_note": change_note, "parent_version": parent_version, "content_hash": self._content_hash(draft),
        })
        return validate_template(result)

    async def compile(self, character_id: str, payload: Mapping[str, Any], *, save: bool = False) -> dict[str, Any]:
        self.ensure_seed_templates()
        if character_id not in {item["id"] for item in self.store.list_npc_profiles()}:
            raise CharacterNotFoundError(character_id)
        answers = QuestionnaireAnswers.from_mapping(payload.get("answers", {}))
        display_name = payload.get("display_name") or self.get_active(character_id)["display_name"]
        if not isinstance(display_name, str) or not display_name.strip():
            raise TemplateValidationError("display_name must be a non-empty string")
        display_name = display_name.strip()
        draft, errors, compiler_name = await compile_draft(self.generator, character_id, display_name, answers)
        draft = await add_awakening(self.generator, draft, answers, errors)
        if compiler_name != "deepseek":
            draft["awakening"]["validation_errors"] = errors
        if not save:
            return {"saved": False, "compiler": compiler_name, "template_preview": draft}
        current = self.get_active(character_id)
        content_hash = self._content_hash(draft)
        for item in self.storage.list_versions(character_id):
            if item["content_hash"] == content_hash:
                return {"saved": False, "duplicate_of_version": item["version"], "template": self.storage.get_version(character_id, item["version"])}
        next_version = max(item["version"] for item in self.storage.list_versions(character_id)) + 1
        template = self._versioned(draft, created_by=str(payload.get("created_by") or "local_developer"), change_note=payload.get("change_note"), version=next_version, parent_version=current["version_id"])
        self.storage.save_new_version(template)
        return {"saved": True, "compiler": compiler_name, "template": template}

    def save_preview(self, character_id: str, preview: Mapping[str, Any], *, created_by: str = "local_developer", change_note: str | None = None) -> dict[str, Any]:
        """Persist exactly the reviewed draft instead of compiling it a second time."""
        self.ensure_seed_templates()
        if character_id not in {item["id"] for item in self.store.list_npc_profiles()} or preview.get("character_id") != character_id:
            raise CharacterNotFoundError(character_id)
        current = self.get_active(character_id)
        content_hash = self._content_hash(preview)
        for item in self.storage.list_versions(character_id):
            if item["content_hash"] == content_hash:
                return {"saved": False, "duplicate_of_version": item["version"], "template": self.storage.get_version(character_id, item["version"])}
        next_version = max(item["version"] for item in self.storage.list_versions(character_id)) + 1
        template = self._versioned(dict(preview), created_by=created_by, change_note=change_note, version=next_version, parent_version=current["version_id"])
        self.storage.save_new_version(template)
        return {"saved": True, "template": template}

    def get_active(self, character_id: str) -> dict[str, Any]:
        self.ensure_seed_templates()
        return self.storage.get_active(character_id)

    def get_version(self, character_id: str, version: int) -> dict[str, Any]:
        self.ensure_seed_templates()
        return self.storage.get_version(character_id, version)

    def list_versions(self, character_id: str) -> list[dict[str, Any]]:
        self.ensure_seed_templates()
        return self.storage.list_versions(character_id)

    def activate(self, character_id: str, version: int) -> dict[str, Any]:
        self.ensure_seed_templates()
        return self.storage.activate(character_id, version)

    def get_active_or_none(self, character_id: str) -> dict[str, Any] | None:
        try:
            return self.get_active(character_id)
        except (CharacterNotFoundError, TemplateValidationError):
            return None
