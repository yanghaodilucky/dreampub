import asyncio
import os
import random
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from app.agents.deepseek import DeepSeekClient
from app.agents.profiles import NPC_PROFILES, NpcProfile


CAFE_LOCATION = "dream-cafe"
ANCHORS = {
    "coffee_bar": (1450, 905), "cleaning": (1580, 1160), "reading": (895, 910),
    "working": (1160, 1050), "rest": (1470, 1268), "exit": (740, 770),
}
ACTIVITIES = {
    "make_coffee": ("coffee_bar", "调咖啡", "working"), "clean": ("cleaning", "打扫卫生", "working"),
    "read": ("reading", "读报", "working"), "work": ("working", "办公", "working"),
    "rest": ("rest", "休息", "break"), "chat": ("rest", "聊天", "break"),
    "leave": ("exit", "外出中", "offstage"), "return": ("coffee_bar", "回到咖啡馆", "moving"),
}


@dataclass
class NpcState:
    actor_id: str
    actor_kind: str
    location_id: str
    x: float
    y: float
    facing: str
    state: str
    focus_session_id: None
    activity: str
    visible: bool


class CafeWorld:
    def __init__(self) -> None:
        self.revision = 0
        self.stream_id = "cafe-runtime-v1"
        self.clients: set = set()
        self.model = DeepSeekClient()
        self.states = {
            profile.npc_id: NpcState(profile.npc_id, "npc", CAFE_LOCATION, *profile.initial_position, "down", "idle", None, profile.initial_activity, True)
            for profile in NPC_PROFILES.values()
        }
        self.memories: dict[str, list[str]] = {npc_id: [] for npc_id in NPC_PROFILES}

    def snapshot(self) -> dict:
        return {
            "schema_version": 1, "kind": "snapshot", "world_id": CAFE_LOCATION, "location_id": CAFE_LOCATION,
            "stream_id": self.stream_id, "last_sequence": 0, "revision": self.revision,
            "server_time": datetime.now(UTC).isoformat(), "timezone": "Asia/Shanghai", "map_id": CAFE_LOCATION,
            "entities": [asdict(state) for state in self.states.values()], "anchors": [], "furniture": [], "focus_sessions": [],
        }

    async def connect(self, websocket) -> None:
        await websocket.accept()
        self.clients.add(websocket)
        await websocket.send_json(self.snapshot())

    def disconnect(self, websocket) -> None:
        self.clients.discard(websocket)

    async def broadcast_delta(self) -> None:
        self.revision += 1
        message = {
            "schema_version": 1, "kind": "state.delta", "world_id": CAFE_LOCATION, "location_id": CAFE_LOCATION,
            "stream_id": self.stream_id, "revision": self.revision, "server_time": datetime.now(UTC).isoformat(),
            "entities": [asdict(state) for state in self.states.values()], "removed_actor_ids": [],
        }
        stale = []
        for client in self.clients:
            try:
                await client.send_json(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.disconnect(client)

    async def tick(self) -> None:
        for profile in NPC_PROFILES.values():
            action = await self.model.choose_action(profile, self.memories[profile.npc_id])
            self.apply_action(profile, action["action"] if action else self.rule_action(profile))
        await self.broadcast_delta()

    def rule_action(self, profile: NpcProfile) -> str:
        hour = datetime.now().hour
        if profile.npc_id == "loopy":
            return random.choice(("make_coffee", "clean", "rest") if 8 <= hour < 20 else ("leave", "return"))
        return random.choice(("read", "work", "rest", "leave", "return"))

    def apply_action(self, profile: NpcProfile, action: str) -> None:
        anchor, activity, state = ACTIVITIES.get(action, ACTIVITIES["rest"])
        npc = self.states[profile.npc_id]
        if not npc.visible and action != "return":
            action = "return"
            anchor, activity, state = ACTIVITIES[action]
        if action == "return" and npc.visible:
            action = "make_coffee" if profile.npc_id == "loopy" else "read"
            anchor, activity, state = ACTIVITIES[action]
        npc.x, npc.y = ANCHORS[anchor]
        npc.activity, npc.state = activity, state
        npc.visible = action != "leave"
        self.memories[profile.npc_id].append(f"{datetime.now().strftime('%H:%M')}：{activity}")
        del self.memories[profile.npc_id][:-12]


world = CafeWorld()


async def run_npc_worker() -> None:
    delay = max(10, int(os.getenv("NPC_TICK_SECONDS", "25")))
    while True:
        await asyncio.sleep(delay)
        await world.tick()
