import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

function makeUpload(subdir: string) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(__dirname, '../../uploads', subdir));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, crypto.randomUUID() + ext);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });
}

export const uploadPhoto   = makeUpload('photos');
export const uploadReceipt = makeUpload('receipts');
