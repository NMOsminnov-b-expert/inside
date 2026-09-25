@echo off
rem Сборка одного файла dist\Razmetka.exe (.NET внутри, установка не нужна).
setlocal
set DOTNET=%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe
if not exist "%DOTNET%" set DOTNET=dotnet
set DOTNET_CLI_TELEMETRY_OPTOUT=1
"%DOTNET%" publish "%~dp0Razmetka.csproj" -c Release -o "%~dp0dist" -nologo
