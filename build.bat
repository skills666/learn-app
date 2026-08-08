@echo off
REM 从 raw/*.md 重新生成题目并回写进 index.html
REM 用法：编辑 raw 目录下的 .md 后，双击本文件（或在命令行运行 python parse.py）
setlocal
set PY=C:\Users\ctqin\.workbuddy\binaries\python\versions\3.13.12\python.exe
if exist "%PY%" (
  "%PY%" "%~dp0parse.py"
) else (
  python "%~dp0parse.py"
)
echo.
echo 完成。请回到浏览器，对页面按 Ctrl+Shift+R 强制刷新以加载最新内容。
pause
