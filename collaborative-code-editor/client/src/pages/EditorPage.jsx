import React, { useState, useEffect, useRef } from "react";
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
  const navigate = useNavigate();

  const username = location.state?.username || "";
  const password = location.state?.password || "";

  // 1. Guard against direct URL access without username
  useEffect(() => {
    if (!username && roomId) {
      toast.error("Please enter a username to join the room", {
        id: "missing-username-toast",
        style: { background: "#333", color: "#fff" },
      });
      navigate("/", { state: { targetRoomId: roomId }, replace: true });
    }
  }, [username, roomId, navigate]);

  const [userColor, setUserColor] = useState(() => {
    return sessionStorage.getItem(`room_color_${roomId}`) || null;
  });

  const [code, setCode] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const editorRef = useRef(null);

  // Leave Room Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // execution and language states
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  // webRTC mesh voice chat hook (only initializes if username exists)
  const { peers, isMuted, toggleMute, isSelfSpeaking, speakingUsers } =
    useVoiceChat(socket, roomId, username);

  // Store chat messages
  const [messages, setMessages] = useState([]);

  // 2. STOP RENDERING & HOOK EXECUTION EARLY if username is missing
  if (!username) return null;

  // helper function to safely set/clear Monaco execution markers
  const updateExecutionMarkers = (errorMessage = "", isErr = false) => {
    const editorInstance = editorRef.current?.editor;
    const monacoInstance = editorRef.current?.monaco || window.monaco;

    if (!editorInstance || !monacoInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    if (isErr && errorMessage) {
      const match =
        errorMessage.match(/:(\d+)(?::\d+)?/) ||
        errorMessage.match(/line (\d+)/i);

      const lineNumber = match ? parseInt(match[1], 10) : 1;
      const maxCol = model.getLineMaxColumn(lineNumber) || 100;

      monacoInstance.editor.setModelMarkers(model, "execution-error", [
        {
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: maxCol,
          message: errorMessage,
          severity: monacoInstance.MarkerSeverity.Error,
        },
      ]);
    } else {
      monacoInstance.editor.setModelMarkers(model, "execution-error", []);
    }
  };

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

  const handleConfirmLeave = () => {
    setShowLeaveModal(false);
    socket.emit("leave-room", { roomId, username });
    navigate("/");
  };

  // Deduplicate active users array by username
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
    if (!roomId || !username) return;

    // RE-JOIN automatically when socket reconnects
    const handleConnect = () => {
      const preferredColor = sessionStorage.getItem(`room_color_${roomId}`);
      socket.emit("join-room", {
        roomId,
        username,
        password,
        preferredColor,
      });
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on("connect", handleConnect);

    socket.on(
      "room-init",
      ({
        code: initialCode,
        language: initialLang,
        users,
        chatHistory,
        userColor: assignedColor,
      }) => {
        setCode(initialCode);
        if (initialLang) setLanguage(initialLang);
        if (users) setUniqueUsers(users);
        if (chatHistory && Array.isArray(chatHistory)) {
          setMessages(chatHistory);
        }
        if (assignedColor) {
          setUserColor(assignedColor);
          sessionStorage.setItem(`room_color_${roomId}`, assignedColor);
        }
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

    socket.on("user-list-update", ({ users }) => {
      setUniqueUsers(users);
    });

    socket.on("user-left", ({ username: leftUser, users }) => {
      setUniqueUsers(users);

      const isStillInRoom = users?.some((u) => u.username === leftUser);

      if (!isStillInRoom && leftUser && leftUser !== username) {
        toast(`${leftUser} left the room.`, {
          icon: "👋",
          style: { background: "#333", color: "#fff" },
        });
      }
    });

    socket.on("join-error", (msg) => {
      toast.error(msg, { style: { background: "#333", color: "#fff" } });
      navigate("/", { state: { targetRoomId: roomId }, replace: true });
    });

    socket.on("error", (msg) => {
      toast.error(msg, { style: { background: "#333", color: "#fff" } });
      navigate("/", { state: { targetRoomId: roomId }, replace: true });
    });

    socket.on("receive-language-change", (newLang) => {
      setLanguage(newLang);
    });

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

    socket.on("receive-message", (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    return () => {
      socket.off("connect");
      socket.off("room-init");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("receive-language-change");
      socket.off("receive-execution-result");
      socket.off("user-list-update");
      socket.off("receive-message");
      socket.off("error");
      socket.off("join-error");
    };
  }, [roomId, username, password, navigate]);

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    socket.emit("language-change", { roomId, language: newLang });
  };

  const handleRunCode = async () => {
    setIsLoading(true);
    setIsTerminalOpen(true);

    const BACKEND_URL =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

    const currentCode = editorRef?.current?.getValue() || "";
    setCode(currentCode);

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

      if (editorRef.current?.setTerminalState) {
        editorRef.current.setTerminalState(resultOutput, hasError, timeTaken);
      }

      updateExecutionMarkers(resultOutput, hasError);

      socket.emit("code-executed", {
        roomId,
        output: resultOutput,
        isError: hasError,
        executionTime: timeTaken,
      });
    }
  };

  const handleDownloadCode = () => {
    const currentCode =
      typeof editorRef?.current?.getValue === "function"
        ? editorRef.current.getValue()
        : code;

    if (!currentCode) return;

    const extensionMap = {
      javascript: "js",
      python: "py",
      cpp: "cpp",
      java: "java",
    };

    const ext = extensionMap[language] || "txt";
    const blob = new Blob([currentCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `collaborative-code-${roomId}.${ext}`;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="app-container"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
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
            onClick={() => setShowLeaveModal(true)}
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

          <button
            onClick={handleDownloadCode}
            style={{
              backgroundColor: "#333",
              color: "#fff",
              border: "1px solid #555",
              borderRadius: "4px",
              padding: "5px 12px",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            💾 Download
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Sidebar
          activeUsers={activeUsers}
          username={username}
          userColor={userColor}
          isMuted={isMuted}
          toggleMute={toggleMute}
          isSelfSpeaking={isSelfSpeaking}
          speakingUsers={speakingUsers}
          messages={messages}
          socket={socket}
          roomId={roomId}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
            height: "100%",
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: "relative",
              width: "100%",
            }}
          >
            <Editor
              ref={editorRef}
              roomId={roomId}
              username={username}
              language={language}
              color={userColor}
              serverUrl={import.meta.env.VITE_WS_URL || "ws://localhost:5000"}
              onCodeChange={(newCode) => {
                setCode(newCode);
                updateExecutionMarkers("", false);
              }}
              onTerminalSync={({ output, isError, executionTime }) => {
                setOutput(output || "");
                setIsError(!!isError);
                setExecutionTime(executionTime || null);
                setIsTerminalOpen(true);

                setTimeout(() => {
                  updateExecutionMarkers(output || "", !!isError);
                }, 100);
              }}
            />
          </div>

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

      {peers.map(({ socketId, peer }) => (
        <AudioPlayer key={socketId} peer={peer} />
      ))}

      {/* Leave Modal */}
      {showLeaveModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "#252526",
              border: "1px solid #3c3c3c",
              borderRadius: "8px",
              padding: "20px",
              width: "320px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              color: "#fff",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>
              Leave Room?
            </h3>
            <p
              style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#aaa" }}
            >
              Are you sure you want to leave this room session?
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setShowLeaveModal(false)}
                style={{
                  backgroundColor: "#3a3a3a",
                  color: "#ccc",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLeave}
                style={{
                  backgroundColor: "#f44336",
                  color: "#fff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "bold",
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditorPage;
