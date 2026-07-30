import React, { useEffect, useRef } from "react";

export function AudioPlayer({ peer }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const handleStream = (remoteStream) => {
      console.log("🎧 Remote audio stream received from peer!", remoteStream);
      if (!audioRef.current) return;

      audioRef.current.srcObject = remoteStream;

      const playAttempt = audioRef.current.play();
      if (playAttempt !== undefined) {
        playAttempt.catch((err) => {
          console.warn(
            "[AudioPlayer] Autoplay blocked, will retry on next click:",
            err,
          );

          const retryPlay = () => {
            audioRef.current
              ?.play()
              .then(() =>
                console.log(
                  "[AudioPlayer] Playback started after user interaction",
                ),
              )
              .catch((e) =>
                console.warn("[AudioPlayer] Retry play failed:", e),
              );
            document.removeEventListener("click", retryPlay);
          };
          document.addEventListener("click", retryPlay);
        });
      }
    };

    peer.on("stream", handleStream);
    return () => peer.off("stream", handleStream);
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
