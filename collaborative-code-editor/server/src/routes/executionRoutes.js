import { Router } from "express";
import { executeCode } from "../controllers/executionController.js";
const executionRouter = Router()

// Helper delay function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// ==========================================
// 🚀 CODE EXECUTION ENDPOINT (Sandbox)
// ==========================================

executionRouter.post('/', executeCode)

export default executionRouter