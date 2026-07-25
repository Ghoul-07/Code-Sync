import React from "react";

const Terminal = ({
  output,
  isError,
  isLoading,
  executionTime,
  isOpen,
  setIsOpen,
}) => {
  return (
    <div
      style={{
        width: "100%",
        height: isOpen ? "180px" : "32px",
        backgroundColor: "#1e1e1e",
        borderTop: "1px solid #333",
        color: "#fff",
        fontFamily: "'Fira Code', 'Courier New', monospace",
        transition: "height 0.2s ease-in-out",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Terminal Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 16px",
          backgroundColor: "#252526",
          borderBottom: isOpen ? "1px solid #333" : "none",
          userSelect: "none",
          cursor: "pointer",
          fontSize: "12px",
          color: "#ccc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: "bold", color: "#ccc" }}>
            🖥️ TERMINAL OUTPUT
          </span>
          {executionTime && (
            <span style={{ fontSize: "11px", color: "#888" }}>
              ({executionTime}ms)
            </span>
          )}
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: "none",
            border: "none",
            color: "#aaa",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          {isOpen ? "▼ Minimize" : "▲ Expand"}
        </button>
      </div>

      {/* Terminal Content Body */}
      {isOpen && (
        <div
          style={{
            flex: 1,
            padding: "12px 16px",
            overflowY: "auto",
            backgroundColor: "#181818",
            color: isError ? "#ff6b6b" : "#4ec9b0",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
          }}
        >
          {isLoading ? (
            <div style={{ color: "#e5c07b" }}>
              ⏳ Executing code in sandbox container...
            </div>
          ) : output ? (
            output
          ) : (
            <span style={{ color: "#666" }}>
              Run your code to see shared output here...
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Terminal;
