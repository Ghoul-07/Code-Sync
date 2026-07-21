import React, { useRef, useEffect } from "react";
import MonacoEditor from "@monaco-editor/react";

const Editor = ({ code, onDeltaChange, language = "javascript" }) => {
  const editorRef = useRef(null);
  const isApplyingRemoteChange = useRef(false);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.focus();

    // Listen to granular content changes (Deltas)

    editor.onDidChangeModelContent((event) => {
      // if changes came from a remote user, dont re-emit it
      if (isApplyingRemoteChange.current) return;

      const changes = event.changes;
      if (onDeltaChange) {
        onDeltaChange(changes, editor.getValue());
      }
    });
  };

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <MonacoEditor
        height="100%"
        width="100%"
        theme="vs-dark"
        defaultLanguage={language}
        language={language}
        value={code}
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
};

export default Editor;
