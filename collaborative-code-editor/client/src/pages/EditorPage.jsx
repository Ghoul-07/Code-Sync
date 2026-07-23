import React, { useState, useEffect, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import Editor from "../components/Editor";
import { socket } from "../socket";
import Terminal from "../components/Terminal";
function EditorPage() {
  const { roomId } = useParams();
  const location = useLocation();

  const username = useMemo(() => {
    return (
      location.state?.username || "User-" + Math.floor(Math.random() * 1000)
    );
  }, [location.state?.username]);

  const [code, setCode] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const editorRef = useRef(null);

  const navigate = useNavigate();

  // execution and language states
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

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
    socket.emit("leave-room", { roomId, username });
    navigate("/");
  };

  // Deduplicate active users array by socketId
  const setUniqueUsers = (usersList = []) => {
    const safeList = Array.isArray(usersList) ? usersList : [];
    setActiveUsers(() => {
      const seen = new Set();
      return safeList.filter((u) => {
        if (!u || !u.username || seen.has(u.username)) return false;
        seen.add(u.username);
        return true;
      });
    });
  };

  useEffect(() => {
    // RE-JOIN automatically when socket reconnects
    const handleConnect = () => {
      console.log("connected to socket server, joining Room: ", roomId);
      socket.emit("join-room", {
        roomId,
        username,
      });
    };

    // join room if already connected
    if (socket.connected) {
      handleConnect();
    }
    socket.on("connect", handleConnect);

    socket.on(
      "room-init",
      ({ code: initialCode, language: initialLang, users }) => {
        setCode(initialCode);
        if (initialCode) setLanguage(initialLang);
        setUniqueUsers(users);

        if (editorRef.current) {
          editorRef.current.setEditorValue(initialCode);
        }
      },
    );

    // Receive deltas from other users and apply them to Monaco!
    socket.on("receive-delta", (changes) => {
      if (editorRef.current) {
        editorRef.current.applyRemoteDeltas(changes);
      }
    });

    socket.on("user-joined", ({ username: joinedUser, users }) => {
      setUniqueUsers(users);
      if (joinedUser !== username) {
        toast.success(`${joinedUser} joined the room!`, {
          style: { background: "#333", color: "#fff" },
        });
      }
    });

    socket.on("receive-cursor", (data) => {
      if (editorRef.current) {
        editorRef.current.updateRemoteCursor(data);
      }
    });

    // listening to update user in case of a restart
    socket.on("user-list-update", ({ users }) => {
      setUniqueUsers(users);
    });

    socket.on("user-left", ({ socketId, username: leftUser, users }) => {
      setUniqueUsers(users);
      if (editorRef.current && socketId) {
        editorRef.current.removeRemoteCursor(socketId);
      }
      console.log("[USER-LEFT]: ", leftUser);

      const isStillInRoom = users?.some((u) => u.username === leftUser);

      if (!isStillInRoom && leftUser && leftUser !== username) {
        toast(`${leftUser} left the room.`, {
          icon: "👋",
          style: { background: "#333", color: "#fff" },
        });
      }
    });

    // listening for language sync
    socket.on("receive-language-change", (newLang) => {
      setLanguage(newLang);
    });

    // listening for remote execution result
    socket.on(
      "receive-execution-result",
      ({ output, isError, executionTime }) => {
        setOutput(output);
        setIsError(isError);
        setExecutionTime(executionTime);
        setIsLoading(false);
        setIsTerminalOpen(true);
      },
    );

    return () => {
      socket.off("connect");
      socket.off("room-init");
      socket.off("receive-delta");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("receive-cursor");
      socket.off("receive-language-change");
      socket.off("receive-execution-result");
      socket.off("user-list-update");
    };
  }, [roomId, username]);

  const handleDeltaChange = (changes, fullCode) => {
    setCode(fullCode);
    socket.emit("code-delta", { roomId, changes, fullCode });
  };

  const handleCursorChange = (cursor, selection) => {
    socket.emit("cursor-position", {
      roomId,
      cursor,
      selection,
    });
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    socket.emit("language-change", { roomId, language: newLang });
  };

  // run code request handler
  const handleRunCode = async () => {
    setIsLoading(true);
    setIsTerminalOpen(true);

    const BACKEND_URL =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

    // Notify other users in room that execution started
    socket.emit("code-executed", {
      roomId,
      output: "⏳ Executing code in sandbox container...",
      isError: false,
      executionTime: null,
    });

    let resultOutput = "";
    let hasError = false;
    let timeTaken = 0;

    try {
      const startTime = performance.now();
      const response = await axios.post(`${BACKEND_URL}/api/execute`, {
        code,
        language,
      });
      const endTime = performance.now();

      const runData = response.data.run;
      resultOutput =
        runData.output || "Code executed successfully with no output";

      hasError = runData.code !== 0;
      timeTaken = Math.round(endTime - startTime);
    } catch (err) {
      console.error(
        "AXIOS ERROR DETAILED:",
        err.response || err.message || err,
      );
      hasError = true;
      resultOutput = "Failed to connect to execution server.";
      console.error("Execution Request Error:", err);
    } finally {
      setOutput(resultOutput);
      setIsError(hasError);
      setExecutionTime(timeTaken);
      setIsLoading(false);

      // broadcast to everyone in the room
      socket.emit("code-executed", {
        roomId,
        output: resultOutput,
        isError: hasError,
        executionTime: timeTaken,
      });
    }
  };
  return (
    <div
      className="app-container"
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
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

        {/* Day 4: Language Dropdown & Run Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <select
            value={language}
            onChange={handleLanguageChange}
            style={{
              backgroundColor: "#333",
              color: "#fff",
              border: "1px solid #555",
              borderRadius: "4px",
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            <option value="javascript">JavaScript (Node.js)</option>
            <option value="python">Python 3</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>

          <button
            onClick={handleRunCode}
            disabled={isLoading}
            style={{
              backgroundColor: "#22c55e",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "5px 14px",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            {isLoading ? "⏳ Running..." : "▶ Run Code"}
          </button>
        </div>

        {/* Active Users */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", marginRight: "5px" }}>
            Active Users:
          </span>
          {activeUsers.map((u) => (
            <span
              key={u.socketId}
              style={{
                backgroundColor: u.color || "#007acc",
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

      {/* Editor & Terminal Workspace */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <Editor
          ref={editorRef}
          code={code}
          language={language}
          onDeltaChange={handleDeltaChange}
          onCursorChange={handleCursorChange}
        />

        <Terminal
          output={output}
          isError={isError}
          isLoading={isLoading}
          executionTime={executionTime}
          isOpen={isTerminalOpen}
          setIsOpen={setIsTerminalOpen}
        />
      </div>
    </div>
  );
}
export default EditorPage;
