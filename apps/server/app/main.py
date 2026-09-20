import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.settings import configure_environment
from app.world.runtime import run_npc_worker, world

configure_environment()


@asynccontextmanager
async def lifespan(_: FastAPI):
    worker = asyncio.create_task(run_npc_worker())
    yield
    worker.cancel()


app = FastAPI(title="DreamPub NPC service", lifespan=lifespan)
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


@app.websocket("/ws/world/{world_id}")
async def world_socket(websocket: WebSocket, world_id: str) -> None:
    if world_id != "dream-cafe":
        await websocket.close(code=1008)
        return
    await world.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        world.disconnect(websocket)
