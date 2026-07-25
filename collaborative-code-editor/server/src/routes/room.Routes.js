import { Router } from "express";
import { getRoom } from "../redis.js";

const MAX_ROOM_CAPACITY = 6
const roomRouter = Router()

// pre validate if a username is taken or not

roomRouter.get('/:roomId/check-access', async (req, res)=>{
    try{
        const {roomId} = req.params
        const {username} = req.query

        if (!username || !roomId) {
            return res.status(400).json({ error: "Please enter ROOM ID and username" });
        }

        const room = await getRoom(roomId)
        const users = room? room.users : []
        // Capacity check

        if(users.length >= MAX_ROOM_CAPACITY){
            return res.status(403).json({
                allowed:false,
                error:`Room if full! Max ${MAX_ROOM_CAPACITY} members allowed`
            })
        }

        // check for duplicate username
        const isNameTaken = room?.users?.some(u => u.username === username)

        if(isNameTaken){
            return res.status(400).json({allowed:false , error:"Username is already taken"})
        }

        return res.status(200).json({allowed: true})
    } catch(err){
        return res.status(500).json({ allowed: false, error: "Server error" });
    }
})



export default roomRouter    