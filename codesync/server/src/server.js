import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

// redis functions
import { createAdapter} from '@socket.io/redis-adapter'
import { pubClient, subClient } from './redis.js'

// routers
import roomRouter from './routes/room.Routes.js';
import executionRouter from './routes/executionRoutes.js';

// socket Handlers
import { registerSocketHandlers } from './socketHandlers.js';


dotenv.config()

const app = express()

// Enable CORS for our Frontend
const allowedOrigins = process.env.CLIENT_URL || 'http://localhost:5173'

const corsOptions = {
    origin:allowedOrigins,
    methods:['GET', 'POST'],
    credentials: true
}

app.use(cors(corsOptions))
app.use(express.json())


// HTTP server wrapping Express
const server = http.createServer(app)
// Attach Socket.io to the HTTP server
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
})

// attach Redis Pub/Sub adapter to Socket.io
io.adapter(createAdapter(pubClient, subClient))

// ------------------------------------------------------------------
// Yjs Real-Time CRDT WebSocket Setup
// ------------------------------------------------------------------

const wss = new WebSocketServer({noServer: true})

//Handle Websocket upgrade requests cleanly

server.on('upgrade', (request, socket, head) =>{
    const {pathname} = new URL(request.url, `http://${request.headers.host}`)
    // Route Socket.io requests to Socket.io, and all other WS upgrads to Yjs
    if(pathname.startsWith('/socket.io/')){
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) =>{
        wss.emit('connection', ws, request)
    })
})

wss.on('connection', (conn, req) =>{
    setupWSConnection(conn, req)
})

// ----------------------------------------------------------------------------------------------------------

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
