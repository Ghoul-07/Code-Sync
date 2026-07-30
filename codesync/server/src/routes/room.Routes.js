import { Router } from "express";
import { getRoom, pubClient } from "../redis.js";

const MAX_ROOM_CAPACITY = 6;
const roomRouter = Router();

// Pre-validate capacity, duplicate username, and room password access
roomRouter.get("/:roomId/check-access", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, password } = req.query;

    if (!username || !roomId) {
      return res
        .status(400)
        .json({ error: "Please enter ROOM ID and username" });
    }

    const room = await getRoom(roomId);

    // 💡 Password Check Logic
    if (room && room.password) {
      if (!password) {
        return res.status(200).json({
          allowed: false,
          requiresPassword: true,
          error: "This room requires a password.",
        });
      }

      if (password !== room.password) {
        return res.status(401).json({
          allowed: false,
          requiresPassword: true,
          error: "Incorrect room password!",
        });
      }
    }

    const users = room ? room.users : [];

    // Capacity check
    if (users.length >= MAX_ROOM_CAPACITY) {
      return res.status(403).json({
        allowed: false,
        error: `Room is full! Max ${MAX_ROOM_CAPACITY} members allowed`,
      });
    }

    // Check for duplicate username
    const isNameTaken = users.some((u) => u.username === username);

    if (isNameTaken) {
      return res
        .status(400)
        .json({ allowed: false, error: "Username is already taken" });
    }

    return res.status(200).json({ allowed: true });
  } catch (err) {
    return res.status(500).json({ allowed: false, error: "Server error" });
  }
});

// Create a new room with optional password
roomRouter.post("/create", async (req, res) => {
  const { roomId, username, password } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "RoomId is required" });
  }

  try {
    await pubClient.hset(`room:${roomId}`, {
      language: "javascript",
      code: "",
      password: password || "",
    });

    await pubClient.expire(`room:${roomId}`, 30)

    return res.json({ success: true, message: "Room created successfully" });

  } catch (err) {
    console.error("Room creation error: ",err)
    return res.status(500).json({ error: "Failed to create room " });
  }
});

export default roomRouter;