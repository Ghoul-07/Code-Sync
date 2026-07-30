import React, { useState, useEffect, useRef } from "react";

function Sidebar({
  activeUsers,
  username,
  userColor,
  isMuted,
  toggleMute,
  isSelfSpeaking,
  speakingUsers,
  messages = [],
  socket,
  roomId,
}) {
  const [inputText, setInputText] = useState("");
  const chatBottomRef = useRef(null);

  // Auto-scroll to latest chat message
  useEffect(() => {
    chatBottomRef?.current?.scrollIntoView({ behaviour: "smooth" });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    socket.emit("send-message", { roomId, message: inputText.trim() });
    setInputText("");
  };
  return (
    <div
      style={{
        width: "100%",
        backgroundColor: "#1e1e1e",
        borderRight: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        color: "#ccc",
        padding: "12px",
        boxSizing: "border-box",
        height: "100%",
      }}
    >
      {/* Top Sections: Room Members and voice status*/}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "#888",
            marginBottom: "10px",
          }}
        >
          Room Members ({activeUsers.length})
        </div>

        {/*User List */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            maxHeight: "150px",
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
                  padding: "6px 10px",
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
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: isMe ? "bold" : "normal",
                      color: isMe ? "#fff" : "#ccc",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "140px",
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
                      padding: "5px 7px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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

      {/*SECTION 2: TEXT CHAT */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderTop: "1px solid #333",
          paddingTop: "10px",
          minHeight: 0,
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "#888",
            marginBottom: "8px",
          }}
        >
          Chat Stream
        </div>

        {/* Message log */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflowY: "auto",
            gap: "8px",
            paddingRight: "4px",
            marginBottom: "8px",
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                fontSize: "13px",
                color: "#555",
                fontStyle: "italic",
                marginTop: "12px",
                textAlign: "center",
              }}
            >
              No messages yet.... Say Hi!
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.username === username;
              return (
                <div
                  key={msg.id}
                  style={{
                    backgroundColor: "#252526",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "2px",
                    }}
                  >
                    <span
                      style={{
                        color: msg.userColor || "#4ec9b0",
                        fontWeight: "bold",
                        fontSize: "11px",
                      }}
                    >
                      {msg.username}
                      {isMe && " (You)"}
                    </span>
                    <span style={{ fontSize: "10px", color: "#666" }}>
                      {msg.time}
                    </span>
                  </div>
                  <div style={{ color: "#ddd", wordBreak: "break-word" }}>
                    {msg.message}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={handleSendMessage}
          style={{ display: "flex", gap: "6px" }}
        >
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: "#2d2d2d",
              border: "1px solid #444",
              borderRadius: "4px",
              padding: "6px 8px",
              color: "#fff",
              fontSize: "12px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              backgroundColor: "#007acc",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default Sidebar;
