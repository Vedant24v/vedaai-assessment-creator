import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, TXT, DOC, DOCX files are allowed'));
    }
  },
});

// POST /api/upload - upload file and extract text
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    let extractedText = '';

    // Try to extract text from PDF
    if (req.file.mimetype === 'application/pdf') {
      try {
        const pdfParse = await import('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse.default(dataBuffer);
        extractedText = data.text.substring(0, 3000); // Limit to 3000 chars for prompt
      } catch {
        extractedText = '';
      }
    } else if (req.file.mimetype === 'text/plain') {
      extractedText = fs.readFileSync(filePath, 'utf-8').substring(0, 3000);
    }

    res.json({
      success: true,
      data: {
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        extractedText,
      },
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: 'File upload failed' });
  }
});

export default router;
