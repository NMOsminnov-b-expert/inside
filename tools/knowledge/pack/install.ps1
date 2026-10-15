# Установка и обновление графа знаний на другом компьютере.
#
# Запуск — из папки пакета (там, где лежат graf.bundle, katalog.bundle и infra\):
#
#     powershell -ExecutionPolicy Bypass -File install.ps1 [-Target "C:\graf"]
#
# Повторный запуск с новым пакетом — обновление: графы подтягивают новые
# коммиты из пакета (свои коммиты на этой машине сохраняются, сводятся
# слиянием), программа и CodeGraph заменяются.
#
# Нужны git и Python 3 в PATH. Права администратора не нужны: всё ставится в
# профиль пользователя (%LOCALAPPDATA%) и в папку -Target.
param([string]$Target = "C:\graf")

$ErrorActionPreference = 'Stop'
$Pack = $PSScriptRoot
$Graf = Join-Path $Target 'graf'
$Katalog = Join-Path $Target 'katalog'
$CgHome = Join-Path $env:LOCALAPPDATA 'codegraph\current'

function Need($exe) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "Не найден $exe в PATH — установите и запустите снова." }
}
function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

# Клон из пакета или подтягивание новых коммитов из него.
function Sync-Repo($bundle, $dir) {
  if (-not (Test-Path $bundle)) { Write-Host "  нет $bundle — пропущено"; return }
  git bundle verify $bundle | Out-Null
  if (-not (Test-Path (Join-Path $dir '.git'))) {
    git clone --quiet --branch main $bundle $dir
    git -C $dir remote rename origin pack
  } else {
    git -C $dir remote set-url pack $bundle
    git -C $dir fetch --quiet pack
    git -C $dir merge --no-edit pack/main
  }
  Write-Host "  $dir — $(git -C $dir log -1 --format='%h %ad %s' --date=short)"
}

Need git; Need python
New-Item -ItemType Directory -Force $Target | Out-Null

Step 'Графы'
Sync-Repo (Join-Path $Pack 'graf.bundle') $Graf
Sync-Repo (Join-Path $Pack 'katalog.bundle') $Katalog

Step 'CodeGraph'
$cgSrc = Join-Path $Pack 'infra\codegraph'
if (Test-Path $cgSrc) {
  New-Item -ItemType Directory -Force $CgHome | Out-Null
  robocopy $cgSrc $CgHome /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "CodeGraph не скопирован (robocopy $LASTEXITCODE)" }
  Write-Host "  $CgHome"
}
$cg = Join-Path $CgHome 'bin\codegraph.cmd'

Step 'Программа «Граф проекта»'
$distSrc = Join-Path $Pack 'infra\graf-dist'
if (Test-Path $distSrc) {
  $dist = Join-Path $Graf 'tools\graf\dist'
  robocopy $distSrc $dist /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Программа не скопирована (robocopy $LASTEXITCODE)" }
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Граф проекта.lnk'
  $sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $sh.TargetPath = Join-Path $dist 'Graf.exe'; $sh.WorkingDirectory = $Graf; $sh.Save()
  Write-Host "  $dist\Graf.exe, ярлык на рабочем столе"
}

Step 'Хук обновления индекса и мультиграф'
git -C $Graf config core.hooksPath tools/hooks
python (Join-Path $Graf 'tools\knowledge\graph.py') graphs add $Katalog

Step 'Индекс CodeGraph'
foreach ($d in @($Graf, $Katalog)) {
  if (-not (Test-Path (Join-Path $d '.git'))) { continue }
  if (Test-Path (Join-Path $d '.codegraph')) { & $cg sync $d } else { & $cg init $d }
}

Step 'CodeGraph в Claude Code'
if (Get-Command claude -ErrorAction SilentlyContinue) {
  claude mcp remove codegraph --scope user 2>$null | Out-Null
  claude mcp add codegraph --scope user -- (Join-Path $CgHome 'node.exe') --liftoff-only --disable-warning=ExperimentalWarning (Join-Path $CgHome 'lib\dist\bin\codegraph.js') serve --mcp
} else {
  Write-Host '  claude не найден в PATH — подключите вручную:'
  Write-Host "  claude mcp add codegraph --scope user -- `"$CgHome\node.exe`" --liftoff-only --disable-warning=ExperimentalWarning `"$CgHome\lib\dist\bin\codegraph.js`" serve --mcp"
}

Step 'Готово'
python (Join-Path $Graf 'tools\knowledge\graph.py') graphs
Write-Host "Claude Code запускать в $Graf."
