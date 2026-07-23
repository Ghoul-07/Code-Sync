import Redis from 'ioredis'
import dotenv from 'dotenv'

dotenv.config()

const redisUrl = process.env.REDIS_URL

if(!redisUrl){
    console.erorr("REDIS_URL missing in env")
}

// create pub sub clients for Socket.io adapter
export const pubClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    tls: {rejectUnauthorized: false}
})


export const subClient = pubClient.duplicate()
pubClient.on("connect", ()=> console.log("⚡ Connected to Upstash Redis (Pub)"))
pubClient.on("error", (err) => console.error("Redis Pub Error: ", err))

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
        users: room.users ? JSON.parse(room.users) : []
    }
}

/*
* Save/update room data in Redis
*/

export async function updateRoomCode(roomId, code){
    await pubClient.hset(`room:${roomId}`, "code", code)
}

export async function updateRoomLanguage(roomId, language){
    await pubClient.hset(`room:${roomId}`, {language})
}

/* 
 add or update a user in a room
*/
export async function addUserToRoom(roomId, user){
    const room = (await getRoom(roomId))
    
    const existingUsers = (room && Array.isArray(room.users)) ? room.users : [];

    //filter our existing socket entries if present
    const updatedUsers = existingUsers.filter((u) => u.socketId !== user.socketId  && u.username !== user.username)

    updatedUsers.push(user)

    await pubClient.hset(
        `room:${roomId}`,
        "users", JSON.stringify(updatedUsers)
    )

    return updatedUsers
}
/**
 * Removes a student from a room when they disconnect
 */

export async function removeUserFromRoom(roomId, socketId, username){
    const room = await getRoom(roomId)

    if(!room) return []

    const existingUsers = Array.isArray(room.users) ? room.users : [];

    // we should be removing the user with the matching socketId and username
    const updatedUsers = existingUsers.filter((u) => {
        // Check if socketId matches (only if socketId was provided)
        const matchesSocket = socketId && u.socketId === socketId;

        // Check if username matches (only if username was provided)
        const matchesUsername = username && u.username?.toLowerCase() === username?.toLowerCase();

        // Drop the user if EITHER condition matches!
        // (Keep them only if NEITHER matched)
        return !(matchesSocket || matchesUsername);
    } )

    if(updatedUsers.length === 0){
        await pubClient.del(`room:${roomId}`)
    }
    else{
        await pubClient.hset(`room:${roomId}`, "users", JSON.stringify(updatedUsers))
    }
    return updatedUsers
}

