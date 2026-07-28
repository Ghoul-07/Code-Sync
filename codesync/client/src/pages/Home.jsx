import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // 💡 State for joining password-protected rooms
  const [showJoinPasswordModal, setShowJoinPasswordModal] = useState(false);
  const [joinPassword, setJoinPassword] = useState("");
  const [showJoinPassword, setShowJoinPassword] = useState(false);

  const [roomId, setRoomId] = useState(location.state?.targetRoomId || "");
  const [username, setUsername] = useState("");

  const handleOpenCreateModal = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      return toast.error("Please enter a username first", {
        style: { background: "#333", color: "#fff" },
      });
    }

    const newId = uuidv4();
    setRoomId(newId);
    setCreatePassword("");
    setShowCreateModal(true);
  };

  const handleConfirmCreateRoom = async () => {
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
      const res = await axios.post(`${BACKEND_URL}/api/rooms/create`, {
        roomId,
        username,
        password: createPassword.trim(),
      });

      if (res.data.success) {
        toast.success("Created a new room session!", {
          style: { background: "#333", color: "#fff" },
        });
        setShowCreateModal(false);

        // Pass password in state to Editor
        navigate(`/editor/${roomId}`, {
          state: {
            username,
            password: createPassword.trim(),
          },
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create room", {
        style: { background: "#333", color: "#fff" },
      });
    }
  };

  // 💡 Handle Join with optional password support
  const handleJoin = async (overridePassword = joinPassword) => {
    if (!roomId.trim() || !username.trim()) {
      toast.error("ROOM ID & Username are required!", {
        style: { background: "#333", color: "#fff" },
      });
      return;
    }
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
      const res = await axios.get(
        `${BACKEND_URL}/api/rooms/${roomId}/check-access?username=${encodeURIComponent(
          username,
        )}&password=${encodeURIComponent(overridePassword)}`,
      );

      // If backend asks for password, pop up modal!
      if (res.data.requiresPassword) {
        setShowJoinPasswordModal(true);
        return;
      }

      if (res.data.allowed) {
        setShowJoinPasswordModal(false);
        navigate(`/editor/${roomId}`, {
          state: {
            username,
            password: overridePassword.trim(),
          },
        });
      }
    } catch (err) {
      const errData = err.response?.data;

      // If HTTP 401/200 says room is password protected
      if (errData?.requiresPassword) {
        setShowJoinPasswordModal(true);
        if (overridePassword && errData?.error) {
          toast.error(errData.error, {
            style: { background: "#333", color: "#fff" },
          });
        }
      } else {
        toast.error(errData?.error || "Cannot join room", {
          style: { background: "#333", color: "#fff" },
        });
      }
    }
  };

  const handleInputEnter = (e) => {
    if (e.code === "Enter") {
      handleJoin();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#1e1e1e",
        color: "#fff",
        fontFamily: "sans-serif",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          backgroundColor: "#252526",
          padding: "clamp(20px, 5vw, 30px)",
          borderRadius: "10px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0px 10px 30px rgba(0,0,0,0.5)",
          border: "1px solid #333",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <span style={{ fontSize: "28px" }}>💻</span>
          <h2 style={{ margin: 0, color: "#4ec9b0", fontSize: "20px" }}>
            Collaborative Code Editor
          </h2>
        </div>

        <p
          style={{
            color: "#888",
            fontSize: "13px",
            marginTop: 0,
            marginBottom: "20px",
            lineHeight: "1.4",
          }}
        >
          Paste invitation ROOM ID or create a new room session
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <div>
            <label
              style={{
                fontSize: "12px",
                color: "#aaa",
                display: "block",
                marginBottom: "5px",
              }}
            >
              Room ID
            </label>
            <input
              type="text"
              placeholder="ROOM ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyUp={handleInputEnter}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "5px",
                border: "1px solid #444",
                backgroundColor: "#333",
                color: "#fff",
                outline: "none",
                boxSizing: "border-box",
                fontSize: "14px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: "12px",
                color: "#aaa",
                display: "block",
                marginBottom: "5px",
              }}
            >
              Username
            </label>
            <input
              type="text"
              placeholder="USERNAME"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyUp={handleInputEnter}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "5px",
                border: "1px solid #444",
                backgroundColor: "#333",
                color: "#fff",
                outline: "none",
                boxSizing: "border-box",
                fontSize: "14px",
              }}
            />
          </div>

          <button
            onClick={() => handleJoin()}
            style={{
              padding: "12px",
              backgroundColor: "#007acc",
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: "bold",
              marginTop: "5px",
              fontSize: "14px",
            }}
          >
            Join Room
          </button>

          <span
            style={{
              fontSize: "12px",
              color: "#aaa",
              textAlign: "center",
              marginTop: "10px",
            }}
          >
            If you don't have an invite, create &nbsp;
            <a
              href="#"
              onClick={handleOpenCreateModal}
              style={{
                color: "#4ec9b0",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              new room
            </a>
          </span>
        </div>
      </div>

      {/* 💡 Create Room Password Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              backgroundColor: "#252526",
              border: "1px solid #3c3c3c",
              borderRadius: "8px",
              padding: "20px",
              width: "100%",
              maxWidth: "360px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              color: "#fff",
              boxSizing: "border-box",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "18px",
                color: "#4ec9b0",
              }}
            >
              Create New Room
            </h3>
            <p
              style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#aaa" }}
            >
              Set an optional password to protect your room session.
            </p>

            <div style={{ marginBottom: "15px" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "#aaa",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Generated Room ID
              </label>
              <input
                type="text"
                value={roomId}
                readOnly
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "5px",
                  border: "1px solid #444",
                  backgroundColor: "#1e1e1e",
                  color: "#888",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "#aaa",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Set Room Password (Optional)
              </label>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type={showCreatePassword ? "text" : "password"}
                  placeholder="Leave blank for public room"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  onKeyUp={(e) =>
                    e.key === "Enter" && handleConfirmCreateRoom()
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    paddingRight: "40px",
                    borderRadius: "5px",
                    border: "1px solid #444",
                    backgroundColor: "#333",
                    color: "#fff",
                    outline: "none",
                    boxSizing: "border-box",
                    fontSize: "14px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#aaa",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: 0,
                  }}
                  title={showCreatePassword ? "Hide password" : "Show password"}
                >
                  {showCreatePassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  backgroundColor: "#3a3a3a",
                  color: "#ccc",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreateRoom}
                style={{
                  backgroundColor: "#007acc",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "bold",
                }}
              >
                Create & Join
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💡 Join Password Prompt Modal (NEW) */}
      {showJoinPasswordModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              backgroundColor: "#252526",
              border: "1px solid #3c3c3c",
              borderRadius: "8px",
              padding: "20px",
              width: "100%",
              maxWidth: "360px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              color: "#fff",
              boxSizing: "border-box",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "18px",
                color: "#4ec9b0",
              }}
            >
              Password Required
            </h3>
            <p
              style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#aaa" }}
            >
              This room is password-protected. Enter password to join.
            </p>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "#aaa",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Room Password
              </label>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type={showJoinPassword ? "text" : "password"}
                  placeholder="ENTER ROOM PASSWORD"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  onKeyUp={(e) => e.key === "Enter" && handleJoin(joinPassword)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    paddingRight: "40px",
                    borderRadius: "5px",
                    border: "1px solid #444",
                    backgroundColor: "#333",
                    color: "#fff",
                    outline: "none",
                    boxSizing: "border-box",
                    fontSize: "14px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowJoinPassword(!showJoinPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#aaa",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: 0,
                  }}
                  title={showJoinPassword ? "Hide password" : "Show password"}
                >
                  {showJoinPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setShowJoinPasswordModal(false)}
                style={{
                  backgroundColor: "#3a3a3a",
                  color: "#ccc",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleJoin(joinPassword)}
                style={{
                  backgroundColor: "#007acc",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "bold",
                }}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
