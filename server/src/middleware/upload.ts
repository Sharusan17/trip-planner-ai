import multer from 'multer';

// Use memory storage — files stored as BYTEA in PostgreSQL, not on disk
const storage = multer.memoryStorage();

function makeUpload(allowPdf = false) {
  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) return cb(null, true);
      if (allowPdf && file.mimetype === 'application/pdf') return cb(null, true);
      cb(new Error('Only image files are allowed'));
    },
  });
}

export const uploadPhoto   = makeUpload(false);
export const uploadReceipt = makeUpload(true); // receipts can be PDF
