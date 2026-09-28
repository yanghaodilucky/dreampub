"""Small, durable JSON repository for template versions before PostgreSQL exists."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.local_store import game_data_dir

from .schemas import TemplateValidationError, validate_template


class CharacterNotFoundError(KeyError):
    pass


class CharacterTemplateStorage:
    def __init__(self, root: Path | None = None) -> None:
        if root:
            self.root = root
            return
        self.root = game_data_dir() / "characters"

    def _directory(self, character_id: str) -> Path:
        if not character_id or not character_id.replace("-", "").replace("_", "").isalnum():
            raise TemplateValidationError("character_id must contain only letters, digits, hyphens, or underscores")
        return self.root / character_id

    def _index_path(self, character_id: str) -> Path:
        return self._directory(character_id) / "index.json"

    def _version_path(self, character_id: str, version: int) -> Path:
        if version < 1:
            raise CharacterNotFoundError(f"Unknown version {version}")
        return self._directory(character_id) / "versions" / f"v{version}.json"

    @staticmethod
    def _write_json(path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        temporary.replace(path)

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise CharacterNotFoundError(str(path)) from exc
        except json.JSONDecodeError as exc:
            raise TemplateValidationError(f"Invalid character storage JSON: {path}") from exc
        if not isinstance(value, dict):
            raise TemplateValidationError(f"Character storage object expected: {path}")
        return value

    def index(self, character_id: str) -> dict[str, Any]:
        value = self._read_json(self._index_path(character_id))
        if value.get("character_id") != character_id or not isinstance(value.get("active_version"), int) or not isinstance(value.get("versions"), list):
            raise TemplateValidationError(f"Invalid character index for {character_id}")
        return value

    def list_versions(self, character_id: str) -> list[dict[str, Any]]:
        index = self.index(character_id)
        active = index["active_version"]
        result = []
        for version in index["versions"]:
            template = self.get_version(character_id, version)
            result.append({"version": version, "version_id": template["version_id"], "created_at": template["created_at"], "created_by": template["created_by"], "change_note": template["change_note"], "content_hash": template["content_hash"], "is_active": version == active})
        return result

    def get_version(self, character_id: str, version: int) -> dict[str, Any]:
        template = validate_template(self._read_json(self._version_path(character_id, version)))
        if template["character_id"] != character_id or template["version"] != version:
            raise TemplateValidationError(f"Template identity mismatch at {character_id} v{version}")
        return template

    def get_active(self, character_id: str) -> dict[str, Any]:
        index = self.index(character_id)
        return self.get_version(character_id, index["active_version"])

    def save_new_version(self, template: dict[str, Any], *, activate: bool = True) -> dict[str, Any]:
        template = validate_template(template)
        character_id, version = template["character_id"], template["version"]
        directory = self._directory(character_id)
        index_path = self._index_path(character_id)
        if index_path.exists():
            index = self.index(character_id)
            if version in index["versions"]:
                raise TemplateValidationError(f"Version {version} already exists for {character_id}")
            expected = max(index["versions"]) + 1
            if version != expected:
                raise TemplateValidationError(f"New version must be {expected}, got {version}")
            index["versions"].append(version)
            if activate:
                index["active_version"] = version
        else:
            if version != 1:
                raise TemplateValidationError("First template version must be v1")
            index = {"character_id": character_id, "active_version": 1, "versions": [1]}
        self._write_json(directory / "versions" / f"v{version}.json", template)
        self._write_json(index_path, index)
        return template

    def activate(self, character_id: str, version: int) -> dict[str, Any]:
        index = self.index(character_id)
        self.get_version(character_id, version)
        if version not in index["versions"]:
            raise CharacterNotFoundError(f"Unknown version {version} for {character_id}")
        index["active_version"] = version
        self._write_json(self._index_path(character_id), index)
        return self.get_version(character_id, version)
