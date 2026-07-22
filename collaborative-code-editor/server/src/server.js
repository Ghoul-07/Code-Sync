import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import dotenv from 'dotenv';

import { createAdapter} from '@socket.io/redis-adapter'
import { pubClient, subClient, getRoom, updateRoomCode, removeUserFromRoom, addUserToRoom } from './redis.js'


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

// Socket connection lifecycle listener
io.on('connection', async (socket) =>{
    console.log(`[SOCKET CONNECTED]: ${socket.id}`)

    //User joins a room

    socket.on('join-room',  async ({roomId, username}) =>{
        socket.join(roomId)

        let room = await getRoom(roomId)
        const existingUsers = room ? room.users : []

        // color based on how many users are in the room
        const userColor = USER_COLORS[existingUsers.length % USER_COLORS.length]

        socket.username = username
        socket.color = userColor
        socket.roomId = roomId        

        // save user to redis store
        const updatedUsers = await addUserToRoom(roomId, {
            socketId:socket.id,
            username,
            color:userColor
        })

        // re-fetch state to send to joiner
        room = await getRoom(roomId)

        console.log(`[ROOM JOIN]: ${username} (${socket.id} joined room ${roomId})`)

        // send current document state and full user list to the joinig user
        socket.emit('room-init', {
            code:room.code,
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


    const handleUserLeave = async ()=>{
        

        const roomId = socket.roomId
        if(!roomId) return

        const username = socket.username

        socket.roomId = null
        socket.username = null
        socket.leave(roomId)

        const remainingUsers = await removeUserFromRoom(roomId, socket.id)
        
        console.log(`[ROOM LEAVE]: ${username} ${socket.id} left room ${roomId} `)

        socket.to(roomId).emit('user-left', {
            socketId: socket.id,
            username,
            users: remainingUsers

        })   
    }

    socket.on('leave-room', handleUserLeave)
    socket.on('disconnect', handleUserLeave)
})
const PORT = process.env.PORT || 5000

server.listen(PORT, ()=>{
    console.log(`[SERVER RUNNING]: Listening on PORT ${PORT}`)
})
