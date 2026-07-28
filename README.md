# CodeSync 🚀

> A high-performance, real-time collaborative IDE featuring conflict-free document editing, peer-to-peer mesh voice chat, and isolated execution sandboxes.

🚀 **Live Demo:** https://code-sync-lake-one.vercel.app

---

## 🌟 Overview

**CodeSync** is a modern full-stack collaborative development environment that enables developers to write, execute, and collaborate on code in real time.

Built to eliminate synchronization issues during pair programming and technical interviews, CodeSync provides real-time collaborative editing, live cursor tracking, conflict-free document synchronization using CRDTs, peer-to-peer voice communication, and multi-language code execution.

---

# ✨ Key Features

### ⚡ Real-Time Collaborative Editing
- Powered by **Yjs (CRDTs)** for conflict-free document synchronization.
- Uses WebSockets (`wss://`) for low-latency real-time updates.
- Supports live remote cursor tracking and collaborative editing through Monaco Editor.

### 🎙️ Peer-to-Peer Mesh Voice Chat
- Implemented using native **WebRTC APIs**.
- Full-mesh peer-to-peer audio streaming.
- Includes:
  - Active speaker detection
  - Dynamic voice indicators
  - Mute/unmute controls

### 🛡️ Access Control & Room Management
- Secure workspace access using custom room passcodes.
- Room capacity enforcement.
- Persistent room state management using Redis.

### 💻 Interactive Code Execution Engine
- Execute code directly inside collaborative rooms.
- Supports multiple languages:
  - JavaScript
  - Python
  - C++
  - Java
- Provides execution output and runtime information.

### 🐳 Production Cloud Architecture
- Fully containerized backend deployment.
- Nginx reverse proxy handling:
  - WebSocket upgrades
  - HTTP/1.1 connections
  - Long-lived socket connections
- Redis-backed scalable state management.
- Frontend deployed on Vercel with backend hosted on Render.

---

# 🛠️ Tech Stack

## Frontend

| Technology | Usage |
|---|---|
| React + Vite | Frontend framework |
| Tailwind CSS | Styling |
| Monaco Editor | Code editor |
| Yjs | CRDT-based collaboration |
| Socket.io Client | Real-time communication |
| WebRTC APIs | Peer-to-peer voice chat |
| Vercel | Frontend hosting |

---

## Backend & Infrastructure

| Technology | Usage |
|---|---|
| Node.js | Backend runtime |
| Express.js | API server |
| Socket.io | WebSocket communication |
| y-websocket | Yjs synchronization server |
| Redis (Upstash) | Room state and pub/sub |
| Docker | Containerization |
| Nginx | Reverse proxy |
| Render | Backend deployment |

---

# 🏗️ Deployment Architecture

```mermaid
flowchart TD

subgraph Client ["Client Layer (Vercel)"]
    A[React Client<br/>Monaco + Yjs]
end

subgraph Edge ["Edge Layer"]
    NG[Nginx Reverse Proxy<br/>Port 80 / WSS Upgrade]
end

subgraph Backend ["Backend Services (Render Docker)"]
    B[Node.js + Socket.io Server]
    E[Code Execution Engine]
end

subgraph Storage ["Cloud Infrastructure"]
    D[(Upstash Redis<br/>TLS Pub/Sub State)]
end

A -->|HTTPS / WSS| NG
NG -->|Proxy Pass| B
A -->|WebRTC Audio| C[Remote Peers]

B <-->|TLS rediss://| D
B --> E

E --> F[JavaScript / Python / C++ / Java Execution]
F -->|Console Output| B
```

---

# 🚀 Environment Setup & Deployment

## Backend Environment Variables

`server/.env`

```env
PORT=5000

REDIS_URL=rediss://default:your_upstash_key@your_host.upstash.io:6379

CLIENT_URL=https://code-sync-lake-one.vercel.app

NODE_ENV=production
```

---

## Frontend Environment Variables

`client/.env`

```env
VITE_BACKEND_URL=https://codesync-backend-5g4z.onrender.com

VITE_SOCKET_URL=https://codesync-backend-5g4z.onrender.com

VITE_WS_URL=wss://codesync-backend-5g4z.onrender.com
```

---

# 💻 Local Development

## Clone Repository

```bash
git clone https://github.com/Ghoul-07/Code-sync.git

cd Code-sync
```

---

## Docker Compose (Recommended)

```bash
docker compose up --build
```

---

## Manual Setup

### Backend

```bash
cd server

npm install

npm run dev
```

### Frontend

```bash
cd client

npm install

npm run dev
```

---

# 📂 Project Highlights

- Built a scalable real-time collaboration system using **CRDT-based synchronization**.
- Implemented WebRTC-based peer-to-peer communication without relying on third-party voice services.
- Designed a production deployment architecture using:
  - Docker
  - Nginx
  - Redis
  - WebSockets
  - Cloud hosting
- Developed an isolated multi-language execution environment for running user code.

---

# 📝 License

Distributed under the MIT License.

See `LICENSE` for more information.

---

# 👨‍💻 Author

Crafted with ❤️ by **Vedant Chaturvedi**

GitHub: https://github.com/Ghoul-07
