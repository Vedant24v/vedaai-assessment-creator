import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF, TXT, DOC, DOCX files are allowed'));
  },
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const extractedText = (await extractText(req.file.buffer, ext)).slice(0, 3000);

    res.json({
      success: true,
      data: {
        fileName: req.file.originalname,
        extractedText,
      },
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: 'File upload failed' });
  }
});

async function extractText(buffer: Buffer, ext: string) {
  if (ext === '.txt') return buffer.toString('utf8');

  if (ext === '.pdf') {
    try {
      const pdfParse = await import('pdf-parse');
      const data = await pdfParse.default(buffer);
      return data.text || '';
    } catch (err) {
      console.warn('PDF text extraction failed:', err);
      return '';
    }
  }

  if (ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (err) {
      console.warn('DOCX text extraction failed:', err);
      return extractReadableText(buffer);
    }
  }

  if (ext === '.doc') {
    return extractReadableText(buffer);
  }

  return '';
}

function extractReadableText(buffer: Buffer) {
  return buffer
    .toString('utf8')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default router;
