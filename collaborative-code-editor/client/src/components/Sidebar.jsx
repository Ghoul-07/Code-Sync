import React from "react";
import { socket } from "../socket";

function Sidebar({
  activeUsers,
  username,
  userColor,
  isMuted,
  toggleMute,
  isSelfSpeaking,
  speakingUsers,
}) {
  return (
    <div
      style={{
        width: "240px",
        backgroundColor: "#1e1e1e",
        borderRight: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        color: "#ccc",
        padding: "12px",
      }}
    >
      {/* Top Sections: Room Members and voice status*/}
      <div
        style={{
          fontSize: "12px",
          fontWeight: "bold",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: "#888",
          marginBottom: "12px",
        }}
      >
        Room Members ({activeUsers.length})
      </div>

      {/*User List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flex: 1,
          overflowY: "auto",
        }}
      >
        {activeUsers.map((u) => {
          const isMe = u.username === username;
          const isSpeaking = isMe
            ? isSelfSpeaking
            : speakingUsers.has(u.socketId);

          return (
            <div
              key={u.socketId || u.username}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#252526",
                padding: "8px 10px",
                border: isSpeaking ? "1px solid #22c553" : "1px solid #333", // Glowing green when speaking
                borderRadius: "6px",
                boxShadow: isSpeaking
                  ? "0 0 8px rgba(34, 197, 94, 0.4"
                  : "none",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {/* user color avatara badge */}
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: u.color || userColor || "#007acc",
                  }}
                />
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: isMe ? "bold" : "normal",
                    color: isMe ? "#fff" : "#ccc",
                  }}
                >
                  {u.username}
                  {isMe && "  (You)"}
                </span>

                {/* Speaking Animated Waves*/}
                {isSpeaking && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#22c55e",
                      animation: "pulse 1s infinite",
                    }}
                  >
                    🔊
                  </span>
                )}
              </div>

              {/*MIC Toggle button */}
              {isMe && (
                <button
                  onClick={toggleMute}
                  title={isMuted ? "Unmute Mic" : "Mute Mic"}
                  style={{
                    backgroundColor: isMuted ? "#dc2626" : "#16a34a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  {isMuted ? (
                    /* Muted Mic SVG */
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                      <line x1="12" y1="19" x2="12" y2="23"></line>
                      <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                  ) : (
                    /* Unmuted Mic SVG */
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                      <line x1="12" y1="19" x2="12" y2="23"></line>
                      <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Sidebar;
