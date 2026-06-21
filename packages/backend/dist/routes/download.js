"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const router = (0, express_1.Router)();
const DOWNLOAD_URLS = {
    win: process.env.DOWNLOAD_URL_WIN || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA-Setup.exe',
    mac: process.env.DOWNLOAD_URL_MAC || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.dmg',
    linux: process.env.DOWNLOAD_URL_LINUX || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.AppImage',
};
const LATEST_VERSION = process.env.APP_VERSION || '1.0.0';
async function verifySerial(serial) {
    const license = await prisma_js_1.default.license.findFirst({
        where: { serial, status: { in: ['ACTIVE', 'INACTIVE'] } },
    });
    if (!license)
        return { valid: false };
    return { valid: true, licenseId: license.id };
}
// GET /download/latest — version info + available platforms
router.get('/latest', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const serial = req.query.serial || '';
    let isAuthorized = false;
    if (serial) {
        try {
            const result = await verifySerial(serial);
            isAuthorized = result.valid;
        }
        catch {
            isAuthorized = false;
        }
    }
    res.json({
        version: LATEST_VERSION,
        authorized: isAuthorized,
        platforms: {
            win: { label: 'Windows (.exe)', url: DOWNLOAD_URLS.win },
            mac: { label: 'macOS (.dmg)', url: DOWNLOAD_URLS.mac },
            linux: { label: 'Linux (.AppImage)', url: DOWNLOAD_URLS.linux },
        },
    });
}));
// GET /download/:platform — redirect to install URL (requires valid serial)
router.get('/:platform', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { platform } = req.params;
    const serial = req.query.serial || '';
    const url = DOWNLOAD_URLS[platform];
    if (!url) {
        throw new errors_js_1.NotFoundError('Plataforma', platform);
    }
    if (!serial) {
        throw new errors_js_1.ForbiddenError('Serial é obrigatório para download. Forneça ?serial=ATND-XXXX-XXXX-XXXX-XXXX');
    }
    let licenseId;
    try {
        const result = await verifySerial(serial);
        if (!result.valid) {
            throw new errors_js_1.ForbiddenError('Serial inválido ou licença não está ativa');
        }
        licenseId = result.licenseId;
    }
    catch (err) {
        if (err instanceof errors_js_1.ForbiddenError)
            throw err;
        throw new errors_js_1.ForbiddenError('Erro ao verificar serial');
    }
    try {
        if (licenseId) {
            await prisma_js_1.default.licenseEvent.create({
                data: {
                    licenseId,
                    eventType: 'ACTIVATE',
                    ip: req.ip,
                },
            });
        }
    }
    catch {
        // Don't block download if logging fails
    }
    res.redirect(url);
}));
exports.default = router;
//# sourceMappingURL=download.js.map