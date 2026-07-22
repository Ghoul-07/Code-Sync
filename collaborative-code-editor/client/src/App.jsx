import React, { useState, useEffect, useRef } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  Routes,
  Route,
  useParams,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import Home from "./pages/Home";
import Editor from "./components/Editor";
import { socket } from "./socket";

function EditorPage() {
  const { roomId } = useParams();
  const location = useLocation();

  const username =
    location.state?.username || "User-" + Math.floor(Math.random() * 1000);

  const [code, setCode] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const editorRef = useRef(null);

  const navigate = useNavigate();

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID copied to clipboard!", {
        style: { background: "#333", color: "#fff" },
      });
    } catch (err) {
      toast.error("Failed to copy Room ID");
    }
  };

  const handleLeave = () => {
    socket.emit("leave-room", { roomId });
    navigate("/");
  };

  useEffect(() => {
    socket.emit("join-room", {
      roomId,
      username,
    });

    socket.on("room-init", ({ code: initialCode, users }) => {
      setCode(initialCode);
      setActiveUsers(users);
    });

    // Receive deltas from other users and apply them to Monaco!
    socket.on("receive-delta", (changes) => {
      if (editorRef.current) {
        editorRef.current.applyRemoteDeltas(changes);
      }
    });

    socket.on("user-joined", ({ username, users }) => {
      setActiveUsers(users);
      toast.success(`${username} joined the room!`, {
        style: { background: "#333", color: "#fff" },
      });
    });

    socket.on("receive-cursor", (data) => {
      if (editorRef.current) {
        editorRef.current.updateRemoteCursor(data);
      }
    });

    socket.on("user-left", ({ socketId, username, users }) => {
      setActiveUsers(users);
      if (editorRef.current) {
        editorRef.current.removeRemoteCursor(socketId);
      }
      toast(`${username} left the room.`, {
        icon: "👋",
        style: { background: "#333", color: "#fff" },
      });
    });

    return () => {
      socket.off("room-init");
      socket.off("receive-delta");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("receive-cursor");
    };
  }, [roomId, username]);

  const handleDeltaChange = (changes, fullCode) => {
    setCode(fullCode);
    socket.emit("code-delta", { roomId, changes, fullCode });
  };

  const handleCursorChange = (cursor, selection) => {
    console.log("[CURSOR]: ", cursor);
    socket.emit("cursor-position", {
      roomId,
      cursor,
      selection,
    });
  };
  return (
    <div
      className="app-container"
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <Toaster position="top-right" reverseOrder={false} />

      {/* Header */}
      <div
        style={{
          padding: "10px 20px",
          backgroundColor: "#252526",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#ccc",
        }}
      >
        {/* Room Info & Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontWeight: "bold", fontSize: "14px" }}>
            Room: <span style={{ color: "#4ec9b0" }}>{roomId}</span>
          </div>

          <button
            onClick={copyRoomId}
            style={{
              backgroundColor: "#333",
              color: "#fff",
              border: "1px solid #555",
              padding: "4px 10px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            📋 Copy ID
          </button>

          <button
            onClick={handleLeave}
            style={{
              backgroundColor: "#f44336",
              color: "#fff",
              border: "none",
              padding: "4px 10px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            🚪 Leave
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", marginRight: "5px" }}>
            Active Users:
          </span>
          {activeUsers.map((u) => (
            <span
              key={u.socketId}
              style={{
                backgroundColor: "#007acc",
                color: "#fff",
                padding: "3px 8px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: "500",
              }}
            >
              👤 {u.username}
            </span>
          ))}
        </div>
      </div>

      {/* Editor Workspace  */}

      <div style={{ flex: 1 }}>
        <Editor
          ref={editorRef}
          code={code}
          onDeltaChange={handleDeltaChange}
          onCursorChange={handleCursorChange}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/editor/:roomId" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
export default App;
