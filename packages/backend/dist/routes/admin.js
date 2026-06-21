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
const adminService = __importStar(require("../services/admin.service.js"));
const onlineService = __importStar(require("../services/online.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, (0, auth_js_1.requireRole)('OWNER', 'ADMIN'));
/* ── Dashboard ── */
router.get('/dashboard', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
}));
/* ── Tenants ── */
router.get('/tenants', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const result = await adminService.listTenants(page, limit, search);
    res.json(result);
}));
router.get('/tenants/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenant = await adminService.getTenant(req.params.id);
    res.json(tenant);
}));
router.patch('/tenants/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenant = await adminService.updateTenant(req.params.id, req.body);
    res.json(tenant);
}));
/* ── Licenses ── */
router.get('/licenses', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const result = await adminService.listLicenses(page, limit, search);
    res.json(result);
}));
router.post('/licenses', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const license = await adminService.createLicense(req.body);
    res.status(201).json(license);
}));
router.post('/licenses/:id/revoke', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const license = await adminService.revokeLicense(req.params.id);
    res.json(license);
}));
/* ── Payments ── */
router.get('/payments', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await adminService.listPayments(page, limit);
    res.json(result);
}));
/* ── Customers ── */
router.get('/customers', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const search = req.query.search;
    const customers = await adminService.listCustomers(search);
    res.json(customers);
}));
/* ── Permissions ── */
router.get('/permissions', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const permissions = await adminService.getPermissions(req.user.tenantId);
    res.json(permissions);
}));
router.post('/permissions', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const perm = await adminService.upsertPermission({ tenantId: req.user.tenantId, ...req.body });
    res.json(perm);
}));
router.post('/permissions/seed', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    await adminService.seedDefaultPermissions(_req.user.tenantId);
    res.json({ message: 'Permissões padrão criadas com sucesso' });
}));
/* ── Settings ── */
router.get('/settings', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const settings = await adminService.getSystemSettings();
    res.json(settings);
}));
/* ── Online Users ── */
router.get('/online', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    // Se tiver tenantId na query, filtra por tenant
    const tenantId = req.query.tenantId;
    const result = await onlineService.getOnlineUsers(tenantId);
    res.json(result);
}));
router.get('/online/count', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const count = await onlineService.getOnlineCount();
    res.json({ online: count });
}));
exports.default = router;
//# sourceMappingURL=admin.js.map