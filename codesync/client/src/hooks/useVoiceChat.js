import { useState, useEffect, useRef } from "react";
import Peer from "simple-peer/simplepeer.min.js";
import axios from "axios";

const fetchIceServers = async () => {
  const STUN_FALLBACK = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
  try {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

    const res = await axios.get(`${BACKEND_URL}/api/credentials/turn-credentials`);

    if (typeof res.data === "string" || !Array.isArray(res.data)) {
      console.warn("[VOICE CHAT] Received non-array response, falling back to STUN:", res.data);
      return { iceServers: STUN_FALLBACK };
    }

    const iceServers = res.data;
    return { iceServers };
  } catch (err) {
    console.warn("[VOICE CHAT] Backend TURN fetch failed, falling back to public STUN:", err);
    return { iceServers: STUN_FALLBACK };
  }
};

export function useVoiceChat(socket, roomId, username) {
  const [peers, setPeers] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [isSelfSpeaking, setIsSelfSpeaking] = useState(false);

  const isSelfSpeakingRef = useRef(false);
  const isMutedRef = useRef(false);
  const peersRef = useRef(new Map()); // Map<socketId, peerInstance | "pending">
  const pendingSignalsRef = useRef(new Map()); // Map<socketId, signalData[]> — queued while peer is "pending"
  const remoteStreamsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const streamReadyRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const silenceTimeoutRef = useRef(null);

  // Flush any signal messages that arrived while a peer was still being constructed
  function flushPendingSignals(socketId, peer) {
    const queued = pendingSignalsRef.current.get(socketId);
    if (queued && queued.length) {
      queued.forEach((sig) => peer.signal(sig));
    }
    pendingSignalsRef.current.delete(socketId);
  }

  // Helper: Create initiator Peer (Offer)
  async function createPeer(userToSignal, stream) {
    const config = await fetchIceServers();

    const peer = new Peer({
      initiator: true,
      trickle: true,
      stream,
      config,
    });

    peer.on("signal", (signalData) => {
      socket.emit("webrtc-offer", {
        targetSocketId: userToSignal,
        offer: signalData,
      });
    });

    peer.on("stream", (remoteStream) => {
      remoteStreamsRef.current.set(userToSignal, remoteStream);
      setPeers((prev) =>
        prev.map((p) =>
          p.socketId === userToSignal ? { ...p, stream: remoteStream } : p
        )
      );
      socket.emit("check-speaking-status", { roomId });
    });

    peer.on("error", (err) => {
      console.error(`[WebRTC Error - Peer ${userToSignal}]:`, err);
    });

    peer.on("close", () => {
      console.log(`[PEER CLOSE] ${userToSignal} at ${new Date().toISOString()}`);
      peersRef.current.delete(userToSignal);
      pendingSignalsRef.current.delete(userToSignal);

      const remoteStream = remoteStreamsRef.current.get(userToSignal);
      if (remoteStream) {
        remoteStream.getTracks().forEach((track) => track.stop());
        remoteStreamsRef.current.delete(userToSignal);
      }

      setPeers((prev) => prev.filter((p) => p.socketId !== userToSignal));

      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userToSignal);
        return next;
      });
    });

    return peer;
  }

  // Helper: Create receiver Peer (Answer)
  async function addPeer(incomingOffer, callerSocketId, stream) {
    const config = await fetchIceServers();
    const peer = new Peer({
      initiator: false,
      trickle: true,
      stream,
      config,
    });

    peer.on("signal", (signalData) => {
      socket.emit("webrtc-answer", {
        targetSocketId: callerSocketId,
        answer: signalData,
      });
    });

    peer.on("stream", (remoteStream) => {
      remoteStreamsRef.current.set(callerSocketId, remoteStream);
      setPeers((prev) =>
        prev.map((p) =>
          p.socketId === callerSocketId ? { ...p, stream: remoteStream } : p
        )
      );
      socket.emit("check-speaking-status", { roomId });
    });

    peer.on("error", (err) => {
      console.error(`[WebRTC Error - Peer ${callerSocketId}]:`, err);
    });

    peer.on("close", () => {
      console.log(`[PEER CLOSE] ${callerSocketId} at ${new Date().toISOString()}`);
      peersRef.current.delete(callerSocketId);
      pendingSignalsRef.current.delete(callerSocketId);

      const remoteStream = remoteStreamsRef.current.get(callerSocketId);
      if (remoteStream) {
        remoteStream.getTracks().forEach((track) => track.stop());
        remoteStreamsRef.current.delete(callerSocketId);
      }

      setPeers((prev) => prev.filter((p) => p.socketId !== callerSocketId));

      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        next.delete(callerSocketId);
        return next;
      });
    });

    peer.signal(incomingOffer);
    return peer;
  }

  // 1. GET MICROPHONE STREAM & VOLUME ANALYZER
  useEffect(() => {
    let mounted = true;

    streamReadyRef.current = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      .then(async (stream) => {
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }

        localStreamRef.current = stream;

        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const audioContext = new AudioContext();

          if (audioContext.state === "suspended") {
            await audioContext.resume();
          }
          audioContextRef.current = audioContext;

          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;

          const microphone = audioContext.createMediaStreamSource(stream);
          microphone.connect(analyser);

          const timeData = new Uint8Array(analyser.fftSize);
          let wasSpeaking = false;

          const checkVolume = () => {
            const audioTrack = stream.getAudioTracks()[0];

            if (!audioTrack || !audioTrack.enabled || isMutedRef.current) {
              if (wasSpeaking) {
                wasSpeaking = false;
                setIsSelfSpeaking(false);
                isSelfSpeakingRef.current = false;
                socket?.emit("speaking-change", { roomId, isSpeaking: false });
              }
              animationFrameRef.current = requestAnimationFrame(checkVolume);
              return;
            }

            analyser.getByteTimeDomainData(timeData);

            let sumSquare = 0;
            for (let i = 0; i < timeData.length; i++) {
              const sample = (timeData[i] - 128) / 128;
              sumSquare += sample * sample;
            }

            const rms = Math.sqrt(sumSquare / timeData.length);
            const isSpeakingNow = rms > 0.012;
            isSelfSpeakingRef.current = isSpeakingNow;

            if (isSpeakingNow) {
              if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
                silenceTimeoutRef.current = null;
              }

              if (!wasSpeaking) {
                wasSpeaking = true;
                setIsSelfSpeaking(true);
                socket?.emit("speaking-change", { roomId, isSpeaking: true });
              }
            } else {
              if (wasSpeaking && !silenceTimeoutRef.current) {
                silenceTimeoutRef.current = setTimeout(() => {
                  wasSpeaking = false;
                  setIsSelfSpeaking(false);
                  socket?.emit("speaking-change", { roomId, isSpeaking: false });
                  silenceTimeoutRef.current = null;
                }, 300);
              }
            }

            animationFrameRef.current = requestAnimationFrame(checkVolume);
          };

          checkVolume();
        } catch (err) {
          console.error("Audio analyzer setup failed: ", err);
        }

        return stream;
      })
      .catch((err) => {
        console.error("[VOICE CHAT] Microphone permission error:", err);
        return null;
      });

    return () => {
      mounted = false;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [roomId, socket]);

  // 2. SOCKET LISTENERS (REGISTERED IMMEDIATELY)
  useEffect(() => {
    if (!socket || !roomId || !username) return;

    const handleUserJoined = async ({ socketId: newUserSocketId }) => {
      console.log(`[JOIN] ${newUserSocketId} at ${new Date().toISOString()}`);

      // Covers both an existing real peer AND a "pending" placeholder
      if (peersRef.current.has(newUserSocketId)) return;

      // Reserve the slot SYNCHRONOUSLY, before any await
      // Any webrtc-offer/answer messages for this socketId that arrive while
      // we're still fetching TURN creds / stream get queued instead of
      // spawning a second Peer.
      peersRef.current.set(newUserSocketId, "pending");

      const streamPromise = streamReadyRef.current;
      if (!streamPromise) {
        peersRef.current.delete(newUserSocketId);
        return;
      }

      const stream = await streamPromise;
      if (!stream) {
        peersRef.current.delete(newUserSocketId);
        return;
      }

      const peer = await createPeer(newUserSocketId, stream);
      peersRef.current.set(newUserSocketId, peer);
      flushPendingSignals(newUserSocketId, peer);

      setPeers((prev) => [
        ...prev,
        { socketId: newUserSocketId, peer, stream: null },
      ]);
    };

    const handleWebRTCOffer = async ({ fromSocketId, offer }) => {
      const existingPeer = peersRef.current.get(fromSocketId);

      if (existingPeer === "pending") {
        // Peer construction already in flight — queue this offer/candidate
        // instead of racing a second addPeer() call
        const q = pendingSignalsRef.current.get(fromSocketId) || [];
        q.push(offer);
        pendingSignalsRef.current.set(fromSocketId, q);
        return;
      }

      if (existingPeer) {
        existingPeer.signal(offer);
        return;
      }

      // Reserve the slot SYNCHRONOUSLY before any await
      peersRef.current.set(fromSocketId, "pending");

      const streamPromise = streamReadyRef.current;
      if (!streamPromise) {
        peersRef.current.delete(fromSocketId);
        return;
      }

      const stream = await streamPromise;
      if (!stream) {
        peersRef.current.delete(fromSocketId);
        return;
      }

      const peer = await addPeer(offer, fromSocketId, stream);
      peersRef.current.set(fromSocketId, peer);
      flushPendingSignals(fromSocketId, peer);

      setPeers((prev) => [
        ...prev,
        { socketId: fromSocketId, peer, stream: null },
      ]);
    };

    const handleWebRTCAnswer = ({ fromSocketId, answer }) => {
      const peer = peersRef.current.get(fromSocketId);

      if (peer === "pending") {
        const q = pendingSignalsRef.current.get(fromSocketId) || [];
        q.push(answer);
        pendingSignalsRef.current.set(fromSocketId, q);
        return;
      }

      if (peer) {
        peer.signal(answer);
      }
    };

    const handleUserLeft = ({ socketId: leftUserId }) => {
      console.log(`[LEFT] ${leftUserId} at ${new Date().toISOString()}`);
      const peer = peersRef.current.get(leftUserId);
      pendingSignalsRef.current.delete(leftUserId);

      if (peer && peer !== "pending") {
        peer.destroy();
      } else {
        // Was still "pending" — just clear the reservation, nothing to destroy
        peersRef.current.delete(leftUserId);
        setPeers((prev) => prev.filter((p) => p.socketId !== leftUserId));
      }
    };

    const handleUserSpeakingChanged = ({ socketId: speakerSocketId, isSpeaking }) => {
      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        if (isSpeaking) next.add(speakerSocketId);
        else next.delete(speakerSocketId);
        return next;
      });
    };

    const handleCheckSpeakingStatus = () => {
      if (isSelfSpeakingRef.current || silenceTimeoutRef.current) {
        socket.emit("speaking-change", { roomId, isSpeaking: true });
      }
    };

    const handleRoomInit = ({ activeSpeakers }) => {
      if (activeSpeakers && Array.isArray(activeSpeakers)) {
        setSpeakingUsers((prev) => {
          const next = new Set(prev);
          activeSpeakers.forEach((id) => next.add(id));
          return next;
        });
      }
    };

    socket.on("user-joined", handleUserJoined);
    socket.on("webrtc-offer", handleWebRTCOffer);
    socket.on("webrtc-answer", handleWebRTCAnswer);
    socket.on("user-left", handleUserLeft);
    socket.on("user-speaking-changed", handleUserSpeakingChanged);
    socket.on("check-speaking-status", handleCheckSpeakingStatus);
    socket.on("room-init", handleRoomInit);

    return () => {
      peersRef.current.forEach((peer) => {
        if (peer && peer !== "pending") peer.destroy();
      });
      peersRef.current.clear();
      pendingSignalsRef.current.clear();

      remoteStreamsRef.current.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      remoteStreamsRef.current.clear();

      socket.off("user-joined", handleUserJoined);
      socket.off("webrtc-offer", handleWebRTCOffer);
      socket.off("webrtc-answer", handleWebRTCAnswer);
      socket.off("user-left", handleUserLeft);
      socket.off("user-speaking-changed", handleUserSpeakingChanged);
      socket.off("check-speaking-status", handleCheckSpeakingStatus);
      socket.off("room-init", handleRoomInit);
    };
  }, [socket, roomId, username]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const nextMuteState = !audioTrack.enabled;
        setIsMuted(nextMuteState);
        isMutedRef.current = nextMuteState;
      }
    }
  };

  return { peers, isMuted, toggleMute, isSelfSpeaking, speakingUsers };
}