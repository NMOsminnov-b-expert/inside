# -*- coding: utf-8 -*-
"""Хук Claude Code PreToolUse (Bash) — отправка наружу только с согласия.

Правила «git push — только по прямой просьбе пользователя» и «npm publish
и подобное — запрещено» (CLAUDE.md, «Данные проекта наружу не уходят»).
Запрет в настройках («Bash(git push *)») ловит не всякое написание: git -C
… push, git -c x=y push, sh -c '…' проходят мимо (документация Claude Code,
permissions). Здесь — разбор самой строки команды:

  * git … push в любом месте команды — спросить пользователя (ask);
  * npm/pnpm/yarn publish, twine upload — отказ (deny).

Вход — JSON события на stdin, ответ — JSON с permissionDecision.
"""
import json
import re
import sys

# push — подкоманда git: перед ней только ключи git (-C <папка>, -c <x=y>, --…).
PUSH = re.compile(r'\bgit(?:\s+(?:-[Cc]\s+(?:"[^"]*"|\'[^\']*\'|\S+)|--?[\w-]+(?:=\S+)?))*\s+push\b')
PUBLISH = re.compile(r'\b(?:npm|pnpm|yarn)\b[^;&|\n]*?\bpublish\b|\btwine\s+upload\b')


def decide(command):
    if PUBLISH.search(command):
        return 'deny', 'Публикация пакетов запрещена правилом проекта «Данные проекта наружу не уходят».'
    if PUSH.search(command):
        return 'ask', 'git push — только по прямой просьбе пользователя (CLAUDE.md, «Данные проекта наружу не уходят»).'
    return None, None


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return
    command = (event.get('tool_input') or {}).get('command') or ''
    decision, reason = decide(command)
    if decision:
        json.dump({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': decision,
                                          'permissionDecisionReason': reason}}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
