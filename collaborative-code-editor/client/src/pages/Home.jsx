import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

function Home() {
  const navigate = useNavigate();

  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");

  const location = useLocation();

  // useEffect(() => {
  //   if (location.state?.error) {
  //     toast.error(location.state.error, {
  //       id: "join-error-toast", // Prevents duplicate toasts
  //       duration: 4000,
  //       style: { background: "#333", color: "#fff" },
  //     });

  //     // Silently clear history state so page refreshes don't re-trigger the toast
  //     window.history.replaceState({}, document.title);
  //   }
  // }, [location.state?.error]);

  const createNewRoom = (e) => {
    e.preventDefault();
    const id = uuidv4();
    setRoomId(id);
    toast.success("Created a new room ID!", {
      style: { background: "#333", color: "#fff" },
    });
  };

  const handleJoin = async () => {
    if (!roomId.trim() || !username.trim()) {
      toast.error("ROOM ID & Username are required!", {
        style: { background: "#333", color: "#fff" },
      });
      return;
    }
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
      const res = await axios.get(
        `${BACKEND_URL}/api/rooms/${roomId}/check-name?username=${username}`,
      );
      // redirect to Editor route and pass username
      navigate(`/editor/${roomId}`, {
        state: { username },
      });
    } catch (err) {
      toast.error(err.response?.data?.error || "Cannot join room");
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
      }}
    >
      <div
        style={{
          backgroundColor: "#252526",
          padding: "30px",
          borderRadius: "10px",
          width: "400px",
          boxShadow: "0px 10px 30px rgba(0,0,0,0.5)",
          border: "1px solid #333",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <span style={{ fontSize: "28px" }}>💻</span>
          <h2 style={{ margin: 0, color: "#4ec9b0", fontSize: "22px" }}>
            Collaborative Code Editor
          </h2>
        </div>

        <p
          style={{
            color: "#888",
            fontSize: "14px",
            marginTop: 0,
            marginBottom: "20px",
          }}
        >
          Paste invitations ROOM ID or create a new room session
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
              }}
            />
          </div>

          <button
            onClick={handleJoin}
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
              onClick={createNewRoom}
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
    </div>
  );
}

export default Home;
