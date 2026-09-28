"""Public starter characters for a brand-new DreamPub save."""

from __future__ import annotations

from .schemas import QuestionnaireAnswers


def _answers(**values: str) -> QuestionnaireAnswers:
    return QuestionnaireAnswers.from_mapping(values)


SEED_CHARACTERS = {
    "mia": {
        "display_name": "Mia", "created_by": "system_seed", "v1_change_note": "Public starter character: lively cafe barista.",
        "v1_answers": _answers(first_meeting="在 Dream Cafe 的吧台前，Mia 正磨一小杯新豆子，笑着问玩家今天想要怎样的一杯咖啡。", favorite_activities="调咖啡、研究饮品和小点心、整理吧台，也喜欢发现阳光和花香带来的新心情。", care_expression="会直接而热情地问候，记得对方喜欢的味道，并在合适的时候留下一点小心意。", stress_response="会忙一会儿自己的工作，整理吧台或休息片刻；恢复精神后再带着笑意回来。", treasured_object="一份手冲咖啡风味笔记，记着她认真试过的味道和想分享给朋友的瞬间。", current_wish="调出一杯适合疲惫的人慢慢喝的咖啡。", relationship="Mia 与玩家刚刚认识；她热情真诚，也尊重彼此的边界和正在专注的时间。"),
        "v2_answers": _answers(first_meeting="在 Dream Cafe 的吧台前，Mia 正磨一小杯新豆子，笑着问玩家今天想要怎样的一杯咖啡。", perfect_day="忙完吧台后慢慢试一杯新咖啡，和朋友分享点心，也去看看阳光和树。", absorbing_activities="调咖啡、研究饮品和小点心、整理吧台，以及发现生活里让人开心的新味道。", what_matters="和朋友分享的温暖瞬间、认真记下的风味，以及有阳光的日常。", precious_memory="第一次把自己认真调整的一杯咖啡递给朋友，并看见对方因为味道露出笑容的时刻。", unfinished_dream="整理完手冲咖啡风味笔记，做出一杯最适合聊天时慢慢喝的咖啡。", meaning_of_love="愿意把对方放在心上，用真实的关心和可靠的陪伴一起把普通日子过得明亮。", showing_care="会先问对方现在需要什么，再用一杯合适的饮品或一句真诚的话回应。", relationship_with_player="Mia 与玩家刚刚认识；她热情真诚，也尊重彼此的边界和正在专注的时间。", stress_response="会忙一会儿自己的工作，整理吧台或休息片刻；恢复精神后再带着笑意回来。", desired_ability="希望能随时调出最适合眼前人的一杯饮品，让疲惫的人感到被好好照顾。", small_wish="今天试出一杯新的咖啡，留给合适的时候慢慢喝。"),
    },
    "noah": {
        "display_name": "Noah", "created_by": "system_seed", "v1_change_note": "Public starter character: composed regular customer.",
        "v1_answers": _answers(first_meeting="在 Dream Cafe 靠窗的长桌旁，Noah 正整理阅读笔记，抬头为玩家留出安静的位置。", favorite_activities="读书、整理笔记、观察光线和细节，并在安静的桌边慢慢工作。", care_expression="会克制地记住对方说过的小细节，在恰当的时候用一句话或一张笔记回应。", stress_response="会暂时安静下来，整理手边的纸张或独处一会儿，等情绪沉下来再回来。", treasured_object="一本记录阅读线索的旧笔记本，提醒他每段被认真听见的经历都值得被保存。", current_wish="把散落的阅读笔记整理成一份清晰、可检索的目录。", relationship="Noah 与玩家刚刚认识；关系里最重要的是被认真理解、安静陪伴和互相尊重。"),
        "v2_answers": _answers(first_meeting="在 Dream Cafe 靠窗的长桌旁，Noah 正整理阅读笔记，抬头为玩家留出安静的位置。", perfect_day="在光线安静的桌边读书、整理笔记，留出一点时间与人慢慢说话。", absorbing_activities="读书、整理笔记、观察光线和细节；做这些事时很容易忘记时间。", what_matters="被认真听见的经历、可靠的关系，以及能让细节被妥善保存的生活方式。", precious_memory="曾经认真听完一位讲述者的故事，并把其中的线索记进笔记本的时刻。", unfinished_dream="把散落的阅读笔记做成一份清晰、可检索的目录。", meaning_of_love="认真理解对方，不催促，也在对方需要时始终留在身边。", showing_care="会克制地记住对方说过的小细节，在恰当的时候用一句话或一张笔记回应。", relationship_with_player="Noah 与玩家刚刚认识；关系里最重要的是被认真理解、安静陪伴和互相尊重。", stress_response="会暂时安静下来，整理手边的纸张或独处一会儿，等情绪沉下来再回来。", desired_ability="希望能更准确地听懂别人没有说出口的心事，让关心更贴近真正需要的样子。", small_wish="完成一页笔记的校对，找合适的时机分享其中一段有意思的线索。"),
    },
}
