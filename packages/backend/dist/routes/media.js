"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|mp4|mp3|ogg|wav|pdf|doc|docx|xls|xlsx|txt|csv)$/i;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
const MIME_MAP = {
    IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    VIDEO: ['video/mp4'],
    AUDIO: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
    DOCUMENT: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
    ],
};
const ALL_ALLOWED_MIMES = Object.values(MIME_MAP).flat();
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname || '').toLowerCase();
        cb(null, `${crypto_1.default.randomUUID()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_EXTENSIONS.test(path_1.default.extname(file.originalname || ''))) {
            cb(new Error('Tipo de arquivo nao suportado'));
            return;
        }
        if (file.mimetype && !ALL_ALLOWED_MIMES.includes(file.mimetype)) {
            cb(new Error('Tipo MIME nao suportado'));
            return;
        }
        cb(null, true);
    },
});
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.post('/', upload.single('file'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    if (!req.file)
        throw new errors_js_1.ValidationError('Nenhum arquivo enviado');
    const ext = path_1.default.extname(req.file.originalname || '').toLowerCase();
    let mediaType = 'DOCUMENT';
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext))
        mediaType = 'IMAGE';
    else if (/\.(mp4)$/i.test(ext))
        mediaType = 'VIDEO';
    else if (/\.(mp3|ogg|wav)$/i.test(ext))
        mediaType = 'AUDIO';
    // Validate magic bytes for dangerous file types
    const DANGEROUS_SIGNATURES = [
        Buffer.from([0x4D, 0x5A]), // MZ — DOS/Windows executable
        Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK — could be jar/zip with executable
        Buffer.from([0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]), // <script — HTML/JS
        Buffer.from([0x3C, 0x68, 0x74, 0x6D, 0x6C]), // <html — HTML
    ];
    try {
        const fd = fs_1.default.openSync(req.file.path, 'r');
        const header = Buffer.alloc(8);
        fs_1.default.readSync(fd, header, 0, 8, 0);
        fs_1.default.closeSync(fd);
        for (const sig of DANGEROUS_SIGNATURES) {
            if (header.subarray(0, sig.length).equals(sig)) {
                fs_1.default.unlinkSync(req.file.path);
                throw new errors_js_1.ValidationError('Arquivo contém conteúdo potencialmente perigoso');
            }
        }
    }
    catch (err) {
        if (err instanceof errors_js_1.ValidationError)
            throw err;
        // If we can't read the file, continue — it will fail on use
    }
    const mediaUrl = `/uploads/${req.file.filename}`;
    res.status(201).json({
        mediaUrl,
        mediaType,
        originalName: req.file.originalname,
        size: req.file.size,
    });
}));
exports.default = router;
//# sourceMappingURL=media.js.map