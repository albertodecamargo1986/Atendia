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
const ticketService = __importStar(require("../services/ticket.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await ticketService.listTickets(req.user.tenantId, {
        status: req.query.status,
        queueId: req.query.queueId,
        assignedTo: req.query.assignedTo,
        search: req.query.search,
        page: req.query.page ? parseInt(req.query.page) : undefined,
        withUnreadMessages: req.query.withUnreadMessages === 'true',
    });
    res.json(result);
}));
router.get('/stats', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const stats = await ticketService.getTicketStats(req.user.tenantId);
    res.json(stats);
}));
router.get('/queue-counts', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const counts = await ticketService.getTicketCountByQueue(req.user.tenantId);
    res.json(counts);
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const ticket = await ticketService.getTicket(req.user.tenantId, req.params.id);
    res.json(ticket);
}));
router.patch('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { status, assignedTo, queueId } = req.body;
    const ticket = await ticketService.updateTicket(req.user.tenantId, req.params.id, {
        status,
        assignedTo,
        queueId,
    });
    res.json(ticket);
}));
router.post('/:id/accept', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const ticket = await ticketService.acceptTicket(req.user.tenantId, req.params.id, req.user.sub);
    res.json(ticket);
}));
router.post('/:id/close', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const ticket = await ticketService.closeTicket(req.user.tenantId, req.params.id);
    res.json(ticket);
}));
router.post('/:id/reopen', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const ticket = await ticketService.reopenTicket(req.user.tenantId, req.params.id);
    res.json(ticket);
}));
router.post('/:id/read', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const ticket = await ticketService.markAsRead(req.user.tenantId, req.params.id);
    res.json(ticket);
}));
exports.default = router;
//# sourceMappingURL=tickets.js.map