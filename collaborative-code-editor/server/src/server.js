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


app.get('/health', (req, res) =>{
    res.status(200).json({ status: 'OK', message: 'Server is healthy' })
})

// Socket connection lifecycle listener
io.on('connection', (socket) =>{
    console.log(`[SOCKET CONNECTED]: ${socket.id}`)

    socket.on('disconnect', ()=>{
        console.log(`[SOCKET DISCONNECTED]: ${socket.id}`)
    })
})

const PORT = process.env.PORT || 5000

server.listen(PORT, ()=>{
    console.log(`[SERVER RUNNING]: Listening on PORT ${PORt}`)
})
