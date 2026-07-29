import express from "express";

const credentialRouter = express.Router()

credentialRouter.get('/turn-credentials', async (req, res)=>{
  try{
    const appName = process.env.METERED_DOMAIN
    const apiKey = process.env.METERED_API_KEY

    const response = await fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`)

    if (!response.ok) {
      throw new Error(`Metered API returned status ${response.status}`);
    }

    const iceServers = await response.json()
    res.json(iceServers)
  }
  catch(err) {
    console.error("[TURN api error]: ", err)

    res.json([    
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" }
    ])
  }
})

export default credentialRouter