import React, { useEffect, useRef } from "react";

export function AudioPlayer({ peer }) {
  const audioRef = useRef(null);

  useEffect(() => {
    // listen for remote audio stream from peers

    const handleStream = (remoteStream) => {
      console.log("🎧 Remote audio stream received from peer!", remoteStream);
      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream;
      }
    };

    peer.on("stream", handleStream);

    return () => {
      peer.off("stream", handleStream);
    };
  }, [peer]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
    />
  );
}
