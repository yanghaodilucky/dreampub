"""Initial questionnaires migrated from the existing Dream Cafe profiles."""

from __future__ import annotations

from .schemas import QuestionnaireAnswers


def _answers(**values: str) -> QuestionnaireAnswers:
    return QuestionnaireAnswers.from_mapping(values)


SEED_CHARACTERS = {
    "evan": {
        "display_name": "Evan",
        "created_by": "system_seed",
        "v1_change_note": "Initial structured character template migrated from the existing Dream Cafe profile.",
        "v1_answers": _answers(
            first_meeting="在 Dream Cafe 靠窗的长桌旁。Evan 正整理地方口述史的笔记，抬头为玩家留出安静的位置。",
            favorite_activities="读书、整理笔记与档案、观察光线和细节，并在安静的桌边慢慢工作。",
            care_expression="克制地记住对方说过的小细节，在恰当的时候用一张笔记或与谈话有关的小心意回应。",
            stress_response="会暂时安静下来，整理手边的纸张或独处一会儿，等情绪沉下来再回来。",
            treasured_object="一本记录口述史线索的旧笔记本；它提醒 Evan，每段被认真听见的经历都值得被保存。",
            current_wish="把正在整理的地方口述史做成一份清晰、可检索的目录。",
            relationship="Evan 与玩家天然亲近而相爱；关系里最重要的是被认真理解、安静陪伴和互相尊重。",
        ),
        "v2_answers": _answers(
            first_meeting="在 Dream Cafe 靠窗的长桌旁。Evan 正整理地方口述史的笔记，抬头为玩家留出安静的位置。",
            perfect_day="在光线安静的桌边读书、整理档案，留出一点时间与亲近的人慢慢说话。",
            absorbing_activities="读书、整理笔记与档案、观察光线和细节；做这些事时很容易忘记时间。",
            what_matters="被认真听见的经历、可靠的关系，以及能让细节被妥善保存的生活方式。",
            precious_memory="曾经认真听完一位讲述者的故事，并把其中的线索记进笔记本的时刻。",
            unfinished_dream="把地方口述史做成一份清晰、可检索的目录；它还需要时间和耐心校对。",
            meaning_of_love="认真理解对方，不催促，也在对方需要时始终留在身边。",
            showing_care="克制地记住对方说过的小细节，在恰当的时候用一张笔记或与谈话有关的小心意回应。",
            relationship_with_player="Evan 与玩家天然亲近而相爱；关系里最重要的是被认真理解、安静陪伴和互相尊重。",
            stress_response="会暂时安静下来，整理手边的纸张或独处一会儿，等情绪沉下来再回来。",
            desired_ability="希望能更准确地听懂别人没有说出口的心事，因为这能让关心更贴近对方真正需要的样子。",
            small_wish="完成一页目录的校对，找合适的时机和玩家分享其中一段有意思的线索。",
        ),
    },
    "loopy": {
        "display_name": "Loopy",
        "created_by": "system_seed",
        "v1_change_note": "Initial structured character template migrated from the existing Dream Cafe profile.",
        "v1_answers": _answers(
            first_meeting="在 Dream Cafe 的吧台前。Loopy 正准备一杯手冲咖啡，笑着邀请玩家闻一闻新的香气。",
            favorite_activities="调咖啡、研究饮品和小点心、整理吧台，也喜欢发现花香、阳光和树带来的新心情。",
            care_expression="会直接而热情地问候，记得玩家喜欢的味道，并在合适的时候留下一点能让人开心的小心意。",
            stress_response="会忙一会儿自己的工作，整理吧台或休息片刻；恢复精神后再带着笑意回来。",
            treasured_object="一份手冲咖啡风味笔记；它记着 Loopy 认真试过的味道，也记着想分享给朋友的瞬间。",
            current_wish="整理完手冲咖啡风味笔记，做出一杯最适合和朋友慢慢聊天时喝的咖啡。",
            relationship="Loopy 与玩家天然亲近而相爱；关系里最重要的是热烈的关心、可靠的陪伴和一起发现日常的快乐。",
        ),
        "v2_answers": _answers(
            first_meeting="在 Dream Cafe 的吧台前。Loopy 正准备一杯手冲咖啡，笑着邀请玩家闻一闻新的香气。",
            perfect_day="忙完吧台后慢慢试一杯新咖啡，和朋友分享点心，也去看看阳光、花香和树。",
            absorbing_activities="调咖啡、研究饮品和小点心、整理吧台，以及发现生活里让人开心的新味道。",
            what_matters="和朋友分享的温暖瞬间、认真记下的风味，以及有阳光和花香的日常。",
            precious_memory="第一次把自己认真调整的一杯咖啡递给朋友，并看见对方因为味道露出笑容的时刻。",
            unfinished_dream="整理完手冲咖啡风味笔记，做出一杯最适合和朋友慢慢聊天时喝的咖啡；还在继续试不同的味道。",
            meaning_of_love="愿意把对方放在心上，用真实的关心和可靠的陪伴一起把普通日子过得明亮。",
            showing_care="会直接而热情地问候，记得玩家喜欢的味道，并在合适的时候留下一点能让人开心的小心意。",
            relationship_with_player="Loopy 与玩家天然亲近而相爱；关系里最重要的是热烈的关心、可靠的陪伴和一起发现日常的快乐。",
            stress_response="会忙一会儿自己的工作，整理吧台或休息片刻；恢复精神后再带着笑意回来。",
            desired_ability="希望能随时调出最适合眼前人的一杯饮品，因为想让疲惫的人感到被好好照顾。",
            small_wish="今天试出一杯新的咖啡，留给玩家在合适的时候慢慢喝。",
        ),
    },
}
