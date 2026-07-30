import Redis from 'ioredis'
import dotenv from 'dotenv'

dotenv.config()

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379'

if(!process.env.REDIS_URL){
    console.error("REDIS_URL missing in env, falling back to local/docker redis")
}

const isTls = redisUrl.startsWith('rediss://')

const redisOptions = {
    maxRetriesPerRequest: null,
    ...(isTls && {tls: { rejectUnauthorized: false } })
}
// create pub sub clients for Socket.io adapter
export const pubClient = new Redis(redisUrl, redisOptions)
export const subClient = pubClient.duplicate()

pubClient.on("connect", ()=> console.log(`⚡ Connected to Redis (${isTls ? 'Cloud/TLS' : 'Local/Docker'})`))
pubClient.on("error", (err) => console.error("Redis Pub Error: ", err))

subClient.on("error", (err) => console.error("Redis Sub Error: ", err.message))
// ==========================================
// REDIS ROOM STATE HELPERS
// ==========================================



/**
 * Get room data from Redis
 */

export async function getRoom(roomId){
    const room = await pubClient.hgetall(`room:${roomId}`)
    if(!room || Object.keys(room).length === 0) return null

    return {
        // if room has no code, fallback to default code once

        code: room.code !== undefined ? room.code : "",
        language: room.language || 'javascript',
        users: room.users ? JSON.parse(room.users) : [],
        password:room.password || null
    }
}

/*
* Save/update room data in Redis
*/

export async function updateRoomCode(roomId, code){
    await pubClient.hset(`room:${roomId}`, "code", code)
}

export async function updateRoomLanguage(roomId, language){
    await pubClient.hset(`room:${roomId}`, "language" , language)
}

/* 
 add or update a user in a room
*/
export async function addUserToRoom(roomId, user){
    const room = (await getRoom(roomId))
    
    const existingUsers = (room && Array.isArray(room.users)) ? room.users : [];

    const updatedUsers = existingUsers.filter((u) => {
        if (!u) return false;

        if (user.socketId && u.socketId === user.socketId) return false;
        if (user.username && u.username === user.username) return false;
        return true;
    });

    
    updatedUsers.push(user)
    
    await pubClient.hset(
        `room:${roomId}`,
        "users", JSON.stringify(updatedUsers)
    )

    // a user actually joined, persist the room
    await pubClient.persist(`room:${roomId}`)

    return {updatedUsers}
}

/**
 * Removes a user from a room when they disconnect.
 * Atomically reads, filters, and deletes the room (+ chat history)
 * if it becomes empty — avoids race conditions from concurrent disconnects.
 */
export async function removeUserFromRoom(roomId, socketId, username) {
    const key = `room:${roomId}`
    const chatsKey = `room:${roomId}:chats`

    const script = `
        local usersRaw = redis.call('HGET', KEYS[1], 'users')
        if not usersRaw then return '[]' end

        local ok, users = pcall(cjson.decode, usersRaw)
        if not ok or type(users) ~= 'table' then return '[]' end

        local updated = {}
        for _, u in ipairs(users) do
            local matchesSocket = (ARGV[1] ~= '' and u.socketId == ARGV[1])
            local matchesUsername = (ARGV[2] ~= '' and u.username == ARGV[2])
            if not (matchesSocket or matchesUsername) then
                table.insert(updated, u)
            end
        end

        if #updated == 0 then
            redis.call('DEL', KEYS[1])
            redis.call('DEL', KEYS[2])
        else
            redis.call('HSET', KEYS[1], 'users', cjson.encode(updated))
        end

        return cjson.encode(updated)
    `

    try {
        const result = await pubClient.eval(
            script,
            2,           // number of KEYS
            key, chatsKey,
            socketId || '', username || ''
        )
        return JSON.parse(result)
    } catch (err) {
        console.error("Redis removeUserFromRoom Error: ", err)
        return []
    }
}


/*
    Save a chat message to redis room chat history
*/
export async function addChatMessage(roomId, messageObj){
    try{
        const key = `room:${roomId}:chats`
        const res = await pubClient.rpush(key, JSON.stringify(messageObj))

        // keep only last 100 messages to control memory
        await pubClient.ltrim(key, -100, -1)

        // auto expire chat history after 24 hours
        await pubClient.expire(key, 86400)
        
    }catch(err){
        console.error("Redis addChatMessage Error: ", err)
    }
}

/*
    Get all chat messages for a room
*/

export async function getRoomChats(roomId) {
    try{

        const key = `room:${roomId}:chats`

        const rawChats = await pubClient.lrange(key, 0, -1)
       

        if(!rawChats || rawChats.length === 0) return []

        return rawChats.map((msg) => JSON.parse(msg))
    } catch(err){
        console.error("Redis getRoomChats history", err)
    }
}