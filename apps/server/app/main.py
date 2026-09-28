import asyncio
import os
from contextlib import asynccontextmanager
from urllib.parse import urlsplit, urlunsplit

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.characters.schemas import TemplateValidationError
from app.characters.service import CharacterTemplateService
from app.characters.storage import CharacterNotFoundError
from app.local_store import LocalStore
from app.settings import configure_environment
from app.world.runtime import run_npc_worker, world

configure_environment()


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.ensure_starter_content()
    worker = asyncio.create_task(run_npc_worker())
    yield
    worker.cancel()


app = FastAPI(title="DreamPub NPC service", lifespan=lifespan)
character_templates = CharacterTemplateService(generator=world.model)
store: LocalStore = world.store
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "deepseek_enabled": world.model.enabled, "npcs": list(world.states)}


def _llm_base_url(value: object) -> str:
    if not isinstance(value, str) or not (value := value.strip()) or len(value) > 300:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="base_url must be a non-empty HTTPS URL")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="base_url must be a plain HTTPS API URL")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


@app.get("/api/llm/settings")
async def llm_settings() -> dict:
    """Return configuration metadata only; an API key is never sent to the webview."""

    return world.llm_status()


@app.put("/api/llm/settings")
async def update_llm_settings(body: dict) -> dict:
    model = _require_text(body, "model", 160)
    base_url = _llm_base_url(body.get("base_url"))
    api_key = body.get("api_key")
    if api_key is not None:
        api_key = _require_text(body, "api_key", 1000)
    try:
        return world.configure_llm(model=model, base_url=base_url, api_key=api_key)
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="The macOS Keychain could not save the API key") from exc


@app.post("/api/llm/test")
async def test_llm_connection() -> dict:
    ok, message = await world.model.test_connection()
    return {"ok": ok, "message": message}


@app.delete("/api/llm/settings")
async def clear_llm_key() -> dict:
    world.clear_llm_key()
    return world.llm_status()


@app.get("/world/cafe")
async def cafe_snapshot() -> dict:
    return world.snapshot()


@app.post("/world/cafe/pause")
async def pause_cafe_world() -> dict:
    return world.set_paused(True)


@app.post("/world/cafe/resume")
async def resume_cafe_world() -> dict:
    return world.set_paused(False)


def _require_text(body: dict, field: str, maximum: int = 200) -> str:
    value = body.get(field)
    if not isinstance(value, str) or not (value := value.strip()) or len(value) > maximum:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"{field} must be a non-empty string up to {maximum} characters")
    return value


@app.get("/api/save")
async def local_save() -> dict:
    """The complete local product projection used by the desktop UI."""

    return {"projects": store.list_projects(), "tasks": store.list_tasks(), "focus_sessions": store.list_focus_sessions(), "active_focus_session": store.active_focus_session()}


@app.post("/api/projects", status_code=201)
async def create_project(body: dict) -> dict:
    return store.create_project(
        name=_require_text(body, "name"), color=_require_text(body, "color", 20),
        start_date=_require_text(body, "start_date", 10), end_date=_require_text(body, "end_date", 10),
    )


@app.patch("/api/projects/{project_id}")
async def update_project(project_id: str, body: dict) -> dict:
    result = store.update_project(project_id, start_date=_require_text(body, "start_date", 10), end_date=_require_text(body, "end_date", 10))
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@app.delete("/api/projects/{project_id}", status_code=204)
async def delete_project(project_id: str) -> None:
    active = store.active_focus_session()
    if active and active["project_id"] == project_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Finish or cancel the active focus session before deleting its project")
    if not store.delete_project(project_id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")


@app.post("/api/tasks", status_code=201)
async def create_task(body: dict) -> dict:
    result = store.create_task(
        project_id=_require_text(body, "project_id", 100), title=_require_text(body, "title"),
        start_date=_require_text(body, "start_date", 10), end_date=_require_text(body, "end_date", 10),
    )
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, body: dict) -> dict:
    status = body.get("status")
    if status is not None and status not in {"next", "done"}:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="status must be next or done")
    result = store.update_task(
        task_id, status=status,
        start_date=body.get("start_date") if isinstance(body.get("start_date"), str) else None,
        end_date=body.get("end_date") if isinstance(body.get("end_date"), str) else None,
    )
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Task not found")
    return result


