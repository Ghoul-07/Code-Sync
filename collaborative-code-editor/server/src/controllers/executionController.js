import {exec } from 'child_process'
import { error } from 'console'
import fs, { mkdir } from 'fs'
import path from 'path'
import { stderr, stdout } from 'process'

export const executeCode = async(req, res) =>{
    const { code, language = 'javascript'} = req.body
    if(!code || !code.trim()){
        return res.status(400).json({error:"Code cannot be empty"})
    }

    const lang = language.toLowerCase()
    const fileId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.js`;


    let tempFilePath = ''
    let command = ''
    let cleanupPaths = []
    
    // configure execution command and files based on language

    if(lang === 'javascript'){
        tempFilePath = path.join(process.cwd(), `${fileId}.js`)
        command = `node ${tempFilePath}`
        cleanupPaths.push(tempFilePath)
    }
    else if(lang === 'python'){
        tempFilePath = path.join(process.cwd(), `${fileId}.py`)
        command = `python ${tempFilePath}`
        cleanupPaths.push(tempFilePath)
    }
    else if(lang === 'cpp' || lang === 'c++'){
        tempFilePath = path.join(process.cwd(), `${fileId}.cpp`)
        const exePath = path.join(process.cwd(), `${fileId}.exe`)

        command = `g++ "${tempFilePath}" -o "${exePath}" && "${exePath}"`
        cleanupPaths.push(tempFilePath, exePath)
    }   
    else if(lang === 'java'){
       // Java requires the class name to match the file name (Main.java)
        const javaDir = path.join(process.cwd(), fileId);
        fs.mkdirSync(javaDir, { recursive: true });

        tempFilePath = path.join(javaDir, 'Main.java');

        // PowerShell compatible command: compile first, then execute java with classpath
        command = `javac "${tempFilePath}" && java -cp "${javaDir}" Main`;
        cleanupPaths.push(javaDir);

        // Using cmd /c guarantees Windows command processor executes && cleanly without PowerShell syntax issues
        if (process.platform === 'win32') {
        command = `cmd /c "javac "${tempFilePath}" && java -cp "${javaDir}" Main"`;
        }
    }
    else{
        return res.status(400).json({
            error: `language ${lang} is not supported `
        })
    }

    const cleanup = ()=>{
        cleanupPaths.forEach((p)=>{
            if(fs.existsSync(p)){
                try{
                    fs.rmSync(p, {recursive: true, force:true})
                }catch(e){}
            }
        })
    }

    try{
        // write code to disc
        fs.writeFileSync(tempFilePath, code)
        const startTime = Date.now()

        // execute code with a 4 second timeout guard
        exec(command, {timeout: 4000}, (error, stdout, stderr) =>{
            const executionTime = Date.now() - startTime
            cleanup()

            if (error) {
                const isTimeout = error.killed || error.signal === 'SIGTERM';
                return res.status(200).json({
                output: isTimeout 
                    ? 'Execution Timed Out (4-second limit exceeded)' 
                    : (stderr || error.message),
                isError: true,
                executionTime
                });
            }

            return res.status(200).json({
                output: stdout || 'Program executed with no output.',
                isError: false,
                executionTime
            });
        }) 

    }catch(err){
        // write submitted code to file
        return res.status(500).json({error:'Internal execution error'})
    }
}   