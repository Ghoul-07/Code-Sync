import React, { useEffect, useState, useRef } from "react";
import Editor from "./components/Editor";
import { socket } from "./socket";

const ROOM_ID = "demo-room";

function App() {
  const [code, setCode] = useState(
    '// Welcome to Collaborative Code Editor!\n// Start typing code here...\n\nfunction hello() {\n  console.log("Hello World!");\n}',
  );

  const editorRef = useRef(null);

  useEffect(() => {
    socket.emit("join-room", {
      roomId: ROOM_ID,
      username: "User-" + Math.floor(Math.random() * 1000),
    });

    //Listening for incoming updates from other clients

    socket.on("receive-delta", (changes) => {
      console.log("[DELTA RECEIVED:]", changes);
    });

    // clean up socket listeners
    return () => {
      socket.off("receive-delta");
    };
  }, []);

  function handleCodeChange(changes, fullCode) {
    setCode(fullCode);
    console.log("[DELTA EMITTED]:", changes);

    // emit only the lightweight delta to server
    socket.emit("code-delta", { roomId: ROOM_ID, changes });
  }

  return (
    <div className="app-container">
      <Editor code={code} onDeltaChange={handleCodeChange}></Editor>
    </div>
  );
}

export default App;
