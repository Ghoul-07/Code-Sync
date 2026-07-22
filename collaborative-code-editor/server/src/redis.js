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
    const data = await pubClient.hgetall(`room:${roomId}`)
    if(!data || Object.keys(data).length === 0) return null

    return {
        // if room has no code, fallback to default code once

        code: data.code !== undefined ? data.code : "// Start collaborating here!\n",
        users: data.users ? JSON.parse(data.users) : []
    }
}

/*
* Save/update room data in Redis
*/

export async function updateRoomCode(roomId, code){
    await pubClient.hset(`room:${roomId}`, "code", code)
}

/* 
 add or update a user in a room
*/
export async function addUserToRoom(roomId, user){
    const room = (await getRoom(roomId)) || { code: "// Start collaborating here!\n", users: [] }

    //filter our existing socket entries if present
    const updatedUsers = room.users.filter((u) => u.socketId !== user.socketId  && u.username !== user.username)
    updatedUsers.push(user)

    await pubClient.hset(
        `room:${roomId}`,
        "code", room.code,
        "users", JSON.stringify(updatedUsers)
    )

    return updatedUsers
}
/**
 * Removes a student from a room when they disconnect
 */

export async function removeUserFromRoom(roomId, socketId){
    const room = await getRoom(roomId)

    if(!room) return []

    const updatedUsers = room.users.filter((u) => u.socketId !== socketId)

    if(updatedUsers.length === 0){
        await pubClient.del(`room:${roomId}`)
    }
    else{
        await pubClient.hset(`room:${roomId}`, "users", JSON.stringify(updatedUsers))
    }
    return updatedUsers
}

