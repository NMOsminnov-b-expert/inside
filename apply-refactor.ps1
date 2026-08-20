# Разворачивает модульную сборку рядом со старой. Ничего не удаляет и не меняет
# существующие файлы: добавляются только app.html, app\ и tools\.
#
# Запуск (PowerShell, из папки проекта):
#   git checkout -b refactor/modular
#   .\apply-refactor.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip  = Join-Path $root 'inside-refactor.zip'

if (-not (Test-Path $zip)) { throw "Не найден архив: $zip" }

Expand-Archive -Path $zip -DestinationPath $root -Force

Write-Host ''
Write-Host 'Готово. Развёрнуто:' -ForegroundColor Green
Write-Host '  app.html   — новая точка входа (открывать через Live Server)'
Write-Host '  app\       — ядро, каркас, меню ОЦ и пять модулей типов ОЦ'
Write-Host '  tools\     — проверка визуальной идентичности + эталонные скриншоты'
Write-Host ''
Write-Host 'Старая сборка (index.html, src\, styles\, inside.html) не тронута.'
