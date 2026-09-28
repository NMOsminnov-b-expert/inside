# -*- coding: utf-8 -*-
"""Где решение зависит от бизнес-процесса компании — сразу спрашивать пользователя, а не выбирать трактовку самому

Запись графа знаний проекта (knowledge/rules). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'claude-feedback-ask-on-business-ambiguity'
KIND = 'правило'
TITLE = 'Где решение зависит от бизнес-процесса компании — сразу спрашивать пользователя, а не выбирать трактовку самому'
TAGS = ['правило', 'оформление', 'работа-с-claude']
STATUS = 'действует'
DATE = '2026-08-25'
SOURCE = 'заметки Claude о работе с пользователем (перенос 28.09.2026)'
POINTS = [
    "When implementing a feature and a choice depends on the company's actual business process or domain\nsemantics (not just code/design taste) and the answer is genuinely unclear or has more than one\nreasonable reading — stop and ask directly, rather than silently picking an interpretation and\nproceeding.",
    '**Why:** stated explicitly in the `inside` project (property-appraisal system mockup) session on\n2026-08-25: "на будущее. Такие моменты всегда уточняй у меня... Я доверяю тебе в написании и дизайне,\nно с бизнеспроцессами кампании я знаком в разы лучше тебя, поэтому тут такое разделение пойдет на\nпользу." The user trusts my code/UI/design judgment, but has much deeper knowledge of the actual\nbusiness processes (workflow stages, who does what, what a figure means to an appraiser, how area\nfigures should be apportioned, etc.) than I do — decisions in that domain are his to make, not mine\nto infer from context.',
    '**How to apply:** distinguish two kinds of open questions during implementation —\n- Code/design/naming calls (a CSS class name, a category label, a UI layout choice) — fine to make a\n  reasonable call and flag it in the summary for the user to correct if wrong; no need to block.\n- Business-process/domain calls (how a computed value should be derived, what a field represents in\n  real appraisal practice, whether an existing calculation is "correct" or just a mockup shortcut,\n  which workflow step something belongs to) — ask via a direct question (AskUserQuestion when there\'s\n  a clear fork; plain text otherwise) *before* implementing, even if it costs a round-trip. Do not\n  silently redesign or reinterpret existing business logic to "fix" something that looks odd — flag it\n  as a question instead.',
]
