import React, { useState, useEffect, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import Editor from "../components/Editor";
import { socket } from "../socket";
import Terminal from "../components/Terminal";
import { useVoiceChat } from "../hooks/useVoiceChat";
import { AudioPlayer } from "../components/AudioPlayer";
import Sidebar from "../components/Sidebar";

function EditorPage() {
  const { roomId } = useParams();
  const location = useLocation();

  const username = useMemo(() => {
    return (
      location.state?.username || "User-" + Math.floor(Math.random() * 1000)
    );
  }, [location.state?.username]);

  // assign a consistent user color for Yjs cursor awareness
  const userColor = useMemo(() => {
    const colors = [
      "#FF5733", // Coral Red
      "#33FF57", // Bright Green
      "#3357FF", // Royal Blue
      "#F033FF", // Electric Pink
      "#33FFF0", // Cyan
      "#FFC300", // Golden Yellow
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }, [username]);

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

  // webRTC mesh voice chat hook
  const { peers, isMuted, toggleMute, isSelfSpeaking, speakingUsers } =
    useVoiceChat(socket, roomId, username);

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
        if (initialLang) setLanguage(initialLang);
        setUniqueUsers(users);
      },
    );

    socket.on("user-joined", ({ username: joinedUser, users }) => {
      setUniqueUsers(users);
      if (joinedUser !== username) {
        toast.success(`${joinedUser} joined the room!`, {
          style: { background: "#333", color: "#fff" },
        });
      }
    });

    // listening to update user in case of a restart
    socket.on("user-list-update", ({ users }) => {
      setUniqueUsers(users);
    });

    socket.on("user-left", ({ username: leftUser, users }) => {
      setUniqueUsers(users);

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
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("receive-language-change");
      socket.off("receive-execution-result");
      socket.off("user-list-update");
    };
  }, [roomId, username]);

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

    // live code from monaco
    const currentCode = editorRef?.current?.getValue() || "";

    // sync user states
    setCode(currentCode);

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
      const response = await axios.post(`${BACKEND_URL}/api/execute`, {
        code: currentCode,
        language,
      });

      resultOutput = response.data.output;
      hasError = response.data.isError;
      timeTaken = response.data.executionTime;
    } catch (err) {
      console.error(
        "AXIOS ERROR DETAILED:",
        err.response || err.message || err,
      );
      hasError = true;
      resultOutput = "Failed to connect to execution server.";
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
            📋 Copy ROOM ID
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

        {/* Language Dropdown & Run Button */}
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
      </div>

      {/* Main Workspace area (Sidebar + Editor & Terminal )*/}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Left Sidebar*/}
        <Sidebar
          activeUsers={activeUsers}
          username={username}
          userColor={userColor}
          isMuted={isMuted}
          toggleMute={toggleMute}
          isSelfSpeaking={isSelfSpeaking}
          speakingUsers={speakingUsers}
        />

        {/* Editor and Terminal Workspace */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Editor
            ref={editorRef}
            roomId={roomId}
            username={username}
            language={language}
            color={userColor}
            serverUrl={import.meta.env.VITE_WS_URL || "ws://localhost:5000"}
            onCodeChange={(newCode) => setCode(newCode)}
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

      {/* Invisible Audio Elements for peer voice chat */}
      {peers.map(({ socketId, peer }) => {
        <AudioPlayer key={socketId} peer={peer} />;
      })}
    </div>
  );
}
export default EditorPage;
