import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Configure multer for audio file uploads
const audioDir = path.join(process.cwd(), "public", "uploads", "audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, audioDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `audio-${Date.now()}${ext}`);
  },
});

const audioUpload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

// ── POST /api/audio-transcription - Transcribe audio file ────────────────
router.post(
  "/transcribe",
  audioUpload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Process audio file
      const audioPath = file.path;
      const fileName = file.filename;

      console.log(`[Audio Transcription] Processing file: ${fileName}`);

      // For now, we'll use a placeholder transcription
      // In a production environment, you would integrate with:
      // 1. Google Cloud Speech API
      // 2. AWS Transcribe
      // 3. Azure Speech Services
      // 4. OpenAI Whisper API
      // 5. Or a local model like Coqui STT

      // Placeholder transcription (for testing)
      const transcribedText = generatePlaceholderTranscription();

      // Clean up the uploaded file (optional, can keep for re-processing)
      // fs.unlinkSync(audioPath);

      res.json({
        success: true,
        filename: fileName,
        text: transcribedText,
        message:
          "Audio transcription processed. For production use, integrate with a speech-to-text service.",
      });
    } catch (error: any) {
      console.error("Failed to transcribe audio:", error.message);
      res.status(500).json({
        error: "Failed to transcribe audio",
        details: error.message,
      });
    }
  }
);

// ── Helper function for placeholder transcription ──────────────────────
function generatePlaceholderTranscription(): string {
  // This is a placeholder that generates sample transcription
  // In production, replace this with actual speech-to-text API calls

  const sampleTranscriptions = [
    "During this meeting, we discussed the quarterly project roadmap and timeline expectations. Key action items include finalizing the design mockups by next Friday and scheduling a follow-up with the stakeholder team. We also reviewed the budget allocation and confirmed the resource assignments for the upcoming sprint.",
    "The client presented their requirements for the new feature implementation. We agreed on the technical specifications and discussed the integration points with existing systems. Next steps include creating detailed technical documentation and scheduling a design review session with the development team.",
    "Team sync-up covered the progress on current deliverables. We identified some blockers that need attention and assigned ownership for resolution. The timeline looks good for the current milestone, and we're on track to meet the delivery date.",
    "Discussion focused on performance optimization strategies. We reviewed the current metrics and identified key areas for improvement. Action items assigned include load testing, database query optimization, and implementing caching mechanisms.",
    "Requirements gathering session for the new module. Stakeholders provided detailed specifications and use cases. We documented the acceptance criteria and identified potential risks. Next meeting scheduled for detailed technical design review.",
  ];

  return sampleTranscriptions[
    Math.floor(Math.random() * sampleTranscriptions.length)
  ];
}

// ── Optional: Setup proper speech recognition (example with Coqui STT) ────
// To use Coqui STT (open-source speech-to-text), uncomment and configure:
/*
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function transcribeWithCoqui(audioPath: string): Promise<string> {
  try {
    // Requires Coqui STT to be installed on the system
    // Installation: https://github.com/coqui-ai/STT
    const { stdout } = await execPromise(`stt --audio ${audioPath}`);
    return stdout.trim();
  } catch (error) {
    console.error('Coqui STT transcription failed:', error);
    throw error;
  }
}
*/

// ── Optional: Setup with OpenAI Whisper API ────────────────────────────
// To use Whisper API, uncomment and configure:
/*
import OpenAI from 'openai';

async function transcribeWithWhisper(audioPath: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const file = fs.createReadStream(audioPath);
  const transcript = await openai.audio.transcriptions.create({
    file: file,
    model: 'whisper-1',
  });

  return transcript.text;
}
*/

export default router;
