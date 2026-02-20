@echo off
REM StagePlayer DMX - Development Setup Script for Windows
REM This script sets up the development environment

echo ========================================
echo StagePlayer DMX - Development Setup
echo ========================================
echo.

REM Check Node.js
echo Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js 20 LTS from https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo.

REM Check Rust
echo Checking Rust installation...
where rustc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Rust is not installed!
    echo Please install Rust from https://rustup.rs/
    pause
    exit /b 1
)
rustc --version
echo.

REM Check npm
echo Checking npm...
npm --version
echo.

REM Install dependencies
echo Installing Node.js dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install Node.js dependencies
    pause
    exit /b 1
)
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To start development:
echo   npm run tauri:dev
echo.
echo To build for production:
echo   npm run tauri:build
echo.
echo To configure Windows Firewall for sACN:
echo   Run setup-firewall.ps1 as Administrator
echo.
pause
