import { Router } from "express";

const executionRouter = Router()

// Helper delay function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// ==========================================
// 🚀 CODE EXECUTION ENDPOINT (Sandbox)
// ==========================================

executionRouter.post('/', async (req, res) =>{
    const {code, language} = req.body

    const PAIZA_LANGUAGES = {
        javascript: "nodejs",
        python: "python3",
        cpp: "cpp",
        java: "java",
    };

    const targetLanguage = PAIZA_LANGUAGES[language] || "nodejs"
    try {
        // 1. Create execution job passing parameters directly via URL params
        const createRes = await axios.post("https://api.paiza.io/runners/create", null, {
            params: {
                source_code: code,
                language: targetLanguage,
                api_key: "guest"
            }
        });

        const id = createRes.data.id;

        if (!id) {
            throw new Error("Failed to initialize Paiza execution runner.");
        }

        // 2. Poll until status turns "completed"
        let status = "running";
        let detailsRes = null;
        let attempts = 0;

        while (status === "running" && attempts < 12) {
            await sleep(400); // Wait 400ms between polls
            detailsRes = await axios.get("https://api.paiza.io/runners/get_details", {
                params: {
                    id: id,
                    api_key: "guest"
                }
            });
            status = detailsRes.data.status;
            attempts++;
        }

        const { stdout, stderr, build_stdout, build_stderr, result } = detailsRes.data;

        // Combine stdout, compile outputs, or error streams
        const rawOutput = stdout || stderr || build_stdout || build_stderr;
        const output = (rawOutput && rawOutput.trim()) ? rawOutput.trim() : "Code executed with no output.";
        const hasError = result !== "success";

        return res.json({
            run:{
                code: hasError? 1: 0,
                output: output.trim()
            }
        })

    }catch(err){
       
        return res.json({
            run: {
                code: 1,
                output: `[SANDBOX ERROR]: ${err.message}`,
            },
        });
    }
})

export default executionRouter