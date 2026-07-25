import { useState, useEffect, useRef } from "react"
import Peer from "simple-peer/simplepeer.min.js";

export function useVoiceChat(socket, roomId, username){
    // Array of active peer objects : [{socketId, peer, stream}]
    const [peers, setPeers] = useState([])
    const [isMuted, setIsMuted] = useState(false)

    // socketIds currently speaking
    const [speakingUsers, setSpeakingUsers] = useState(new Set())
    const [isSelfSpeaking, setIsSelfSpeaking] = useState(false)

    const peersRef = useRef(new Map());      // map <SocketId, peerInstance>
    const localStreamRef = useRef(null)
    const audioContextRef = useRef(null)
    const animationFrameRef = useRef(null)

    const silenceTimeoutRef = useRef(null)
    
    // Helper for initiator (creates offer)
    function createPeer(userToSignal, stream){
        const peer = new Peer({
            initiator:true,
            trickle:false,   // simplifies setup by bundling candidates into one signal
            stream           // our local microphone stream
        })

        peer.on('signal', (offer)=>{
            socket.emit('webrtc-offer',{
                targetSocketId: userToSignal,
                offer
            })
        })

        return peer
    }

    // helper for receiving => (Accepts offer and creates answer)
    function addPeer(incomingOffer, callerSocketId, stream){
        const peer = new Peer({
            initiator:false,
            trickle:false,
            stream
        })

        peer.on('signal', (answer)=>{
            socket.emit('webrtc-answer', {
                targetSocketId: callerSocketId,
                answer
            })
        })

        // feed incoming offer into this new peer instance
        peer.signal(incomingOffer)

        return peer
    }
    // Get Local Microphone stream
    useEffect(()=>{
        if(!socket || !roomId) return;
    
        navigator.mediaDevices.getUserMedia({audio: true, video:false})
        .then((stream)=>{
            localStreamRef.current = stream

            // AUDIO VOLUME ANALYZER (ACTIVE SPEAKER DETECTION)
            try{    
                const AudioContext = window.AudioContext || window.webkitAudioContext
                const audioContext = new AudioContext()
                audioContextRef.current = audioContext

                const analyser = audioContext.createAnalyser()
                analyser.fftSize = 512

                const microphone = audioContext.createMediaStreamSource(stream)
                microphone.connect(analyser)

                const timeData = new Uint8Array(analyser.fftSize)
                let wasSpeaking = false

                const checkVolume = () =>{
                    const audioTrack = stream.getAudioTracks()[0]
                    
                    if( !audioTrack || !audioTrack.enabled){
                        if(wasSpeaking){
                            wasSpeaking = false;
                            setIsSelfSpeaking(false)
                            socket.emit('speaking-change', ({roomId, isSpeaking: false}))
                        }
                        animationFrameRef.current = requestAnimationFrame(checkVolume)
                        return 
                    }

                    // Get raw waveform time-domain data
                    analyser.getByteTimeDomainData(timeData)

                    // computing Root Mean Square (RMS)

                    let sumSquare = 0
                    for(let i = 0; i < timeData.length; i++){
                        const sample =  (timeData[i] - 128) / 128
                        sumSquare += sample * sample
                    }

                    const rms = Math.sqrt(sumSquare / timeData.length)

                    const isSpeakingNow = rms > 0.012

                    if (isSpeakingNow) {
                        if (!wasSpeaking) {
                            wasSpeaking = true;
                            setIsSelfSpeaking(true);
                            socket.emit("speaking-change", { roomId, isSpeaking: true });
                        }
                        // Reset silence timer every time audio is above threshold
                        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
                        } else {
                        if (wasSpeaking && !silenceTimeoutRef.current) {
                            // Wait 300ms of quiet before turning OFF the speaking badge
                            silenceTimeoutRef.current = setTimeout(() => {
                                wasSpeaking = false;
                                setIsSelfSpeaking(false);
                                socket.emit("speaking-change", { roomId, isSpeaking: false });
                                silenceTimeoutRef.current = null;
                            }, 300);
                        }
                        }

                    animationFrameRef.current - requestAnimationFrame(checkVolume)
                }

                checkVolume()
            } catch(err){
                console.error('Audio analyzer setup failed: ', err)
            }

            // ------ WEBRTC SOCKET LISTENERS ----- 

            // 1. Existing users sees a new user join -> Initiates WebRTC Offer
            socket.on('user-joined', ({socketId: newUserSocketId})=>{
                if(peersRef.current.has(newUserSocketId)) return;

                const peer = createPeer(newUserSocketId, stream)
                peersRef.current.set(newUserSocketId, peer)

                setPeers((prev) => [...prev, {socketId:newUserSocketId, peer}])
            })

            // 2. New User receives offer from existing user => creates answer

            socket.on('webrtc-offer', ({fromSocketId, offer})=>{
                const peer = addPeer(offer, fromSocketId, stream)
                peersRef.current.set(fromSocketId, peer)

                setPeers((prev) => [...prev, {fromSocketId, peer}])
            })

            // 3. Initiator receives answer, --> Connection complete

            socket.on('webrtc-answer', ({fromSocketId, answer})=>{
                const peer = peersRef.current.get(fromSocketId)
                if(peer){
                    peer.signal(answer)
                }
            })

            // 4. user leaves or disconnectse -> destry connection
            socket.on('user-left', ({socketId: leftUserId})=>{
                const peer = peersRef.current.get(leftUserId)
                if(peer){
                    peer.destroy()
                    peersRef.current.delete(leftUserId)
                }

                setPeers((prev) => prev.filter((p) => p.socketId !== leftUserId))
                setSpeakingUsers((prev) =>{
                    const next = new Set(prev)
                    next.delete(leftUserId)
                    return next
                })
            })

            // Listening for speaking changes from remote users
            socket.on('user-speaking-changed', ({socketId: speakerSocketId, isSpeaking}) => {
                setSpeakingUsers((prev) =>{
                    const next = new Set(prev)
                    if(isSpeaking){
                        next.add(speakerSocketId)
                    }
                    else{
                        next.delete(speakerSocketId)
                    }
                    return next
                })
            })
        })
        .catch((err)=>{
            console.error("[VOICE CHAT] Microphone permission denied or device missing.", err)
        })
        
        // cleanup tracks on unmount
        return () =>{
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }
            if(animationFrameRef.current){
                cancelAnimationFrame(animationFrameRef.current)
            }
            if(localStreamRef.current){
                localStreamRef.current.getTracks().forEach((track) => track.stop())
            }
            if(audioContextRef.current){
                audioContextRef.current.close()
            }
            peersRef.current.forEach((peer) => peer.destroy())
            peersRef.current.clear()

            socket.off('user-joined')
            socket.off('webrtc-offer')
            socket.off('webrtc-answer')
            socket.off('user-left')
            socket.off('user-speaking-changed')
        }
    }, [socket, roomId])

    // toggle Mute / Unmute
    const toggleMute = () =>{
        if(localStreamRef.current){
            const audioTrack = localStreamRef.current.getAudioTracks()[0]
            if(audioTrack){
                audioTrack.enabled = !audioTrack.enabled
                setIsMuted(!audioTrack.enabled)
            }
        }
    }


    return {peers, isMuted, toggleMute, isSelfSpeaking, speakingUsers}
}