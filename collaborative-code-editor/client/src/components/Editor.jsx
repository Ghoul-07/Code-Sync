import React, { useRef } from "react";
import MonacoEditor from "@monaco-editor/react";

const Editor = ({ code, onChange, language = "javascript" }) => {
  const editorRef = useRef(null);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
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
        onChange={onChange}
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
