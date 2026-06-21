"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onlineHeartbeat = onlineHeartbeat;
const online_service_js_1 = require("../services/online.service.js");
function onlineHeartbeat(req, _res, next) {
    if (req.user) {
        const userId = req.user.sub;
        const tenantId = req.user.tenantId;
        // Não precisa await — fire-and-forget
        (0, online_service_js_1.heartbeat)(userId, tenantId).catch(() => { });
    }
    next();
}
//# sourceMappingURL=online-heartbeat.js.map