@echo off
rem Сборка программы в dist\ (Graf.exe и библиотеки рядом; .NET и Windows App SDK
rem внутри — установка и права администратора не нужны).
setlocal
set DOTNET=%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe
if not exist "%DOTNET%" set DOTNET=dotnet
set DOTNET_CLI_TELEMETRY_OPTOUT=1
set DOTNET_NOLOGO=1
"%DOTNET%" publish "%~dp0Graf.csproj" -c Release -r win-x64 --self-contained -o "%~dp0dist" -nologo
