import React, { useEffect, useState } from "react";
import Editor from "./components/Editor";
import { socket } from "./socket";

const ROOM_ID = "demo-room";

function App() {
  const [code, setCode] = useState(
    '// Welcome to Collaborative Code Editor!\n// Start typing code here...\n\nfunction hello() {\n  console.log("Hello World!");\n}',
  );

  useEffect(() => {
    socket.emit("join-room", {
      roomId: ROOM_ID,
      username: "User-" + Math.floor(Math.random() * 1000),
    });

    //Listening for incoming updates from other clients

    socket.on("code-update", (newCode) => {
      setCode(newCode);
    });

    // clean up socket listeners
    return () => {
      socket.off("code-update");
    };
  }, []);
  function handleCodeChange(value) {
    const updatedCode = value || "";
    setCode(updatedCode);

    // emit code change event to server
    socket.emit("code-change", { roomId: ROOM_ID, code: updatedCode });
  }

  return (
    <div className="app-container">
      <Editor code={code} onChange={handleCodeChange}></Editor>
    </div>
  );
}

export default App;
