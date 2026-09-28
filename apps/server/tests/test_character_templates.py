from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import AsyncMock

from app.characters.compiler import deterministic_draft
from app.characters.schemas import QUESTIONNAIRE_V2, QuestionnaireAnswers, TemplateValidationError, validate_template
from app.characters.seeds import SEED_CHARACTERS
from app.characters.service import CharacterTemplateService
from app.characters.storage import CharacterTemplateStorage


class CharacterTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.previous_data_dir = os.environ.get("DREAMPUB_DATA_DIR")
        os.environ["DREAMPUB_DATA_DIR"] = str(Path(self.temp.name) / "game-data")
        self.storage = CharacterTemplateStorage(Path(self.temp.name) / "characters")
        self.service = CharacterTemplateService(storage=self.storage)
        self.service.ensure_seed_templates()

    def tearDown(self) -> None:
        if self.previous_data_dir is None:
            os.environ.pop("DREAMPUB_DATA_DIR", None)
        else:
            os.environ["DREAMPUB_DATA_DIR"] = self.previous_data_dir
        self.temp.cleanup()

    def test_questionnaire_v2_has_exactly_twelve_stable_player_questions(self) -> None:
        ids = [question_id for question_id, _ in QUESTIONNAIRE_V2]
        self.assertEqual(len(ids), 12)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids, ["first_meeting", "perfect_day", "absorbing_activities", "what_matters", "precious_memory", "unfinished_dream", "meaning_of_love", "showing_care", "relationship_with_player", "stress_response", "desired_ability", "small_wish"])
        self.assertNotIn("awakening", ids)

    def test_v1_remains_readable_and_v2_is_non_active_seed_history(self) -> None:
        for character_id in ("noah", "mia"):
            v1 = self.service.get_version(character_id, 1)
            v2 = self.service.get_version(character_id, 2)
            self.assertEqual(v1["questionnaire_version"], 1)
            self.assertEqual(v2["questionnaire_version"], 2)
            self.assertEqual(v2["template_schema_version"], 2)
            self.assertEqual(v2["parent_version"], f"{character_id}-template-v1")
            self.assertEqual(self.service.get_active(character_id)["version"], 1)

    def test_v2_schema_persists_backstory_aspirations_and_relationship_philosophy(self) -> None:
        template = self.service.get_version("noah", 2)
        self.assertTrue(template["backstory"]["formative_memories"])
        self.assertTrue(template["aspirations"]["long_term_desires"])
        self.assertTrue(template["aspirations"]["deep_desires"])
        self.assertTrue(template["player_relationship"]["relationship_philosophy"])

    def test_invalid_questionnaire_is_rejected(self) -> None:
        answers = SEED_CHARACTERS["noah"]["v2_answers"].to_dict()
        answers.pop("small_wish")
        with self.assertRaises(TemplateValidationError):
            QuestionnaireAnswers.from_mapping(answers)

    def test_v2_fallback_compiles_without_permissions_or_scores(self) -> None:
        answers = SEED_CHARACTERS["mia"]["v2_answers"]
        preview = asyncio.run(self.service.compile("mia", {"answers": answers.to_dict()}, save=False))
        template = preview["template_preview"]
        self.assertEqual(preview["compiler"], "deterministic_fallback")
        self.assertEqual(template["questionnaire_version"], 2)
        self.assertEqual(template["aspirations"]["deep_desires"], [answers.answer("desired_ability")])
        self.assertNotIn("permissions", template)
        self.assertNotIn("affection", str(template).lower())
        self.assertNotIn("relationship_score", str(template).lower())

    def test_v2_save_creates_new_history_without_overwriting_v1_or_v2(self) -> None:
        answers = SEED_CHARACTERS["noah"]["v2_answers"].to_dict()
        answers["small_wish"] = "完成一页目录校对后，和玩家分享一句值得留下的话。"
        saved = asyncio.run(self.service.compile("noah", {"answers": answers, "created_by": "test", "change_note": "test v3"}, save=True))
        self.assertTrue(saved["saved"])
        self.assertEqual(saved["template"]["version"], 3)
        self.assertEqual(self.service.get_version("noah", 1)["questionnaire_version"], 1)
        self.assertEqual(self.service.get_version("noah", 2)["questionnaire_version"], 2)
        self.assertEqual(self.service.get_active("noah")["version"], 3)
        self.service.activate("noah", 1)
        self.assertEqual(self.service.get_active("noah")["version"], 1)
        self.service.activate("noah", 2)
        self.assertEqual(self.service.get_active("noah")["version"], 2)

    def test_identical_v2_content_is_a_noop(self) -> None:
        answers = SEED_CHARACTERS["mia"]["v2_answers"].to_dict()
        result = asyncio.run(self.service.compile("mia", {"answers": answers}, save=True))
        self.assertFalse(result["saved"])
        self.assertEqual(result["duplicate_of_version"], 2)

    def test_awakening_fallback_preserves_core_and_known_history(self) -> None:
        answers = SEED_CHARACTERS["noah"]["v2_answers"]
        preview = asyncio.run(self.service.compile("noah", {"answers": answers.to_dict()}, save=False))
        template = preview["template_preview"]
        expected = deterministic_draft("noah", "Noah", answers)
        self.assertTrue(template["awakening"]["used_fallback"])
        self.assertEqual(template["core_identity"], expected["core_identity"])
        self.assertEqual(template["player_relationship"]["known_history"], answers.answer("first_meeting"))
        self.assertTrue(template["awakening"]["first_message"].startswith("我是 Noah"))

    def test_schema_rejects_missing_v2_fields(self) -> None:
        template = deepcopy(self.service.get_version("mia", 2))
        template.pop("aspirations")
        with self.assertRaises(TemplateValidationError):
            validate_template(template)

    def test_active_template_lookup_has_a_safe_missing_template_fallback(self) -> None:
        self.assertEqual(self.service.get_active_or_none("noah")["character_id"], "noah")
        self.assertIsNone(self.service.get_active_or_none("missing-character"))

    def test_player_can_add_a_persistent_npc_with_a_first_template(self) -> None:
        profile = self.service.create_character(
            display_name="River", role="Dream Cafe 的夜间常客", archetype="guest", color="#88aadd",
        )
        self.assertIn(profile, self.service.list_characters())
        template = self.service.get_active(profile["id"])
        self.assertEqual(template["display_name"], "River")
        self.assertEqual(template["version"], 1)

    def test_runtime_accepts_active_v1_and_v2_templates(self) -> None:
        from app.agents.profiles import NPC_PROFILES
        from app.world.runtime import CafeWorld

        world = CafeWorld()
        world.model.api_key = ""  # Keep this test deterministic and offline.
        world.character_templates = self.service
        for version in (1, 2):
            self.service.activate("noah", version)
            self.assertEqual(world.character_templates.get_active("noah")["version"], version)
            asyncio.run(world.apply_schedule(NPC_PROFILES["noah"], world.now()))

    def test_reviewed_preview_can_be_saved_without_recompiling(self) -> None:
        answers = SEED_CHARACTERS["mia"]["v2_answers"].to_dict()
        answers["small_wish"] = "把今天的新配方写进笔记，等玩家有空时分享。"
        preview = asyncio.run(self.service.compile("mia", {"answers": answers}, save=False))["template_preview"]
        saved = self.service.save_preview("mia", preview, created_by="test", change_note="saved reviewed preview")
        self.assertTrue(saved["saved"])
        self.assertEqual(saved["template"]["version"], 3)
        self.assertEqual(saved["template"]["awakening"], preview["awakening"])

    def test_template_controls_fallback_dialogue_and_greeting(self) -> None:
        from app.agents.profiles import NPC_PROFILES
        from app.world.runtime import CafeWorld

        answers = SEED_CHARACTERS["mia"]["v2_answers"].to_dict()
        answers["showing_care"] = "我会先问你今天最想被怎样陪伴。"
        answers["meaning_of_love"] = "爱是先认真听完，再一起决定下一步。"
        preview = asyncio.run(self.service.compile("mia", {"answers": answers}, save=False))["template_preview"]
        self.service.save_preview("mia", preview)
        world = CafeWorld()
        world.character_templates = self.service
        profile = NPC_PROFILES["mia"]
        self.assertIn("今天最想被怎样陪伴", world.template_greeting(profile))
        fallback = world.template_fallback_reply(profile)
        self.assertIn("今天最想被怎样陪伴", fallback)
        self.assertIn("先认真听完", fallback)
        self.assertNotIn("先喝口水", fallback)

    def test_duplicate_chat_commands_produce_one_reply(self) -> None:
        from app.world.runtime import CafeWorld

        world = CafeWorld()
        world.model.reply = AsyncMock(return_value="我正在整理今天的思路。")
        spoken: list[tuple[str, str]] = []

        async def capture_speech(npc_id: str, content: str, emotion: str = "warm") -> None:
            spoken.append((npc_id, content))

        world.speak = capture_speech
        first = {"kind": "npc.message", "message_id": "request-1", "content": "你在干啥？"}
        duplicate_id = {"kind": "npc.message", "message_id": "request-2", "content": "你在干啥？"}
        asyncio.run(world.handle_client_message(__import__("json").dumps(first)))
        asyncio.run(world.handle_client_message(__import__("json").dumps(first)))
        asyncio.run(world.handle_client_message(__import__("json").dumps(duplicate_id)))
        self.assertEqual(spoken, [(spoken[0][0], "我正在整理今天的思路。")])
        self.assertEqual(world.model.reply.await_count, 1)


if __name__ == "__main__":
    unittest.main()