@app.delete("/api/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str) -> None:
    active = store.active_focus_session()
    if active and active["task_id"] == task_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Finish or cancel the active focus session before deleting its task")
    if not store.delete_task(task_id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Task not found")


@app.post("/api/focus-sessions", status_code=201)
async def start_focus(body: dict) -> dict:
    result = store.start_focus(task_id=_require_text(body, "task_id", 100), seat_id=_require_text(body, "seat_id", 100))
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Task not found")
    task = next((item for item in store.list_tasks() if item["id"] == result["task_id"]), None)
    world.set_player_focus(True, task["title"] if task else None)
    return result


@app.post("/api/focus-sessions/{session_id}/{action}")
async def transition_focus(session_id: str, action: str) -> dict:
    if action not in {"pause", "resume", "finish", "cancel"}:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Unknown focus transition")
    try:
        result = store.transition_focus(session_id, action)
    except ValueError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Focus session not found")
    task = next((item for item in store.list_tasks() if item["id"] == result["task_id"]), None)
    world.set_player_focus(action == "resume", task["title"] if action in {"finish", "cancel"} else None)
    return result


@app.delete("/api/focus-sessions/{session_id}", status_code=204)
async def delete_focus_session(session_id: str) -> None:
    if not store.delete_focus_session(session_id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Only completed focus sessions can be deleted")


def _character_error(exc: Exception):
    from fastapi import HTTPException

    if isinstance(exc, CharacterNotFoundError):
        raise HTTPException(status_code=404, detail="Character or template version not found") from exc
    raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/characters/{character_id}")
async def active_character_template(character_id: str) -> dict:
    try:
        template = character_templates.get_active(character_id)
        return {**template, "is_active": True}
    except (CharacterNotFoundError, TemplateValidationError) as exc:
        _character_error(exc)


@app.get("/characters")
async def characters() -> dict:
    """The local NPC roster. It contains public starters plus player additions."""

    return {"characters": character_templates.list_characters()}


@app.post("/characters", status_code=201)
async def create_character(body: dict) -> dict:
    try:
        profile = character_templates.create_character(
            display_name=_require_text(body, "display_name", 40), role=_require_text(body, "role", 80),
            archetype=_require_text(body, "archetype", 20), color=_require_text(body, "color", 7),
        )
        world.reload_npc_roster()
        await world.broadcast_delta()
        return profile
    except (CharacterNotFoundError, TemplateValidationError, ValueError) as exc:
        _character_error(exc)


@app.get("/characters/{character_id}/versions")
async def character_versions(character_id: str) -> dict:
    try:
        return {"character_id": character_id, "versions": character_templates.list_versions(character_id)}
    except (CharacterNotFoundError, TemplateValidationError) as exc:
        _character_error(exc)


@app.get("/characters/{character_id}/versions/{version}")
async def character_version(character_id: str, version: int) -> dict:
    try:
        template = character_templates.get_version(character_id, version)
        active = character_templates.get_active(character_id)
        return {**template, "is_active": template["version"] == active["version"]}
    except (CharacterNotFoundError, TemplateValidationError) as exc:
        _character_error(exc)


@app.post("/characters/{character_id}/compile")
async def compile_character_template(character_id: str, body: dict) -> dict:
    try:
        save = body.get("save", False)
        if not isinstance(save, bool):
            raise TemplateValidationError("save must be a boolean")
        return await character_templates.compile(character_id, body, save=save)
    except (CharacterNotFoundError, TemplateValidationError) as exc:
        _character_error(exc)


@app.post("/characters/{character_id}/versions/{version}/activate")
async def activate_character_version(character_id: str, version: int) -> dict:
    try:
        template = character_templates.activate(character_id, version)
        return {**template, "is_active": True}
    except (CharacterNotFoundError, TemplateValidationError) as exc:
        _character_error(exc)


@app.post("/characters/{character_id}/versions")
async def save_character_preview(character_id: str, body: dict) -> dict:
    try:
        preview = body.get("template_preview")
        if not isinstance(preview, dict):
            raise TemplateValidationError("template_preview must be an object")
        return character_templates.save_preview(character_id, preview, created_by=str(body.get("created_by") or "local_developer"), change_note=body.get("change_note"))
    except (CharacterNotFoundError, TemplateValidationError) as exc:
        _character_error(exc)


@app.websocket("/ws/world/{world_id}")
async def world_socket(websocket: WebSocket, world_id: str) -> None:
    if world_id != "dream-cafe":
        await websocket.close(code=1008)
        return
    await world.connect(websocket)
    try:
        while True:
            await world.handle_client_message(await websocket.receive_text())
    except WebSocketDisconnect:
        pass
    finally:
        world.disconnect(websocket)
