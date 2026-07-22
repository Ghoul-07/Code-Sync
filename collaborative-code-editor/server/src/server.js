const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
require('dotenv').config()

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

// Structure : {roomId : {code: string, users: [{socketId, username}]}}
const rooms = new Map()

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
io.on('connection', (socket) =>{
    console.log(`[SOCKET CONNECTED]: ${socket.id}`)

    //User joins a room

    socket.on('join-room', ({roomId, username}) =>{
        socket.join(roomId)
        if(!rooms.has(roomId)){
            rooms.set(roomId, {
                code: '// Start collaborating here!\n',
                users: []
            })
        }

        const room = rooms.get(roomId)

        // color based on how many users are in the room
        const userColor = USER_COLORS[room.users.length % USER_COLORS.length]

        socket.username = username
        socket.color = userColor
        socket.roomId = roomId        

        // add user to room's user list
        const existingUserIndex = room.users.findIndex(u => u.socketId === socket.id)
        if(existingUserIndex === -1){
            room.users.push({socketId: socket.id, username, color:userColor})
        }
        console.log(`[ROOM JOIN]: ${username} (${socket.id} joined room ${roomId})`)

        // send current document state and full user list to the joinig user
        socket.emit('room-init', {
            code:room.code,
            users: room.users
        })

        // notify other users in the room
        socket.to(roomId).emit('user-joined', {username, socketId: socket.id, users: room.users})
    })

    // handle granular delta changes
    socket.on('code-delta', ({roomId, changes, fullCode}) =>{
        if(rooms.has(roomId)){
            const room = rooms.get(roomId)
            if( fullCode !== undefined){
                room.code = fullCode
            }
        }

        // broadcast delta changes to everyone else in the room
        socket.to(roomId).emit('receive-delta', changes)
    })

    socket.on('cursor-position', ({roomId, cursor, selection}) =>{
        const username = socket.username || 'Anonymous'
        const color = socket.color || '$FF5733'

        console.log(`[CURSOR EVENT] From: ${username} (${socket.id}) -> Line ${cursor?.lineNumber}, Col ${cursor?.column}`)

        // BROADCAST TO ALL USERS in same room
        socket.to(roomId).emit('receive-cursor', {
            socketId: socket.id,
            username,
            color,
            cursor,
            selection
        })
    })


    socket.on('disconnect', ()=>{
        console.log(`[SOCKET DISCONNECTED]: ${socket.id}`)

        // remove user from any room they belonged to
        rooms.forEach((roomData, roomId)=>{
            const userIndex = roomData.users.findIndex(u => u.socketId === socket.id)
            if(userIndex !== -1){
                const disconnectedUser = roomData.users[userIndex]
                roomData.users.splice(userIndex, 1)

                // notifying remaining users
                io.to(roomId).emit('user-left', {
                    socketId: socket.id,
                    username: disconnectedUser.username,
                    users: roomData.users
                })

                // cleaning empty rooms
                if(roomData.users.length === 0){
                    rooms.delete(roomId)
                    console.log(`[ROOM CLEANUP]: Deleted empty room ${roomId}`);
                }
            }
        })
    })
})

const PORT = process.env.PORT || 5000

server.listen(PORT, ()=>{
    console.log(`[SERVER RUNNING]: Listening on PORT ${PORT}`)
})
