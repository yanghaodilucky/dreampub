"""Single-player SQLite save game for DreamPub.

The desktop build runs one local server for one player.  SQLite therefore gives
the game durable saves without requiring an account, network connection, or a
separate database service.
"""

from __future__ import annotations

import os
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def game_data_dir() -> Path:
    """Return a user-owned save directory, overridable for development/tests."""

    configured = os.getenv("DREAMPUB_DATA_DIR")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / "Library" / "Application Support" / "DreamPub"


class LocalStore:
    def __init__(self, database_path: Path | None = None) -> None:
        self.database_path = database_path or game_data_dir() / "dreampub.sqlite3"
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('next', 'done')),
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS focus_sessions (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    seat_id TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    running_since TEXT,
                    ended_at TEXT,
                    accumulated_seconds INTEGER NOT NULL DEFAULT 0 CHECK(accumulated_seconds >= 0),
                    state TEXT NOT NULL CHECK(state IN ('running', 'paused', 'finished', 'cancelled')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS one_active_focus_session
                    ON focus_sessions(1) WHERE state IN ('running', 'paused');
                CREATE TABLE IF NOT EXISTS npc_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    npc_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS npc_memories_by_npc
                    ON npc_memories(npc_id, id DESC);
                CREATE TABLE IF NOT EXISTS npc_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL,
                    role TEXT NOT NULL,
                    archetype TEXT NOT NULL CHECK(archetype IN ('staff', 'guest')),
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS world_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS game_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

    def ensure_npc_profiles(self) -> None:
        """Create only the public starter roster; never import developer drafts."""

        from app.agents.profiles import DEFAULT_NPC_ROWS

        with self.connection() as connection:
            for profile in DEFAULT_NPC_ROWS:
                connection.execute(
                    "INSERT OR IGNORE INTO npc_profiles(id, name, color, role, archetype, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (profile["id"], profile["name"], profile["color"], profile["role"], profile["archetype"], utc_now()),
                )

    def list_npc_profiles(self) -> list[dict[str, Any]]:
        self.ensure_npc_profiles()
        with self.connection() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM npc_profiles ORDER BY created_at, id")]

    def create_npc_profile(self, *, npc_id: str, name: str, color: str, role: str, archetype: str) -> dict[str, Any]:
        if archetype not in {"staff", "guest"}:
            raise ValueError("archetype must be staff or guest")
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO npc_profiles(id, name, color, role, archetype, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (npc_id, name, color, role, archetype, utc_now()),
            )
            return self._row(connection.execute("SELECT * FROM npc_profiles WHERE id = ?", (npc_id,)).fetchone()) or {}

    def llm_settings(self) -> dict[str, str]:
        with self.connection() as connection:
            rows = connection.execute("SELECT key, value FROM game_settings WHERE key IN ('llm_model', 'llm_base_url')").fetchall()
        values = {str(row["key"]): str(row["value"]) for row in rows}
        return {
            "model": values.get("llm_model", "deepseek-chat"),
            "base_url": values.get("llm_base_url", "https://api.deepseek.com"),
        }

    def update_llm_settings(self, *, model: str, base_url: str) -> None:
        with self.connection() as connection:
            connection.execute("INSERT INTO game_settings(key, value) VALUES ('llm_model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (model,))
            connection.execute("INSERT INTO game_settings(key, value) VALUES ('llm_base_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (base_url,))

    @staticmethod
    def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row else None

    def list_projects(self) -> list[dict[str, Any]]:
        with self.connection() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM projects ORDER BY created_at")]

    def ensure_starter_content(self) -> None:
        """Give a new offline save one usable project and focus task."""

        with self.connection() as connection:
            if connection.execute("SELECT 1 FROM projects LIMIT 1").fetchone():
                return
            today = date.today()
            project_id, now = "project-dreampub", utc_now()
            connection.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)",
                (project_id, "我的 Dream Cafe", "#f39a6b", (today - timedelta(days=1)).isoformat(), (today + timedelta(days=14)).isoformat(), now, now),
            )
            starter_tasks = (
                ("task-settle-in", "在 Dream Cafe 完成第一次专注", today.isoformat(), (today + timedelta(days=2)).isoformat()),
                ("task-character", "为 NPC 写下人物设定", today.isoformat(), (today + timedelta(days=7)).isoformat()),
            )
            for task_id, title, start_date, end_date in starter_tasks:
                connection.execute("INSERT INTO tasks VALUES (?, ?, ?, 'next', ?, ?, ?, ?)", (task_id, project_id, title, start_date, end_date, now, now))

    def create_project(self, *, name: str, color: str, start_date: str, end_date: str) -> dict[str, Any]:
        now, project_id = utc_now(), str(uuid4())
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)",
                (project_id, name, color, start_date, end_date, now, now),
            )
            return self._row(connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()) or {}

    def update_project(self, project_id: str, *, start_date: str, end_date: str) -> dict[str, Any] | None:
        with self.connection() as connection:
            connection.execute("UPDATE projects SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?", (start_date, end_date, utc_now(), project_id))
            return self._row(connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone())

    def delete_project(self, project_id: str) -> bool:
        with self.connection() as connection:
            return connection.execute("DELETE FROM projects WHERE id = ?", (project_id,)).rowcount > 0

    def list_tasks(self) -> list[dict[str, Any]]:
        with self.connection() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM tasks ORDER BY created_at")]

    def create_task(self, *, project_id: str, title: str, start_date: str, end_date: str) -> dict[str, Any] | None:
        now, task_id = utc_now(), str(uuid4())
        with self.connection() as connection:
            if not connection.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
                return None
            connection.execute(
                "INSERT INTO tasks VALUES (?, ?, ?, 'next', ?, ?, ?, ?)",
                (task_id, project_id, title, start_date, end_date, now, now),
            )
            return self._row(connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())

    def update_task(self, task_id: str, *, status: str | None = None, start_date: str | None = None, end_date: str | None = None) -> dict[str, Any] | None:
        with self.connection() as connection:
            current = self._row(connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
            if not current:
                return None
            connection.execute(
                "UPDATE tasks SET status = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?",
                (status or current["status"], start_date or current["start_date"], end_date or current["end_date"], utc_now(), task_id),
            )
            return self._row(connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())

    def delete_task(self, task_id: str) -> bool:
        with self.connection() as connection:
            return connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,)).rowcount > 0

    @staticmethod
    def _elapsed(row: dict[str, Any], now: datetime | None = None) -> int:
        total = int(row["accumulated_seconds"])
        if row["state"] != "running" or not row["running_since"]:
            return total
        since = datetime.fromisoformat(row["running_since"])
        return total + max(0, int(((now or datetime.now(UTC)) - since).total_seconds()))

    def _focus_view(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        result = self._row(row)
        if result:
            result["duration_seconds"] = self._elapsed(result)
        return result

    def list_focus_sessions(self) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute("SELECT * FROM focus_sessions ORDER BY started_at DESC").fetchall()
            return [self._focus_view(row) or {} for row in rows]

    def delete_focus_session(self, session_id: str) -> bool:
        with self.connection() as connection:
            return connection.execute("DELETE FROM focus_sessions WHERE id = ? AND state IN ('finished', 'cancelled')", (session_id,)).rowcount > 0

    def active_focus_session(self) -> dict[str, Any] | None:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM focus_sessions WHERE state IN ('running', 'paused') LIMIT 1").fetchone()
            return self._focus_view(row)

    def start_focus(self, *, task_id: str, seat_id: str) -> dict[str, Any] | None:
        now, session_id = utc_now(), str(uuid4())
        with self.connection() as connection:
            task = self._row(connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
            if not task:
                return None
            if connection.execute("SELECT 1 FROM focus_sessions WHERE state IN ('running', 'paused')").fetchone():
                raise ValueError("A focus session is already active")
            connection.execute(
                "INSERT INTO focus_sessions VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 'running', ?, ?)",
                (session_id, task_id, task["project_id"], seat_id, now, now, now, now),
            )
            return self._focus_view(connection.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone())

    def transition_focus(self, session_id: str, action: str) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        with self.connection() as connection:
            row = self._row(connection.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone())
            if not row:
                return None
            if action == "pause" and row["state"] == "running":
                elapsed = self._elapsed(row, now)
                connection.execute("UPDATE focus_sessions SET accumulated_seconds = ?, running_since = NULL, state = 'paused', updated_at = ? WHERE id = ?", (elapsed, now.isoformat(), session_id))
            elif action == "resume" and row["state"] == "paused":
                connection.execute("UPDATE focus_sessions SET running_since = ?, state = 'running', updated_at = ? WHERE id = ?", (now.isoformat(), now.isoformat(), session_id))
            elif action in {"finish", "cancel"} and row["state"] in {"running", "paused"}:
                elapsed = self._elapsed(row, now)
                state = "finished" if action == "finish" else "cancelled"
                connection.execute("UPDATE focus_sessions SET accumulated_seconds = ?, running_since = NULL, ended_at = ?, state = ?, updated_at = ? WHERE id = ?", (elapsed, now.isoformat(), state, now.isoformat(), session_id))
            else:
                raise ValueError(f"Cannot {action} a {row['state']} focus session")
            return self._focus_view(connection.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone())

    def add_npc_memory(self, npc_id: str, kind: str, content: str) -> None:
        with self.connection() as connection:
            connection.execute("INSERT INTO npc_memories (npc_id, kind, content, created_at) VALUES (?, ?, ?, ?)", (npc_id, kind, content[:1000], utc_now()))
            connection.execute("DELETE FROM npc_memories WHERE npc_id = ? AND id NOT IN (SELECT id FROM npc_memories WHERE npc_id = ? ORDER BY id DESC LIMIT 80)", (npc_id, npc_id))

    def npc_memories(self, npc_id: str, limit: int = 12) -> list[str]:
        with self.connection() as connection:
            rows = connection.execute("SELECT content FROM npc_memories WHERE npc_id = ? ORDER BY id DESC LIMIT ?", (npc_id, limit)).fetchall()
            return [str(row["content"]) for row in reversed(rows)]

    def add_world_event(self, kind: str, payload: dict[str, Any]) -> None:
        with self.connection() as connection:
            connection.execute("INSERT INTO world_events (kind, payload, created_at) VALUES (?, ?, ?)", (kind, json.dumps(payload, ensure_ascii=False), utc_now()))
            connection.execute("DELETE FROM world_events WHERE id NOT IN (SELECT id FROM world_events ORDER BY id DESC LIMIT 1000)")
