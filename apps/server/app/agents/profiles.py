from dataclasses import dataclass


@dataclass(frozen=True)
class NpcProfile:
    npc_id: str
    name: str
    color: int
    initial_position: tuple[float, float]
    initial_activity: str
    role: str
    personality: str
    backstory: str
    allowed_actions: tuple[str, ...]
    archetype: str


DEFAULT_NPC_ROWS = (
    {"id": "mia", "name": "Mia", "color": "#d18ba5", "role": "Dream Cafe 的咖啡店员", "archetype": "staff"},
    {"id": "noah", "name": "Noah", "color": "#9ecc8b", "role": "Dream Cafe 的常客", "archetype": "guest"},
)


def profile_from_record(record: dict[str, object], position: tuple[float, float]) -> NpcProfile:
    """Build runtime behaviour from a local roster record, not source-code personas."""

    archetype = str(record["archetype"])
    is_staff = archetype == "staff"
    try:
        color = int(str(record["color"]).lstrip("#"), 16)
    except ValueError:
        color = 0xd18ba5
    name, role = str(record["name"]), str(record["role"])
    return NpcProfile(
        npc_id=str(record["id"]), name=name, color=color, initial_position=position,
        initial_activity="调咖啡" if is_staff else "读书", role=role,
        personality=("活泼、热情，喜欢观察客人的状态，但不会打断正在专注的人。" if is_staff else "成熟、稳重、温和而有条理，珍惜安静思考与可靠的陪伴。"),
        backstory=(f"{name} 在 Dream Cafe 的吧台工作，喜欢把一杯咖啡调到适合眼前人的状态。" if is_staff else f"{name} 是经常来 Dream Cafe 的客人，把这里当作安静阅读与整理思绪的地方。"),
        allowed_actions=(("make_coffee", "clean", "chat", "rest", "leave", "return") if is_staff else ("read", "work", "chat", "rest", "leave", "return")),
        archetype=archetype,
    )


# Compatibility export for code and tests that only need the public starter roster.
NPC_PROFILES = {
    row["id"]: profile_from_record(row, position)
    for row, position in zip(DEFAULT_NPC_ROWS, ((1450, 805), (1290, 1100)), strict=True)
}
