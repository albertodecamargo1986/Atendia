"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBullBoard = setupBullBoard;
const api_1 = require("@bull-board/api");
const bullMQAdapter_js_1 = require("@bull-board/api/bullMQAdapter.js");
const express_1 = require("@bull-board/express");
const queues_js_1 = require("./queues.js");
function setupBullBoard(app) {
    const serverAdapter = new express_1.ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    (0, api_1.createBullBoard)({
        queues: [
            new bullMQAdapter_js_1.BullMQAdapter(queues_js_1.aiResponseQueue),
            new bullMQAdapter_js_1.BullMQAdapter(queues_js_1.whatsappOutboundQueue),
            new bullMQAdapter_js_1.BullMQAdapter(queues_js_1.offhoursMessageQueue),
        ],
        serverAdapter,
    });
    app.use('/admin/queues', serverAdapter.getRouter());
}
//# sourceMappingURL=bull-board.js.map