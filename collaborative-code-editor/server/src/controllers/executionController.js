import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Uses OS temp directory
const TEMP_DIR = os.tmpdir()

export const executeCode = async (req, res) => {
  const { code, language = 'javascript' } = req.body;

  if (!code || !code.trim()) {
    return res.status(400).json({ error: "Code cannot be empty" });
  }

  const lang = language.toLowerCase();
  const fileId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  let tempFilePath = '';
  let cmd = '';
  let args = [];
  let cleanupPaths = [];

  // Determine command and arguments safely without shell string interpolation
  if (lang === 'javascript') {
    tempFilePath = path.join(TEMP_DIR, `${fileId}.js`);
    cmd = 'node';
    args = [tempFilePath];
    cleanupPaths.push(tempFilePath);
  } else if (lang === 'python') {
    tempFilePath = path.join(TEMP_DIR, `${fileId}.py`);
    cmd = 'python'; // or 'python3' depending on system setup
    args = [tempFilePath];
    cleanupPaths.push(tempFilePath);
  } else if (lang === 'cpp' || lang === 'c++') {
    tempFilePath = path.join(TEMP_DIR, `${fileId}.cpp`);
    const exePath = path.join(TEMP_DIR, `${fileId}.exe`);
    cmd = process.platform === 'win32' ? 'cmd' : 'sh';
    const buildCmd = `g++ "${tempFilePath}" -o "${exePath}" && "${exePath}"`;
    args = process.platform === 'win32' ? ['/c', buildCmd] : ['-c', buildCmd];
    cleanupPaths.push(tempFilePath, exePath);
  } else if (lang === 'java') {
    const javaDir = path.join(TEMP_DIR, fileId);
    fs.mkdirSync(javaDir, { recursive: true });
    tempFilePath = path.join(javaDir, 'Main.java');
    
    cmd = process.platform === 'win32' ? 'cmd' : 'sh';
    const javaCmd = `javac "${tempFilePath}" && java -cp "${javaDir}" Main`;
    args = process.platform === 'win32' ? ['/c', javaCmd] : ['-c', javaCmd];
    cleanupPaths.push(javaDir);
  } else {
    return res.status(400).json({ error: `Language ${lang} is not supported` });
  }

  const cleanup = () => {
    cleanupPaths.forEach((p) => {
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
        } catch (e) {
          console.error('[Cleanup Warning]:', e.message);
        }
      }
    });
  };

  try {
    fs.writeFileSync(tempFilePath, code);
    const startTime = Date.now();

    // Run child process safely with streams and timeout
    const runProcess = () => {
      return new Promise((resolve) => {
        let stdoutData = '';
        let stderrData = '';
        let isTimedOut = false;

        const child = spawn(cmd, args);

        const timer = setTimeout(() => {
          isTimedOut = true;
          child.kill('SIGKILL');
        }, 4000);

        child.stdout?.on('data', (data) => {
          stdoutData += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderrData += data.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            output: stderrData || err.message || 'Failed to start execution process.',
            isError: true,
          });
        });

        child.on('close', (code) => {
          clearTimeout(timer);

          if (isTimedOut) {
            return resolve({
              output: 'Execution Timed Out (4-second limit exceeded)',
              isError: true,
            });
          }

          const hasFailed = code !== 0;
          resolve({
            output: hasFailed ? (stderrData || stdoutData || `Process exited with code ${code}`) : (stdoutData || 'Program executed with no output.'),
            isError: hasFailed,
          });
        });
      });
    };

    const result = await runProcess();
    const executionTime = Date.now() - startTime;
    cleanup();

    return res.status(200).json({
      output: result.output,
      isError: result.isError,
      executionTime,
    });

  } catch (err) {
    cleanup();
    console.error("[CRITICAL EXECUTION CATCH]:", err.message || err);
    return res.status(200).json({
      output: err.message || 'Internal Execution Exception',
      isError: true,
      executionTime: 0,
    });
  }
};