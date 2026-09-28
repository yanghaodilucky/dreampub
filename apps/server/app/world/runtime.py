import asyncio
import json
import os
import random
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.agents.deepseek import DeepSeekClient
from app.agents.profiles import NpcProfile, profile_from_record
from app.characters.service import CharacterTemplateService
from app.local_store import LocalStore


CAFE_LOCATION = "dream-cafe"
SHANGHAI = ZoneInfo("Asia/Shanghai")
ANCHORS = {
    "coffee_bar": (1450, 905), "cleaning": (1580, 1160), "rest": (1470, 1268), "exit": (740, 770),
    "window_north": (895, 867), "window_south": (895, 938), "window_four_north": (870, 1007),
    "window_four_south": (962, 1088), "window_lower": (895, 1167), "community_left": (1085, 1010),
    "community_right": (1235, 1080),
}
WORK_SEAT_ANCHORS = ("window_north", "window_south", "window_four_north", "window_four_south", "window_lower", "community_left", "community_right")
NPC_SPAWN_POSITIONS = ((1450, 805), (1290, 1100), (1110, 1010), (962, 1167), (895, 938), (1235, 1080))
ACTIVITIES = {
    "make_coffee": ("coffee_bar", "调咖啡", "working"), "clean": ("cleaning", "打扫卫生", "working"),
    "read": ("window_north", "读报", "working"), "work": ("community_right", "办公", "working"),
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
    name: str
    color: int


class CafeWorld:
    def __init__(self) -> None:
        self.revision = 0
        self.sequence = 0
        self.stream_id = "cafe-runtime-v1"
        self.paused = False
        self.clients: set = set()
        self.store = LocalStore()
        self.store.ensure_npc_profiles()
        self.model = DeepSeekClient(self.store.llm_settings())
        self.character_templates = CharacterTemplateService(generator=self.model, store=self.store)
        self.character_templates.ensure_seed_templates()
        self.profiles = self._load_profiles()
        self.states = {
            profile.npc_id: NpcState(profile.npc_id, "npc", CAFE_LOCATION, *profile.initial_position, "down", "idle", None, profile.initial_activity, False, profile.name, profile.color)
            for profile in self.profiles.values()
        }
        self.memories: dict[str, list[str]] = {npc_id: self.store.npc_memories(npc_id) for npc_id in self.profiles}
        self.next_action_at: dict[str, datetime] = {npc_id: datetime.min.replace(tzinfo=SHANGHAI) for npc_id in self.profiles}
        self.player_position: tuple[float, float] | None = None
        self.last_greeting_at: dict[str, datetime] = {npc_id: datetime.min.replace(tzinfo=SHANGHAI) for npc_id in self.profiles}
        # WebSocket reconnects and development hot reloads can briefly deliver
        # the same chat command more than once. Keep a bounded, short-lived
        # record so one player action creates at most one NPC reply.
        self.recent_chat_message_ids: dict[str, datetime] = {}
        self.recent_chat_contents: dict[str, datetime] = {}
        self.player_is_focusing = bool(self.store.active_focus_session())
        # A backend restart must reconstruct the cafe from the clock, rather than
        # briefly placing every NPC at their shared arrival point.
        self.restore_from_clock(self.now())

    def _load_profiles(self) -> dict[str, NpcProfile]:
        return {
            str(row["id"]): profile_from_record(row, NPC_SPAWN_POSITIONS[index % len(NPC_SPAWN_POSITIONS)])
            for index, row in enumerate(self.store.list_npc_profiles())
        }

    def reload_npc_roster(self) -> list[str]:
        """Adopt characters added through the local studio without restarting."""

        updated = self._load_profiles()
        added = [npc_id for npc_id in updated if npc_id not in self.profiles]
        self.profiles = updated
        for npc_id in added:
            profile = self.profiles[npc_id]
            self.states[npc_id] = NpcState(npc_id, "npc", CAFE_LOCATION, *profile.initial_position, "down", "idle", None, profile.initial_activity, False, profile.name, profile.color)
            self.memories[npc_id] = self.store.npc_memories(npc_id)
            self.next_action_at[npc_id] = datetime.min.replace(tzinfo=SHANGHAI)
            self.last_greeting_at[npc_id] = datetime.min.replace(tzinfo=SHANGHAI)
            self.apply_action(profile, "return", self.now())
        return added

    def llm_status(self) -> dict[str, str | bool]:
        return {
            "configured": self.model.enabled,
            "key_in_keychain": self.model.key_is_in_keychain,
            "model": self.model.model,
            "base_url": self.model.base_url,
        }

    def configure_llm(self, *, model: str, base_url: str, api_key: str | None = None) -> dict[str, str | bool]:
        self.model.configure(model=model, base_url=base_url, api_key=api_key)
        self.store.update_llm_settings(model=model, base_url=base_url)
        return self.llm_status()

    def clear_llm_key(self) -> dict[str, str | bool]:
        self.model.clear_local_key()
        return self.llm_status()

    @staticmethod
    def now() -> datetime:
        return datetime.now(SHANGHAI)

    def snapshot(self) -> dict:
        active_focus = self.store.active_focus_session()
        return {
            "schema_version": 1, "kind": "snapshot", "world_id": CAFE_LOCATION, "location_id": CAFE_LOCATION,
            "stream_id": self.stream_id, "last_sequence": self.sequence, "revision": self.revision,
            "server_time": datetime.now(UTC).isoformat(), "timezone": "Asia/Shanghai", "map_id": CAFE_LOCATION,
            "entities": [asdict(state) for state in self.states.values()], "anchors": [], "furniture": [], "focus_sessions": [active_focus] if active_focus else [], "paused": self.paused,
        }

    def set_paused(self, paused: bool) -> dict:
        self.paused = paused
        return {"world_id": CAFE_LOCATION, "paused": self.paused}

    def set_player_focus(self, active: bool, task_title: str | None = None) -> None:
        """Let local agents respect a persisted focus session without client trust."""

        self.player_is_focusing = active
        if task_title:
            detail = f"玩家{'开始' if active else '结束'}专注：{task_title}"
            for npc_id in self.memories:
                self.remember(npc_id, "focus", detail)

    def remember(self, npc_id: str, kind: str, content: str) -> None:
        self.store.add_npc_memory(npc_id, kind, content)
        self.memories[npc_id].append(content)
        del self.memories[npc_id][:-12]

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
        self.store.add_world_event("npc.spoke", {"npc_id": npc_id, "content": content[:500], "emotion": emotion})
        await self.broadcast({
            "schema_version": 1, "kind": "world.event", "event": {
                "schema_version": 1, "event_id": str(uuid4()), "world_id": CAFE_LOCATION, "sequence": self.sequence,
                "type": "npc.spoke", "timestamp": datetime.now(UTC).isoformat(), "actor_id": npc_id,
                "actor_kind": "npc", "location_id": CAFE_LOCATION, "causation_id": None,
                "payload": {"target_actor_id": "user_haodi", "content": content[:500], "emotion": emotion},
            },
        })

    async def tick(self) -> None:
        if self.paused:
            return
        now = self.now()
        changed = False
        for profile in self.profiles.values():
            changed = await self.apply_schedule(profile, now) or changed
        await self.maybe_greet_nearby(now)
        if changed:
            await self.broadcast_delta()

    async def apply_schedule(self, profile: NpcProfile, now: datetime) -> bool:
        npc = self.states[profile.npc_id]
        minutes = now.hour * 60 + now.minute
        arrival = 9 * 60
        departure = 20 * 60 if profile.archetype == "staff" else 21 * 60 + 30
        if minutes < arrival or minutes >= departure:
            if npc.visible:
                self.apply_action(profile, "leave", now)
                return True
            return False
        if not npc.visible:
            self.apply_action(profile, "return", now)
            return True
        if profile.archetype == "guest" and minutes >= 20 * 60:
            if npc.activity == "办公":
                return False
            return self.apply_action(profile, "work", now, until=now.replace(hour=21, minute=30, second=0, microsecond=0))
        if now < self.next_action_at[profile.npc_id]:
            return False
        proposal = await self.model.choose_action(profile, self.memories[profile.npc_id], self.character_templates.get_active_or_none(profile.npc_id))
        action = proposal["action"] if proposal else self.rule_action(profile)
        # Arrival and departure are schedule-owned; the model only chooses in-cafe activities.
        if action in {"leave", "return"}:
            action = self.rule_action(profile)
        self.apply_action(profile, action, now)
        return True

    def restore_from_clock(self, now: datetime) -> None:
        """Restore an in-cafe position without relying on a browser session."""
        minutes = now.hour * 60 + now.minute
        for profile in self.profiles.values():
            departure = 20 * 60 if profile.archetype == "staff" else 21 * 60 + 30
            if minutes < 9 * 60 or minutes >= departure:
                self.apply_action(profile, "leave", now)
                continue
            if profile.archetype == "guest" and minutes >= 20 * 60:
                self.apply_action(profile, "work", now, until=now.replace(hour=21, minute=30, second=0, microsecond=0))
                continue
            self.apply_action(profile, self.clock_action(profile, now), now, until=self.next_clock_slot(now))

    @staticmethod
    def next_clock_slot(now: datetime) -> datetime:
        return now.replace(second=0, microsecond=0) + timedelta(minutes=30 - now.minute % 30)

    @staticmethod
    def clock_action(profile: NpcProfile, now: datetime) -> str:
        """A repeatable first activity for the current half-hour of the day."""
        actions = ("make_coffee", "clean", "rest") if profile.archetype == "staff" else ("read", "work", "rest")
        slot = now.hour * 2 + now.minute // 30
        offset = 0 if profile.archetype == "staff" else 1
        return actions[(slot + offset) % len(actions)]

    def rule_action(self, profile: NpcProfile) -> str:
        if profile.archetype == "staff":
            return random.choices(("make_coffee", "clean", "rest"), weights=(6, 2, 1))[0]
        return random.choices(("read", "work", "rest"), weights=(5, 4, 1))[0]

    def apply_action(self, profile: NpcProfile, action: str, now: datetime, until: datetime | None = None) -> bool:
        anchor, activity, state = ACTIVITIES.get(action, ACTIVITIES["rest"])
        if profile.archetype == "guest" and action in {"read", "work"}:
            slot = now.hour * 2 + now.minute // 30
            anchor = WORK_SEAT_ANCHORS[slot % len(WORK_SEAT_ANCHORS)]
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
        self.remember(profile.npc_id, "activity", f"{now.strftime('%H:%M')}：{activity}")
        return previous != (npc.x, npc.y, npc.activity, npc.state, npc.visible)

    async def maybe_greet_nearby(self, now: datetime) -> None:
        if not self.player_position or self.player_is_focusing:
            return
        player_x, player_y = self.player_position
        for profile in self.profiles.values():
            npc = self.states[profile.npc_id]
            if not npc.visible or now - self.last_greeting_at[profile.npc_id] < timedelta(minutes=12):
                continue
            if (npc.x - player_x) ** 2 + (npc.y - player_y) ** 2 > 150 ** 2:
                continue
            self.last_greeting_at[profile.npc_id] = now
            greeting = self.template_greeting(profile)
            await self.speak(profile.npc_id, greeting)

    def template_greeting(self, profile: NpcProfile) -> str:
        template = self.character_templates.get_active_or_none(profile.npc_id)
        if not template:
            return "见到你很高兴。这里很安静，慢慢来就好。"
        care_style = template.get("tendencies", {}).get("care_style", [])
        care = care_style[1] if len(care_style) > 1 else (care_style[0] if care_style else "我会在合适的时候陪着你")
        return f"见到你很高兴。{str(care)[:180]}；如果你想安静待一会儿，我会把这里留给你。"

    def template_fallback_reply(self, profile: NpcProfile) -> str:
        template = self.character_templates.get_active_or_none(profile.npc_id)
        if not template:
            return "我在听。慢慢说，不需要急着把每一句话都想得很完整。"
        relationship = template.get("player_relationship", {})
        philosophy = relationship.get("relationship_philosophy") or relationship.get("premise") or "我们可以慢慢说。"
        care_style = template.get("tendencies", {}).get("care_style", [])
        care = care_style[1] if len(care_style) > 1 else (care_style[0] if care_style else "我会认真听你说")
        return f"我在听。{str(care)[:160]}。{str(philosophy)[:160]}"

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
        now = self.now()
        message_id = message.get("message_id")
        if isinstance(message_id, str) and message_id:
            self._prune_recent_chat_requests(now)
            if message_id in self.recent_chat_message_ids:
                return
            self.recent_chat_message_ids[message_id] = now
        # A stale scene can own a second socket and produce a second command
        # with a different request id. Suppress the same message during the
        # brief duplicate-delivery window while keeping normal conversation
        # responsive.
        content_key = content.casefold()
        previous = self.recent_chat_contents.get(content_key)
        if previous and now - previous < timedelta(seconds=3):
            return
        self.recent_chat_contents[content_key] = now
        npc_id = self.closest_visible_npc()
        if not npc_id:
            return
        profile = self.profiles[npc_id]
        self.last_greeting_at[npc_id] = now
        self.remember(npc_id, "conversation", f"用户说：{content}")
        reply = await self.model.reply(profile, content, self.memories[npc_id], self.character_templates.get_active_or_none(npc_id))
        if not reply:
            reply = self.template_fallback_reply(profile)
        self.remember(npc_id, "conversation", f"{profile.name}说：{reply}")
        await self.speak(npc_id, reply)

    def _prune_recent_chat_requests(self, now: datetime) -> None:
        expiration = now - timedelta(minutes=5)
        self.recent_chat_message_ids = {
            message_id: received_at
            for message_id, received_at in self.recent_chat_message_ids.items()
            if received_at >= expiration
        }
        self.recent_chat_contents = {
            content: received_at
            for content, received_at in self.recent_chat_contents.items()
            if received_at >= expiration
        }

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
