import asyncio
import json
import os
import random
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.agents.deepseek import DeepSeekClient
from app.agents.profiles import NPC_PROFILES, NpcProfile


CAFE_LOCATION = "dream-cafe"
SHANGHAI = ZoneInfo("Asia/Shanghai")
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
ACTIVITY_MINUTES = {"make_coffee": (28, 50), "clean": (16, 28), "read": (35, 70), "work": (45, 90), "rest": (12, 25), "chat": (8, 16)}


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
        self.sequence = 0
        self.stream_id = "cafe-runtime-v1"
        self.clients: set = set()
        self.model = DeepSeekClient()
        self.states = {
            profile.npc_id: NpcState(profile.npc_id, "npc", CAFE_LOCATION, *profile.initial_position, "down", "idle", None, profile.initial_activity, False)
            for profile in NPC_PROFILES.values()
        }
        self.memories: dict[str, list[str]] = {npc_id: [] for npc_id in NPC_PROFILES}
        self.next_action_at: dict[str, datetime] = {npc_id: datetime.min.replace(tzinfo=SHANGHAI) for npc_id in NPC_PROFILES}
        self.player_position: tuple[float, float] | None = None
        self.last_greeting_at: dict[str, datetime] = {npc_id: datetime.min.replace(tzinfo=SHANGHAI) for npc_id in NPC_PROFILES}

    @staticmethod
    def now() -> datetime:
        return datetime.now(SHANGHAI)

    def snapshot(self) -> dict:
        return {
            "schema_version": 1, "kind": "snapshot", "world_id": CAFE_LOCATION, "location_id": CAFE_LOCATION,
            "stream_id": self.stream_id, "last_sequence": self.sequence, "revision": self.revision,
            "server_time": datetime.now(UTC).isoformat(), "timezone": "Asia/Shanghai", "map_id": CAFE_LOCATION,
            "entities": [asdict(state) for state in self.states.values()], "anchors": [], "furniture": [], "focus_sessions": [],
        }

    async def connect(self, websocket) -> None:
        await websocket.accept()
        self.clients.add(websocket)
        await websocket.send_json(self.snapshot())

    def disconnect(self, websocket) -> None:
        self.clients.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        stale = []
        for client in self.clients:
            try:
                await client.send_json(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.disconnect(client)

    async def broadcast_delta(self) -> None:
        self.revision += 1
        await self.broadcast({
            "schema_version": 1, "kind": "state.delta", "world_id": CAFE_LOCATION, "location_id": CAFE_LOCATION,
            "stream_id": self.stream_id, "revision": self.revision, "server_time": datetime.now(UTC).isoformat(),
            "entities": [asdict(state) for state in self.states.values()], "removed_actor_ids": [],
        })

    async def speak(self, npc_id: str, content: str, emotion: str = "warm") -> None:
        self.sequence += 1
        await self.broadcast({
            "schema_version": 1, "kind": "world.event", "event": {
                "schema_version": 1, "event_id": str(uuid4()), "world_id": CAFE_LOCATION, "sequence": self.sequence,
                "type": "npc.spoke", "timestamp": datetime.now(UTC).isoformat(), "actor_id": npc_id,
                "actor_kind": "npc", "location_id": CAFE_LOCATION, "causation_id": None,
                "payload": {"target_actor_id": "user_haodi", "content": content[:500], "emotion": emotion},
            },
        })

    async def tick(self) -> None:
        now = self.now()
        changed = False
        for profile in NPC_PROFILES.values():
            changed = await self.apply_schedule(profile, now) or changed
        await self.maybe_greet_nearby(now)
        if changed:
            await self.broadcast_delta()

    async def apply_schedule(self, profile: NpcProfile, now: datetime) -> bool:
        npc = self.states[profile.npc_id]
        minutes = now.hour * 60 + now.minute
        arrival = 9 * 60
        departure = 20 * 60 if profile.npc_id == "loopy" else 21 * 60 + 30
        if minutes < arrival or minutes >= departure:
            if npc.visible:
                self.apply_action(profile, "leave", now)
                return True
            return False
        if not npc.visible:
            self.apply_action(profile, "return", now)
            return True
        if profile.npc_id == "evan" and minutes >= 20 * 60:
            return self.apply_action(profile, "work", now, until=now.replace(hour=21, minute=30, second=0, microsecond=0))
        if now < self.next_action_at[profile.npc_id]:
            return False
        proposal = await self.model.choose_action(profile, self.memories[profile.npc_id])
        action = proposal["action"] if proposal else self.rule_action(profile)
        # Arrival and departure are schedule-owned; the model only chooses in-cafe activities.
        if action in {"leave", "return"}:
            action = self.rule_action(profile)
        self.apply_action(profile, action, now)
        return True

    def rule_action(self, profile: NpcProfile) -> str:
        if profile.npc_id == "loopy":
            return random.choices(("make_coffee", "clean", "rest"), weights=(6, 2, 1))[0]
        return random.choices(("read", "work", "rest"), weights=(5, 4, 1))[0]

    def apply_action(self, profile: NpcProfile, action: str, now: datetime, until: datetime | None = None) -> bool:
        anchor, activity, state = ACTIVITIES.get(action, ACTIVITIES["rest"])
        npc = self.states[profile.npc_id]
        previous = (npc.x, npc.y, npc.activity, npc.state, npc.visible)
        npc.x, npc.y = ANCHORS[anchor]
        npc.activity, npc.state = activity, state
        npc.visible = action != "leave"
        if until:
            self.next_action_at[profile.npc_id] = until
        elif action == "leave":
            self.next_action_at[profile.npc_id] = now + timedelta(hours=12)
        elif action == "return":
            self.next_action_at[profile.npc_id] = now + timedelta(minutes=5)
        else:
            lower, upper = ACTIVITY_MINUTES[action]
            self.next_action_at[profile.npc_id] = now + timedelta(minutes=random.randint(lower, upper))
        self.memories[profile.npc_id].append(f"{now.strftime('%H:%M')}：{activity}")
        del self.memories[profile.npc_id][:-12]
        return previous != (npc.x, npc.y, npc.activity, npc.state, npc.visible)

    async def maybe_greet_nearby(self, now: datetime) -> None:
        if not self.player_position:
            return
        player_x, player_y = self.player_position
        for profile in NPC_PROFILES.values():
            npc = self.states[profile.npc_id]
            if not npc.visible or now - self.last_greeting_at[profile.npc_id] < timedelta(minutes=12):
                continue
            if (npc.x - player_x) ** 2 + (npc.y - player_y) ** 2 > 150 ** 2:
                continue
            self.last_greeting_at[profile.npc_id] = now
            greeting = "今天也在认真工作呀，需要我为你留一盏安静的灯吗？" if profile.npc_id == "loopy" else "晚上好。这里很安静，正适合把手上的事慢慢完成。"
            await self.speak(profile.npc_id, greeting)

    async def handle_client_message(self, raw: str) -> None:
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return
        if message.get("kind") == "player.position":
            x, y = message.get("x"), message.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                self.player_position = (x, y)
            return
        if message.get("kind") != "npc.message" or not isinstance(message.get("content"), str):
            return
        content = message["content"].strip()[:800]
        if not content:
            return
        npc_id = self.closest_visible_npc()
        if not npc_id:
            return
        profile = NPC_PROFILES[npc_id]
        self.memories[npc_id].append(f"用户说：{content}")
        reply = await self.model.reply(profile, content, self.memories[npc_id])
        if not reply:
            reply = "我在听。慢慢说，不需要急着把每一句话都想得很完整。" if npc_id == "evan" else "我在呀！先喝口水，再把想说的慢慢告诉我。"
        self.memories[npc_id].append(f"{profile.name}说：{reply}")
        await self.speak(npc_id, reply)

    def closest_visible_npc(self) -> str | None:
        if not self.player_position:
            return next((npc_id for npc_id, state in self.states.items() if state.visible), None)
        player_x, player_y = self.player_position
        candidates = [state for state in self.states.values() if state.visible]
        if not candidates:
            return None
        return min(candidates, key=lambda state: (state.x - player_x) ** 2 + (state.y - player_y) ** 2).actor_id


world = CafeWorld()


async def run_npc_worker() -> None:
    delay = max(15, int(os.getenv("NPC_TICK_SECONDS", "30")))
    while True:
        await world.tick()
        await asyncio.sleep(delay)
