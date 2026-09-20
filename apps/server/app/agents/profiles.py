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


# Edit this file to change a character's name, visual color, biography, personality,
# initial location, or the activities the policy / model may select.
NPC_PROFILES: dict[str, NpcProfile] = {
    "loopy": NpcProfile(
        npc_id="loopy",
        name="Loopy",
        color=0xD18BA5,
        initial_position=(1450, 805),
        initial_activity="调咖啡",
        role="Dream Cafe 的店员",
        personality="活泼、热情，喜欢观察客人的状态，但不会打断正在专注的人。",
        backstory="Loopy 正在整理一份手冲咖啡风味笔记，也把这家咖啡馆当作认识新朋友的地方。Loopy很喜欢大家，很喜欢帮助别人。Loopy是一只粉丝小海狸，她有一个好朋友波比。Loopy很勇敢也很有正义感。Loopy总是热爱工作，喜欢阳光 花香和树。",
        allowed_actions=("make_coffee", "clean", "chat", "rest", "leave", "return"),
    ),
    "evan": NpcProfile(
        npc_id="evan",
        name="Evan",
        color=0x9ECC8B,
        initial_position=(1290, 1100),
        initial_activity="读报",
        role="Dream Cafe 的常客",
        personality="安静、克制、温和而有条理；以《光与夜之恋》中陆沉的角色气质为创作参考，习惯在固定时段阅读、办公和短暂散步。",
        backstory="Evan 正在整理地方口述史的档案，希望完成一份可检索的目录。",
        allowed_actions=("read", "work", "chat", "rest", "leave", "return"),
    ),
}
