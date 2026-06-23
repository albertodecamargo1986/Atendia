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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminService = __importStar(require("../services/admin.service.js"));
const onlineService = __importStar(require("../services/online.service.js"));
const mpSubscriptionService = __importStar(require("../services/mercadopago-subscription.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
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
/* ── Tenant Users Management ── */
router.get('/tenants/:tenantId/users', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const users = await adminService.adminListUsers(req.params.tenantId);
    res.json(users);
}));
router.post('/tenants/:tenantId/users', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const user = await adminService.adminCreateUser(req.params.tenantId, req.body);
    res.status(201).json(user);
}));
router.delete('/users/:userId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await adminService.adminDeleteUser(req.params.userId);
    res.json(result);
}));
router.post('/users/:userId/reset-password', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6)
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    const result = await adminService.adminResetPassword(req.params.userId, password);
    res.json(result);
}));
/* ── Coupons ── */
router.get('/coupons', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const coupons = await adminService.listCoupons();
    res.json(coupons);
}));
router.post('/coupons', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const coupon = await adminService.createCoupon(req.body);
    res.status(201).json(coupon);
}));
router.post('/coupons/:id/toggle', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const coupon = await adminService.toggleCouponStatus(req.params.id);
    res.json(coupon);
}));
router.delete('/coupons/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await adminService.deleteCoupon(req.params.id);
    res.json(result);
}));
/* ── Trial Extension ── */
router.post('/tenants/:id/extend-trial', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { days } = req.body;
    if (!days || days < 1)
        return res.status(400).json({ error: 'Dias deve ser maior que 0' });
    const tenant = await adminService.extendTrial(req.params.id, days);
    res.json(tenant);
}));
/* ── Audit Logs ── */
router.get('/audit-logs', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const tenantId = req.query.tenantId;
    const action = req.query.action;
    const where = {};
    if (tenantId)
        where.tenantId = tenantId;
    if (action)
        where.action = action;
    const [logs, total] = await Promise.all([
        prisma_js_1.default.auditLog.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true, email: true } } },
        }),
        prisma_js_1.default.auditLog.count({ where }),
    ]);
    res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
}));
/* ── Mercado Pago Subscription Wizard ── */
router.get('/mercadopago/status', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const status = await mpSubscriptionService.getStatus(req.user.tenantId);
    res.json(status);
}));
router.post('/mercadopago/test-token', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { token } = req.body;
    if (!token)
        return res.status(400).json({ error: 'Token é obrigatório' });
    const result = await mpSubscriptionService.testToken(token);
    res.json(result);
}));
router.post('/mercadopago/setup-plans', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { token } = req.body;
    if (!token)
        return res.status(400).json({ error: 'Token é obrigatório' });
    const plans = await mpSubscriptionService.setupAllPlans(token);
    res.json({ plans });
}));
router.post('/mercadopago/save-config', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { accessToken, isSandbox, preapprovalPlanStarterId, preapprovalPlanProId, preapprovalPlanEnterpriseId, isActive } = req.body;
    if (!accessToken)
        return res.status(400).json({ error: 'accessToken é obrigatório' });
    const config = await mpSubscriptionService.saveConfig(req.user.tenantId, {
        accessToken, isSandbox: !!isSandbox,
        preapprovalPlanStarterId, preapprovalPlanProId, preapprovalPlanEnterpriseId, isActive: !!isActive,
    });
    res.json(config);
}));
exports.default = router;
//# sourceMappingURL=admin.js.map