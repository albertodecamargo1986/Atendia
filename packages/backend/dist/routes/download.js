"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const router = (0, express_1.Router)();
const DOWNLOAD_URLS = {
    win: process.env.DOWNLOAD_URL_WIN || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA-Setup.exe',
    mac: process.env.DOWNLOAD_URL_MAC || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.dmg',
    linux: process.env.DOWNLOAD_URL_LINUX || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.AppImage',
};
const LATEST_VERSION = process.env.APP_VERSION || '1.0.0';
router.get('/latest', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    res.json({
        version: LATEST_VERSION,
        platforms: {
            win: { label: 'Windows (.exe)', url: DOWNLOAD_URLS.win },
            mac: { label: 'macOS (.dmg)', url: DOWNLOAD_URLS.mac },
            linux: { label: 'Linux (.AppImage)', url: DOWNLOAD_URLS.linux },
        },
    });
}));
router.get('/:platform', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { platform } = req.params;
    const url = DOWNLOAD_URLS[platform];
    if (!url)
        throw new errors_js_1.NotFoundError('Plataforma', platform);
    res.redirect(url);
}));
exports.default = router;
//# sourceMappingURL=download.js.map