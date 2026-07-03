# Caminho da Fé — MMORPG Gospel

A browser-based 3D MMORPG with a Biblical theme, built with Node.js + Express + Socket.IO (backend) and Three.js/WebGL (frontend). Journey from the Garden of Eden to the Book of Daniel across 7 narrative acts.

## How to run

The app starts automatically via the **Start application** workflow (`npm start`). It serves on port 5000.

- Entry point: `server.js`
- Static frontend: `public/` (index.html, game.js, style.css, Three.js in public/lib/)
- Game design config: `game_config.json` (loaded by the server on startup)
- Player save data: `dados/jogadores.json` (auto-saved every 30 s by username)

## Stack

- **Backend**: Node.js 20, Express 4, Socket.IO 4, bcryptjs, jsonwebtoken
- **Frontend**: Three.js (WebGL), vanilla JS — no build step required
- **Auth**: JWT-based; `SESSION_SECRET` env var used for signing tokens

## User preferences

_No preferences recorded yet._
