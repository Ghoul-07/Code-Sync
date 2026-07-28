import { getRoom, updateRoomCode, removeUserFromRoom, addUserToRoom, updateRoomLanguage , addChatMessage, getRoomChats} from './redis.js'

const USER_COLORS = [
  "#FF5733", // Coral Red
  "#33FF57", // Bright Green
  "#3357FF", // Royal Blue
  "#F033FF", // Electric Pink
  "#33FFF0", // Cyan
  "#FFC300"  // Golden Yellow
];

const activeSpeakers = new Map()  // <roomId, Set<socketId>>
const MAX_ROOM_CAPACITY = 6


export const registerSocketHandlers = (io, socket) =>{
    

    // ----- JOIN-ROOM -----

    socket.on('join-room',  async ({roomId, username, password,preferredColor}) =>{
       
        let room = await getRoom(roomId)

        if (room && room.password) {
            if (!password || password !== room.password) {
                return socket.emit("error", "Invalid or missing room password");
            }
        }
        const existingUsers = room ? room.users : []

        const existingUser = existingUsers.find((u) => u.username === username);

        if(existingUser && existingUser.socketId !== socket.id){
            // check if that socket id is still actively connected to socket.io
          
            const activeSockets = await io.in(roomId).fetchSockets()
            const isStillConnected = activeSockets.some((s) => s.id === existingUser.socketId)

            // a user with same name already exists
            if(isStillConnected){

                socket.emit('join-error', 'Username already taken in the room')
                return;
            }

        }

        
        if(existingUsers.length >= MAX_ROOM_CAPACITY && !existingUser){
            return socket.emit('join-error', `Room is full! Max ${MAX_ROOM_CAPACITY} members allowed`)
        }

        // either a new join or refresh
        socket.join(roomId)

        const roomSpeakers = activeSpeakers.get(roomId)
        ? Array.from(activeSpeakers.get(roomId))
        : [];

        const usedColors = new Set(existingUsers.map((u) => u.color))
        const userColor = preferredColor || USER_COLORS.find((c) => !usedColors.has(c))

        socket.username = username
        socket.roomId = roomId        
        socket.color = userColor

         // save user to redis store
        const { updatedUsers } = await addUserToRoom(roomId, {
            socketId:socket.id,
            username,
            color:userColor
        })

    
        
        const chatHistory = await getRoomChats(roomId)        // fetch chats from redis

        // send current document state and full user list to the joinig user
        socket.emit('room-init', {
            code:room?.code || "",
            language:room?.language || 'javascript',
            users: updatedUsers,
            userColor,
            chatHistory,
            activeSpeakers: roomSpeakers
        })
       
        // notify other users in the room
        socket.to(roomId).emit('user-joined', {username, socketId: socket.id, users: updatedUsers, color:userColor})
    })

    // ----- CODE-DELTA -----
    socket.on('code-delta', async ({roomId, changes, fullCode}) =>{

        await updateRoomCode(roomId, fullCode)

        // broadcast delta changes to everyone else in the room
        socket.to(roomId).emit('receive-delta', changes)
    })

    // ----- CURSOR-POSITION -----
    socket.on('cursor-position', async ({roomId, cursor, selection}) =>{
        const username = socket.username || 'Anonymous'
        const color = socket.color || '#FF5733'

        // BROADCAST TO ALL USERS in same room
        socket.to(roomId).emit('receive-cursor', {
            socketId: socket.id,
            username,
            color,
            cursor,
            selection
        })
    })

    // ----- LANGUAGE CHANGE -----
    socket.on('language-change', async ({roomId, language})=>{
        await updateRoomLanguage(roomId, language)
        socket.to(roomId).emit("receive-language-change", language)
    })

    // ----- SHARED TERMINAL EXECUTION -----
    socket.on('code-executed', ({roomId, output, isError, executionTime}) =>{
        socket.to(roomId).emit('receive-execution-result', {
            output,
            isError,
            executionTime
        })
    })

    // ----- SEND MESSAGES -----
    socket.on('send-message', async ({roomId, message})=>{
        const username = socket.username || 'Anyonymous'
        const userColor = socket.color || '#007acc'

        const messageObj = {
            id: Date.now() + Math.random(),
            username,
            userColor,
            message,
            time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
        }

        // save to redis
        await addChatMessage(roomId, messageObj)

        io.to(roomId).emit('receive-message', messageObj)
    })

    // ----- WEB_RTC OFFER AND ANSWER -----

    // 1. Relay offer from Initiator to target peer
    socket.on('webrtc-offer', ({targetSocketId, offer})=>{
        io.to(targetSocketId).emit('webrtc-offer', {
            fromSocketId: socket.id,
            offer
        })
    })

    // 2. Relay answer from receiver back to Initiator
    socket.on('webrtc-answer', ({targetSocketId, answer})=>{
        io.to(targetSocketId).emit('webrtc-answer',{
            fromSocketId: socket.id,
            answer
        })
    })

    // 3. Relay ICE Candidates between Pairs
    socket.on('webrtc-ice-candidate', ({targetSocketId, candidate})=>{
        io.to(targetSocketId).emit('webrtc-ice-candidate',{
            fromSocketId: socket.id,
            candidate
        })
    })

    // ----- ACTIVE SPEAKER EVENT -----
    socket.on('speaking-change', ({roomId, isSpeaking}) =>{
        if(!activeSpeakers.has(roomId)){
            activeSpeakers.set(roomId, new Set())
        }

        const roomSpeakers = activeSpeakers.get(roomId)

        if(isSpeaking){
            roomSpeakers.add(socket.id)
        }
        else roomSpeakers.delete(socket.id)

        socket.to(roomId).emit('user-speaking-changed', {
            socketId: socket.id,
            isSpeaking
        })
    })

    // Replace socket.on('check-speaking-status') in your server socket handler with this:
    socket.on('check-speaking-status', ({ roomId }) => {
        const roomSpeakers = activeSpeakers.get(roomId)
            ? Array.from(activeSpeakers.get(roomId))
            : [];
        
        socket.emit('room-init', {
            activeSpeakers: roomSpeakers
        });
    });

    // ----- LEAVE/DISCONNECT HANDLERS -----
    const handleUserLeave = async (data = {})=>{
        const roomId = socket.roomId || data?.roomId
        if(!roomId) return

        // 1. Get room data from Redis to find the EXACT username attached to this socket.id
        const room = await getRoom(roomId);
        const leavingUserObj = room?.users?.find(u => u.socketId === socket.id);
        
        // Fall back to passed username or socket property
        const leavingUsername =  data?.username || socket.username || leavingUserObj?.username
        if(!leavingUsername) return

        socket.roomId = null
        socket.username = null
        socket.leave(roomId)

        const remainingUsers = await removeUserFromRoom(roomId, socket.id, leavingUsername)
        


        // 4. Deduplicate remaining users by username for the UI badges
        const uniqueUsers = Array.from(
            new Map(remainingUsers.map(u => [u.username, u])).values()
        );
        
        // 5. Check if the username still exists in Redis under another socket
        const isUserStillInRedis = remainingUsers.some((u) => u.username === leavingUsername);

        // Remove socket.id from activeSpeakers sets if present
        activeSpeakers.forEach((speakers, roomId) => {
            if (speakers.has(socket.id)) {
            speakers.delete(socket.id);
            socket.to(roomId).emit("user-speaking-changed", {
                socketId: socket.id,
                isSpeaking: false,
            });
            }
        });
       
        //  they ACTUALLY left, tell everyone else in the room WHO left
        if (!isUserStillInRedis) {
            io.to(roomId).emit('user-left', {
                socketId: socket.id,
                username: leavingUsername, // Explicitly send the leaving user's name!
                users: uniqueUsers
            });
        } else {
            // Just sync user badges if it was a refresh
            io.to(roomId).emit('user-list-update', {
                users: uniqueUsers,
            })
        }
    }

    socket.on('leave-room', handleUserLeave)
    socket.on('disconnect', handleUserLeave)
}

