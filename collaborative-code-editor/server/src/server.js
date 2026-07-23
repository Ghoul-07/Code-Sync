import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import dotenv from 'dotenv';
import axios from 'axios'

import { createAdapter} from '@socket.io/redis-adapter'
import { pubClient, subClient, getRoom, updateRoomCode, removeUserFromRoom, addUserToRoom, updateRoomLanguage } from './redis.js'


dotenv.config()

const app = express()

// Enable CORS for our Frontend
app.use(cors())
app.use(express.json())


// HTTP server wrapping Express
const server = http.createServer(app)

// Attach Socket.io to the HTTP server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
})

// attach Redis Pub/Sub adapter to Socket.io
io.adapter(createAdapter(pubClient, subClient))

// Helper delay function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// ==========================================
// 🚀 CODE EXECUTION ENDPOINT (Sandbox)
// ==========================================

app.post('/api/execute', async (req, res) =>{
    const {code, language} = req.body

    const PAIZA_LANGUAGES = {
        javascript: "nodejs",
        python: "python3",
        cpp: "cpp",
        java: "java",
    };

    const targetLanguage = PAIZA_LANGUAGES[language] || "nodejs"
    try {
        // 1. Create execution job passing parameters directly via URL params
        const createRes = await axios.post("https://api.paiza.io/runners/create", null, {
            params: {
                source_code: code,
                language: targetLanguage,
                api_key: "guest"
            }
        });

        const id = createRes.data.id;

        if (!id) {
            throw new Error("Failed to initialize Paiza execution runner.");
        }

        // 2. Poll until status turns "completed"
        let status = "running";
        let detailsRes = null;
        let attempts = 0;

        while (status === "running" && attempts < 12) {
            await sleep(400); // Wait 400ms between polls
            detailsRes = await axios.get("https://api.paiza.io/runners/get_details", {
                params: {
                    id: id,
                    api_key: "guest"
                }
            });
            status = detailsRes.data.status;
            attempts++;
        }

        const { stdout, stderr, build_stdout, build_stderr, result } = detailsRes.data;

        // Combine stdout, compile outputs, or error streams
        const rawOutput = stdout || stderr || build_stdout || build_stderr;
        const output = (rawOutput && rawOutput.trim()) ? rawOutput.trim() : "Code executed with no output.";
        const hasError = result !== "success";

        return res.json({
            run:{
                code: hasError? 1: 0,
                output: output.trim()
            }
        })

    }catch(err){
       
        return res.json({
            run: {
                code: 1,
                output: `[SANDBOX ERROR]: ${err.message}`,
            },
        });
    }
})

const USER_COLORS = [
  "#FF5733", // Coral Red
  "#33FF57", // Bright Green
  "#3357FF", // Royal Blue
  "#F033FF", // Electric Pink
  "#33FFF0", // Cyan
  "#FFC300"  // Golden Yellow
];

app.get('/health', (req, res) =>{
    res.status(200).json({ status: 'OK', message: 'Server is healthy' })
})
const getHashColor = (username) =>{
    let hash = 0
    for(let i = 0; i < username.length; i++){
        hash  = username.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index  = Math.abs(hash) % USER_COLORS.length
    return USER_COLORS[index]
}

// Socket connection lifecycle listener
io.on('connection', async (socket) =>{
    console.log(`[SOCKET CONNECTED]: ${socket.id}`)

    //User joins a room

    socket.on('join-room',  async ({roomId, username}) =>{
        
        let room = await getRoom(roomId)
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

        // either a new join or refresh
        socket.join(roomId)

        // color based on how many users are in the room
        const userColor = getHashColor(username)

        socket.username = username
        socket.roomId = roomId        
        socket.color = userColor

        // save user to redis store
        const updatedUsers = await addUserToRoom(roomId, {
            socketId:socket.id,
            username,
            color:userColor

        })

        
        console.log(`[ROOM JOIN]: ${username} (${socket.id} joined room ${roomId})`)

        // send current document state and full user list to the joinig user
        socket.emit('room-init', {
            code:room?.code || "",
            language:room?.language || 'javascript',
            users: updatedUsers
        })

        // notify other users in the room
        socket.to(roomId).emit('user-joined', {username, socketId: socket.id, users: updatedUsers})
    })

    // handle granular delta changes
    socket.on('code-delta', async ({roomId, changes, fullCode}) =>{

        await updateRoomCode(roomId, fullCode)

    
        // broadcast delta changes to everyone else in the room
        socket.to(roomId).emit('receive-delta', changes)
    })

    socket.on('cursor-position', async ({roomId, cursor, selection}) =>{
        const username = socket.username || 'Anonymous'
        const color = socket.color || '$FF5733'

        // BROADCAST TO ALL USERS in same room
        socket.to(roomId).emit('receive-cursor', {
            socketId: socket.id,
            username,
            color,
            cursor,
            selection
        })
    })

    // Language change sync
    socket.on('language-change', async ({roomId, language})=>{
        await updateRoomLanguage(roomId, language)
        socket.to(roomId).emit("receive-language-change", language)
    })

    // Shared terminal execution result broadcast
    socket.on('code-executed', ({roomId, output, isError, executionTime}) =>{
        socket.to(roomId).emit('receive-execution-result', {
            output,
            isError,
            executionTime
        })
    })


    const handleUserLeave = async (data)=>{
        const roomId = socket.roomId
        if(!roomId) return

        // 1. Get room data from Redis to find the EXACT username attached to this socket.id
        const room = await getRoom(roomId);
        const leavingUserObj = room?.users?.find(u => u.socketId === socket.id);
        
        // Fall back to passed username or socket property
        const leavingUsername = leavingUserObj?.username || data?.username || socket.username;

        socket.roomId = null
        socket.username = null
        socket.leave(roomId)


        const remainingUsers = await removeUserFromRoom(roomId, socket.id)
        
        console.log(`[ROOM LEAVE]: ${leavingUsername} ${socket.id} left room ${roomId} `)
        if(!leavingUsername) return

        // 3. Check if this username is STILL in the room under another socket (e.g. refreshed tab)
        const isUserStillInRoom = remainingUsers.some((u) => u.username === leavingUsername);

        // 4. If they ACTUALLY left, tell everyone else in the room WHO left
        if (!isUserStillInRoom) {
            socket.to(roomId).emit('user-left', {
                socketId: socket.id,
                username: leavingUsername, // Explicitly send the leaving user's name!
                users: remainingUsers
            });
        } else {
            // Just sync user badges if it was a refresh
            socket.to(roomId).emit('user-joined', {
                username: leavingUsername,
                users: remainingUsers,
            })
        }
    }

    socket.on('leave-room', handleUserLeave)
    socket.on('disconnect', handleUserLeave)
})
const PORT = process.env.PORT || 5000

server.listen(PORT, ()=>{
    console.log(`[SERVER RUNNING]: Listening on PORT ${PORT}`)
})
