import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.characters.schemas import TemplateValidationError
from app.characters.service import CharacterTemplateService
from app.characters.storage import CharacterNotFoundError
from app.settings import configure_environment
from app.world.runtime import run_npc_worker, world

configure_environment()


@asynccontextmanager
async def lifespan(_: FastAPI):
    worker = asyncio.create_task(run_npc_worker())
    yield
    worker.cancel()


app = FastAPI(title="DreamPub NPC service", lifespan=lifespan)
character_templates = CharacterTemplateService(generator=world.model)
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


@app.get("/world/cafe")
async def cafe_snapshot() -> dict:
    return world.snapshot()


@app.post("/world/cafe/pause")
async def pause_cafe_world() -> dict:
    return world.set_paused(True)


@app.post("/world/cafe/resume")
async def resume_cafe_world() -> dict:
    return world.set_paused(False)


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
