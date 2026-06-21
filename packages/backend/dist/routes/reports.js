"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reportService = __importStar(require("../services/report.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('reports'));
router.get('/data', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await reportService.getReportData(req.user.tenantId, startDate, endDate, page, limit);
    res.json(result);
}));
router.get('/export', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const type = req.query.type || 'tickets';
    if (!['tickets', 'conversations', 'ratings'].includes(type)) {
        res.status(400).json({ error: 'Invalid export type' });
        return;
    }
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    const stream = reportService.streamCSV(req.user.tenantId, type, startDate, endDate);
    stream.pipe(res);
}));
exports.default = router;
//# sourceMappingURL=reports.js.map