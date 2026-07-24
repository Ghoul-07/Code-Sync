import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useState,
} from "react";
import MonacoEditor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

const Editor = forwardRef(
  (
    {
      roomId,
      username = "Anonymous",
      color = "#3b82f6",
      language = "javascript",
      serverUrl = "ws://localhost:5000",
      onCodeChange,
    },
    ref,
  ) => {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const ydocRef = useRef(null);
    const providerRef = useRef(null);
    const bindingRef = useRef(null);
    const ytextRef = useState(null);
    const isApplyingRemoteChange = useRef(false);

    // Track active decoration IDs for each remote user by socketId: { [socketId]: [decorationIds] }
    const remoteDecorations = useRef(new Map());

    // Expose a method to apply remote changes directly to Monaco
    useImperativeHandle(ref, () => ({
      getValue: () =>
        ytextRef.current?.toString() || editorRef?.current?.getValue() || "",

      setEditorValue: (newCode) => {
        if (!ytextRef.current) return;
        ydocRef.current.transact(() => {
          ytextRef.current.delete(0, ytextRef.current.length);
          ytextRef.current.insert(0, newCode);
        });
      },
    }));

    const handleEditorDidMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      editor.focus();

      // initialize Yjs document & websocket provider
      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;

      const provider = new WebsocketProvider(serverUrl, roomId, ydoc);
      providerRef.current = provider;

      // shared text type for monaco

      const ytext = ydoc.getText("monaco");
      ytextRef.current = ytext;

      // local Awareness (user list & cursors)
      provider.awareness.setLocalStateField("user", {
        username,
        color,
      });

      // sync Y.text --> Monaco editor
      const binding = new MonacoBinding(
        ytext,
        editor.getModel(),
        new Set([editor]),
        provider.awareness,
      );
      bindingRef.current = binding;

      // callback on code changes
      ytext.observe(() => {
        if (onCodeChange) {
          onCodeChange(ytext.toString());
        }
      });

      // 5. Yjs Awareness Observer --> Renders Remote cursors using out custom enigine
      provider.awareness.on("change", () => {
        const states = provider.awareness.getStates();
        const currentClientIds = new Set(states.keys());

        // clean up cursor decorations for any client that is disconnected/left

        remoteDecorations.current.forEach((_, cliendId) => {
          if (!currentClientIds.has(cliendId)) {
            removeRemoteCursor(cliendId);
          }
        });

        //update or create cursor decorations for currently connected remote clients
        states.forEach((state, clientId) => {
          if (clientId === provider.awareness.clientID) return; // skip self

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
      });

      // 6. Listen to curson/ selection changes --> update Yjs Awareness

      editor.onDidChangeCursorPosition((e) => {
        const selection = editor.getSelection();
        provider.awareness.setLocalStateField("cursor", {
          position: e.position,
          selection: selection
            ? {
                startLineNumber: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLineNumber: selection.endLineNumber,
                endColumn: selection.endColumn,
              }
            : null,
        });
      });
    };

    // update remote cursor and selection highlights
    const updateRemoteCursor = ({
      clientId,
      username,
      color,
      cursor,
      selection,
    }) => {
      if (!editorRef.current || !monacoRef.current) {
        return;
      }
      const editor = editorRef.current;
      const monaco = monacoRef.current;

      //  inject dynamic CSS
      const classPrefix = `user-cursor-${clientId}`;
      injectCursorStyle(classPrefix, color, username);

      const newDecorations = [];

      // Draw vertical cursor bar at user's cursor position
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

      // draw selection highlight if user highlighted text
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

      // apply new decorations and clear previous decorations
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

    // clean Yjs connections on unmount or roomId switch
    useEffect(() => {
      return () => {
        if (providerRef.current) {
          // notify peers that this client left
          providerRef.current.awareness.setLocalStateField(null);
          providerRef.current.destroy();
        }
        if (bindingRef.current) providerRef.current.destroy();
        if (ydocRef.current) ydocRef.current.destroy();
      };
    }, [roomId]);

    return (
      <div style={{ height: "100%", width: "100%" }}>
        <MonacoEditor
          height="100%"
          width="100%"
          theme="vs-dark"
          defaultLanguage={language}
          language={language}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
    );
  },
);

// clean up cursor when a user leaves

// Inject dynamic CSS rules for remote cursor vertical line and username badge tag
function injectCursorStyle(classPrefix, color, username) {
  const styleId = `cursor-style-${classPrefix}`;
  // If style already exists, remove it so we can update positional rules
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
    }
      /* Smart flip: move badge below cursor when user is on line 1 */
    .${classPrefix}-line-1::after{
      top: 20px !important;
    }
    .${classPrefix}-selection {
      background-color: ${color}44 !important;
    }
  `;
  document.head.appendChild(style);
}
export default Editor;
