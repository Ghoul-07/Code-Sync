import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useState,
} from "react";
import MonacoEditor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });

const Editor = forwardRef(
  (
    {
      roomId,
      username = "Anonymous",
      color = "#3b82f6",
      language = "javascript",
      serverUrl = "ws://localhost:5000",
      onCodeChange,
      onTerminalSync,
    },
    ref,
  ) => {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const ydocRef = useRef(null);
    const providerRef = useRef(null);
    const bindingRef = useRef(null);
    const ytextRef = useRef(null);

    const [status, setStatus] = useState("connecting");

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const remoteDecorations = useRef(new Map());

    useImperativeHandle(ref, () => ({
      editor: editorRef.current,
      monaco: monacoRef.current,

      getValue: () =>
        ytextRef.current?.toString() || editorRef?.current?.getValue() || "",

      setEditorValue: (newCode) => {
        if (!ytextRef.current || !ydocRef.current) return;
        ydocRef.current.transact(() => {
          ytextRef.current.delete(0, ytextRef.current.length);
          ytextRef.current.insert(0, newCode);
        });
      },

      setTerminalState: (output, isError, executionTime) => {
        if (!ydocRef.current) return;
        const yterminal = ydocRef.current.getMap("terminal");
        ydocRef.current.transact(() => {
          yterminal.set("output", output);
          yterminal.set("isError", isError);
          yterminal.set("executionTime", executionTime);
        });
      },
    }));

    // Layout Observer to dynamically calculate Monaco width on window resize

    useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth <= 768);
      window.addEventListener("resize", handleResize);

      const container = document.getElementById("editor-container");
      if (!container) return;

      const observer = new ResizeObserver(() => {
        if (editorRef.current) {
          editorRef.current.layout();
        }
      });

      observer.observe(container);

      return () => {
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
      };
    }, []);

    // Re-bind MonacoBinding & Awareness listeners (handles initial mount AND Vite restarts)
    const setupBinding = () => {
      if (!editorRef.current || !ydocRef.current || !providerRef.current)
        return;

      const editor = editorRef.current;
      const ydoc = ydocRef.current;
      const provider = providerRef.current;
      const ytext = ydoc.getText("monaco");

      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }

      // 1. Re-bind Y.text <--> Monaco Editor
      bindingRef.current = new MonacoBinding(
        ytext,
        editor.getModel(),
        new Set([editor]),
      );

      // 2. Re-attach Awareness Observer for Remote Cursors
      provider.awareness.off("change", handleAwarenessChange); // prevent duplicates
      provider.awareness.on("change", handleAwarenessChange);

      // 3. Re-publish initial awareness user state
      provider.awareness.setLocalStateField("user", {
        username,
        color,
      });

      // 4. Force awareness cursor update so remote users instantly see cursor on reconnect
      const selection = editor.getSelection();
      if (selection) {
        provider.awareness.setLocalStateField("cursor", {
          position: editor.getPosition(),
          selection: {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          },
        });
      }
    };

    useEffect(() => {
      if (providerRef.current && providerRef.current.awareness) {
        providerRef.current.awareness.setLocalStateField("user", {
          username,
          color,
        });
        // Trigger cursor decoration updates locally and remotely
        handleAwarenessChange();
      }
    }, [username, color]);

    // Awareness Change Handler for Remote Cursors
    const handleAwarenessChange = () => {
      if (!providerRef.current) return;
      const provider = providerRef.current;
      const states = provider.awareness.getStates();
      const currentClientIds = new Set(states.keys());

      // Remove decorations for disconnected clients
      remoteDecorations.current.forEach((_, clientId) => {
        if (!currentClientIds.has(clientId)) {
          removeRemoteCursor(clientId);
        }
      });

      // Render decorations for active clients
      states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;

        if (state.user && state.cursor) {
          updateRemoteCursor({
            clientId,
            username: state.user.username || "Developer",
            color: state.user.color || "#3b82f6",
            cursor: state.cursor.position,
            selection: state.cursor.selection,
          });
        } else {
          removeRemoteCursor(clientId);
        }
      });
    };

    // ------------------------------------------------------------------
    // Yjs & Provider Lifecycle
    // ------------------------------------------------------------------
    useEffect(() => {
      if (!roomId) return;

      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;

      const provider = new WebsocketProvider(serverUrl, roomId, ydoc, {
        connect: true,
        maxBackoffTime: 2500,
      });
      providerRef.current = provider;

      const ytext = ydoc.getText("monaco");
      ytextRef.current = ytext;

      // shared map for terminal state
      const yterminal = ydoc.getMap("terminal");

      yterminal.observe(() => {
        const terminalData = yterminal.toJSON();
        if (
          terminalData &&
          terminalData.output !== undefined &&
          onTerminalSync
        ) {
          onTerminalSync(terminalData);
        }
      });

      // Track Network Status
      const handleStatus = (event) => {
        if (!navigator.onLine) {
          setStatus("disconnected");
        } else {
          setStatus(event.status);
        }
      };
      provider.on("status", handleStatus);

      // Handle Sync & Reconnections
      const handleSync = (isSynced) => {
        if (isSynced) {
          setStatus("connected");
          setupBinding(); // Re-binds Monaco AND cursor awareness listeners

          // hydrate terminal on rejoin/refresh
          if (ydoc.current) {
            const yterminal = ydoc.current.getMap("terminal");
            const terminalData = yterminal.toJSON();
            if (
              terminalData &&
              terminalData.output !== undefined &&
              onTerminalSync
            ) {
              onTerminalSync(terminalData);
            }
          }
        }
      };
      provider.on("sync", handleSync);

      // Browser Network Handlers
      const handleOnline = () => {
        setStatus("connecting");
        if (provider) provider.connect();
      };

      const handleOffline = () => {
        setStatus("disconnected");
        if (provider) provider.disconnect();
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Cleanup
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);

        provider.off("status", handleStatus);
        provider.off("sync", handleSync);
        provider.awareness.off("change", handleAwarenessChange);

        if (provider.awareness) {
          provider.awareness.setLocalState(null);
        }

        if (bindingRef.current) {
          bindingRef.current.destroy();
          bindingRef.current = null;
        }

        provider.destroy();
        ydoc.destroy();
      };
    }, [roomId, serverUrl, username, color]);

    // ------------------------------------------------------------------
    // Monaco Editor Mount
    // ------------------------------------------------------------------
    const handleEditorDidMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      editor.focus();

      if (!navigator.onLine) {
        setStatus("disconnected");
      }

      setupBinding();

      const pushCursorState = () => {
        if (!providerRef.current) return;
        const position = editor.getPosition();
        const selection = editor.getSelection();
        if (!position) return;

        providerRef.current.awareness.setLocalStateField("cursor", {
          position,
          selection: selection
            ? {
                startLineNumber: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLineNumber: selection.endLineNumber,
                endColumn: selection.endColumn,
              }
            : null,
        });
      };

      editor.onDidChangeModelContent(() => {
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelMarkers(model, "execution-error", []);
        }
        pushCursorState();
      });

      if (ytextRef.current) {
        ytextRef.current.observe(() => {
          if (onCodeChange) {
            onCodeChange(ytextRef.current.toString());
          }
        });
      }

      editor.onDidChangeCursorPosition(pushCursorState);
    };

    const updateRemoteCursor = ({
      clientId,
      username,
      color,
      cursor,
      selection,
    }) => {
      if (!editorRef.current || !monacoRef.current) return;

      const editor = editorRef.current;
      const monaco = monacoRef.current;

      const classPrefix = `user-cursor-${clientId}`;
      injectCursorStyle(classPrefix, color, username);

      const newDecorations = [];

      // Draw vertical cursor bar at user's position
      if (cursor) {
        const isLineOne = cursor.lineNumber === 1;
        newDecorations.push({
          range: new monaco.Range(
            cursor.lineNumber,
            cursor.column,
            cursor.lineNumber,
            cursor.column,
          ),
          options: {
            className: `${classPrefix}-bar ${isLineOne ? `${classPrefix}-line-1` : ""}`,
            hoverMessage: { value: `**${username}**` },
          },
        });
      }

      // Draw selection highlight if text is highlighted
      if (
        selection &&
        (selection.startLineNumber !== selection.endLineNumber ||
          selection.startColumn !== selection.endColumn)
      ) {
        newDecorations.push({
          range: new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn,
          ),
          options: {
            className: `${classPrefix}-selection`,
          },
        });
      }

      const oldDecorations = remoteDecorations.current.get(clientId) || [];
      const updatedIds = editor.deltaDecorations(
        oldDecorations,
        newDecorations,
      );
      remoteDecorations.current.set(clientId, updatedIds);
    };

    const removeRemoteCursor = (clientId) => {
      if (!editorRef.current) return;
      const oldDecorations = remoteDecorations.current.get(clientId) || [];
      editorRef.current.deltaDecorations(oldDecorations, []);
      remoteDecorations.current.delete(clientId);
    };

    return (
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          backgroundColor: "#1e1e1e",
          overflow: "hidden",
        }}
      >
        {/* Connection Status Badge */}
        <div
          style={{
            position: "absolute",
            top: "4px",
            right: "8px",
            zIndex: 5,
            opacity: 0.85,
            padding: "2px 6px",
            borderRadius: "10px",
            fontSize: "10px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            backgroundColor:
              status === "connected"
                ? "#1e3a1e"
                : status === "connecting"
                  ? "#3a301e"
                  : "#3a1e1e",
            color:
              status === "connected"
                ? "#4caf50"
                : status === "connecting"
                  ? "#ff9800"
                  : "#f44336",
            border: `1px solid ${
              status === "connected"
                ? "#2e7d32"
                : status === "connecting"
                  ? "#f57c00"
                  : "#d32f2f"
            }`,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              backgroundColor:
                status === "connected"
                  ? "#4caf50"
                  : status === "connecting"
                    ? "#ff9800"
                    : "#f44336",
            }}
          />
          {status === "connected" && (isMobile ? "" : "Online")}
          {status === "connecting" && (isMobile ? "" : "Reconnecting...")}
          {status === "disconnected" &&
            (isMobile ? "" : "Offline (Edits Buffered)")}
        </div>

        <MonacoEditor
          height="100%"
          width="100%"
          theme="vs-dark"
          defaultLanguage={language}
          language={language}
          onMount={handleEditorDidMount}
          options={{
            fontSize: isMobile ? 12 : 14,
            minimap: { enabled: !isMobile },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            overviewRulerLanes: 0, // Disables vertical overview ruler line
            hideCursorInOverviewRuler: true, // Cleans up right edge gutter
            scrollbar: {
              verticalScrollbarSize: 8, // Slimmer vertical scrollbar
              horizontalScrollbarSize: 8,
            },
            padding: { bottom: 40 },
            cursorSurroundingLines: 3,
            inlayHints: { enabled: "off" },
          }}
        />
      </div>
    );
  },
);

// CSS overlay injection for username badge & vertical cursor line
function injectCursorStyle(classPrefix, color, username) {
  const styleId = `cursor-style-${classPrefix}`;
  const existingStyle = document.getElementById(styleId);
  if (existingStyle) {
    existingStyle.remove();
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.innerHTML = `
    .${classPrefix}-bar {
      border-left: 2px solid ${color} !important;
      margin-left: -1px;
      position: absolute !important;
      z-index: 100 !important;
    }
    .${classPrefix}-bar::after {
      content: "${username}";
      position: absolute;
      top: -18px;
      left: 0;
      background-color: ${color};
      color: #000;
      font-size: 10px;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 101 !important;
      box-shadow: 0px 2px 4px rgba(0,0,0,0.5);
      opacity: 1;
      animation: cursorLabelFade 1.6s ease forwards
    }

    @keyframes cursorLabelFade {
      0%   { opacity: 1; }
      65%  { opacity: 1; }
      100% { opacity: 0; }
    }
         
    .${classPrefix}-line-1::after {
      top: 20px !important;
    }
    .${classPrefix}-selection {
      background-color: ${color}44 !important;
    }
  `;
  document.head.appendChild(style);
}

export default Editor;
