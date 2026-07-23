import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import dotenv from 'dotenv';

// redis functions
import { createAdapter} from '@socket.io/redis-adapter'
import { pubClient, subClient } from './redis.js'

// routers
import roomRouter from './routes/room.Routes.js';
import executionRouter from './routes/executionRoutes.js';

// socket Handlers
import { registerSocketHandlers } from './sockerHandlers.js';


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


// Routes
app.use('/api/execute', executionRouter)
app.use('/api/rooms/', roomRouter)
app.get('/health', (req, res) =>{
    res.status(200).json({ status: 'OK', message: 'Server is healthy' })
})


// Socket.io event listeners
io.on('connection', (socket)=>{
    registerSocketHandlers(io, socket)
})
const PORT = process.env.PORT || 5000

server.listen(PORT, ()=>{
    console.log(`[SERVER RUNNING]: Listening on PORT ${PORT}`)
})
