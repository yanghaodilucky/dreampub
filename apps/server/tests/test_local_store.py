from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.local_store import LocalStore


class LocalStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "DreamPub.sqlite3"
        self.store = LocalStore(self.path)
        self.project = self.store.create_project(name="写小说", color="#f39a6b", start_date="2026-09-01", end_date="2026-09-30")
        self.task = self.store.create_task(project_id=self.project["id"], title="完成第一章", start_date="2026-09-01", end_date="2026-09-08")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_focus_state_machine_persists_and_allows_one_active_session(self) -> None:
        first = self.store.start_focus(task_id=self.task["id"], seat_id="window-two-01-north")
        self.assertEqual(first["state"], "running")
        self.assertEqual(self.store.active_focus_session()["id"], first["id"])
        with self.assertRaises(ValueError):
            self.store.start_focus(task_id=self.task["id"], seat_id="window-two-01-south")
        paused = self.store.transition_focus(first["id"], "pause")
        self.assertEqual(paused["state"], "paused")
        resumed = self.store.transition_focus(first["id"], "resume")
        self.assertEqual(resumed["state"], "running")
        finished = self.store.transition_focus(first["id"], "finish")
        self.assertEqual(finished["state"], "finished")
        self.assertIsNone(self.store.active_focus_session())
        self.assertEqual(self.store.list_focus_sessions()[0]["id"], first["id"])

    def test_tasks_projects_and_npc_memories_survive_new_store_instance(self) -> None:
        self.store.update_task(self.task["id"], status="done")
        self.store.add_npc_memory("evan", "conversation", "用户说：今天想安静地完成第一章。")
        reloaded = LocalStore(self.path)
        self.assertEqual(reloaded.list_projects()[0]["name"], "写小说")
        self.assertEqual(reloaded.list_tasks()[0]["status"], "done")
        self.assertEqual(reloaded.npc_memories("evan"), ["用户说：今天想安静地完成第一章。"])

    def test_deleting_a_project_removes_its_tasks_and_focus_history(self) -> None:
        self.store.start_focus(task_id=self.task["id"], seat_id="window-two-01-north")
        self.assertTrue(self.store.delete_project(self.project["id"]))
        self.assertEqual(self.store.list_tasks(), [])
        self.assertEqual(self.store.list_focus_sessions(), [])


if __name__ == "__main__":
    unittest.main()
