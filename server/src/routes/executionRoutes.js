import { Router } from "express";
import { executeCode } from "../controllers/executionController.js";
const executionRouter = Router()

executionRouter.post('/', executeCode)

export default executionRouter