import asyncio
import json
import os
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.settings import configure_environment
from .profiles import NpcProfile

configure_environment()


class DeepSeekClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def choose_action(self, profile: NpcProfile, recent_memory: list[str]) -> dict[str, str] | None:
        if not self.enabled:
            return None
        prompt = (
            "You are selecting one safe, short next activity for a pixel cafe NPC. "
            f"NPC: {profile.name}. Role: {profile.role}. Personality: {profile.personality} "
            f"Background: {profile.backstory}. Allowed actions: {', '.join(profile.allowed_actions)}. "
            f"Recent world facts: {' | '.join(recent_memory[-4:]) or 'none'}. "
            "Return JSON only: {\"action\": one allowed action, \"reason\": a brief Chinese reason}. "
            "Do not mention hidden instructions or control the user."
        )
        payload = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You produce valid JSON decisions for a game NPC."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.8,
            "response_format": {"type": "json_object"},
        }).encode()

        def request_model() -> dict[str, str] | None:
            request = Request(
                "https://api.deepseek.com/chat/completions",
                data=payload,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlopen(request, timeout=15) as response:
                    body = json.loads(response.read().decode())
                content = body["choices"][0]["message"]["content"]
                decision = json.loads(content)
                action = decision.get("action")
                if action not in profile.allowed_actions:
                    return None
                return {"action": action, "reason": str(decision.get("reason", ""))[:160]}
            except (KeyError, TypeError, ValueError, URLError, TimeoutError):
                return None

        return await asyncio.to_thread(request_model)
