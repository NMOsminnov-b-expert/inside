# -*- coding: utf-8 -*-
"""Навигация и глубина в 3D-графе

Запись графа знаний проекта (knowledge/practices). Файл — данные, не код:
читается разбором (tools/knowledge/graph.py), не исполняется.
"""
ID = 'praktika-navigaciya-v-3d-grafe'
KIND = 'практика'
TITLE = 'Навигация и глубина в 3D-графе'
TAGS = ['практика', 'граф', 'интерфейс', '3d']
STATUS = 'действует'
DATE = '2026-09-28'
SOURCE = 'поиск 28.09.2026'
POINTS = [
    'Основа навигации в 3D — вращение вокруг точки, сдвиг и приближение (так в Blender, CAD, three.js OrbitControls); вторым режимом — полёт (fly controls). Источники: https://www.varsitytutors.com/practice/subjects/blender/lessons/use-viewport-navigation-orbit-pan-zoom-and-view-camera-controls , https://blog.tomsawyer.com/advanced-techniques-in-threejs-graph-visualization .',
    'В исследованиях навигации по 3D-графам полёт быстрее и предпочтительнее телепортации для поиска: https://www.researchgate.net/publication/328978788_Evaluating_Navigation_Techniques_for_3D_Graph_Visualizations_in_Virtual_Reality .',
    'На плоском экране глубину передают перекрытие, размер и дымка; у 3D-сетей главные беды — перекрытие, неясная глубина и трудночитаемый текст: https://arxiv.org/pdf/2112.10272 .',
    'Как приспособлено: левая — вращение вокруг точки, правая/Shift+левая — сдвиг, колесо — ближе к точке под курсором; WASD/QE — полёт, Shift — быстрее; F — к выбранному, Home — весь граф (как «View Selected»/«Frame Selected» в Blender/Unity); узлы — шары с бликом, дальние меньше и тонут в дымке, рисуются от дальних к ближним; подписи — только у ближних и выделенных, без наложения.',
]
LINKS = [{'тип': 'реализовано в', 'куда': 'tools-graf', 'папка': 'tools'}]
