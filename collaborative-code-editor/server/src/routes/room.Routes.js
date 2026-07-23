import { Router } from "express";
import { getRoom } from "../redis.js";

const roomRouter = Router()

// pre validate if a username is taken or not

roomRouter.get('/:roomId/check-name', async (req, res)=>{
    const {roomId} = req.params
    const {username} = req.query

    if (!username) {
        return res.status(400).json({ error: "Username parameter is required" });
    }

    const room = await getRoom(roomId)
    const isNameTaken = room?.users?.some(u => u.username === username)

    if(isNameTaken){
        return res.status(400).json({error:"Username is already taken"})
    }

    return res.status(200).json({valid:true})
})

export default roomRouter