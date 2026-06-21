"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.licenseRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const license_service_js_1 = require("../services/license.service.js");
exports.licenseRouter = (0, express_1.Router)();
// ---------- Public endpoints (desktop app uses these) ----------
const activateSchema = zod_1.z.object({
    serial: zod_1.z.string().min(1),
    hwid: zod_1.z.string().min(1),
});
exports.licenseRouter.post('/activate', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success)
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    const result = await (0, license_service_js_1.activateLicense)(parsed.data.serial, parsed.data.hwid);
    res.json({ success: true, data: result });
}));
const validateSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    hwid: zod_1.z.string().min(1),
});
exports.licenseRouter.post('/validate', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success)
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    const result = await (0, license_service_js_1.validateLicense)(parsed.data.token, parsed.data.hwid);
    res.json({ success: true, data: result });
}));
const heartbeatSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    hwid: zod_1.z.string().min(1),
    ip: zod_1.z.string().min(1),
});
exports.licenseRouter.post('/heartbeat', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success)
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    const { token, hwid, ip } = parsed.data;
    // Verify token to get serial
    const payload = (0, license_service_js_1.verifyLicenseToken)(token);
    const license = await prisma_js_1.default.license.findUnique({ where: { serial: payload.sub } });
    if (!license)
        throw new errors_js_1.NotFoundError('Licença', payload.sub);
    const result = await (0, license_service_js_1.recordHeartbeat)(license.id, hwid, ip);
    res.json({ success: true, data: result });
}));
const transferSchema = zod_1.z.object({
    serial: zod_1.z.string().min(1),
    hwid: zod_1.z.string().min(1),
    transfer_token: zod_1.z.string().min(1),
});
exports.licenseRouter.post('/transfer', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success)
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    const result = await (0, license_service_js_1.transferLicense)(parsed.data.serial, parsed.data.hwid, parsed.data.transfer_token);
    res.json({ success: true, data: result });
}));
// ---------- Authenticated endpoints (admin panel) ----------
exports.licenseRouter.get('/', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const licenses = await (0, license_service_js_1.listLicenses)({ tenantId: req.user?.tenantId });
    res.json({ success: true, data: licenses });
}));
exports.licenseRouter.post('/', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        customerId: zod_1.z.string().min(1),
        plan: zod_1.z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
        periodMonths: zod_1.z.number().int().min(1).max(24),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    const license = await (0, license_service_js_1.createLicense)(parsed.data);
    res.status(201).json({ success: true, data: license });
}));
exports.licenseRouter.post('/:id/revoke', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const license = await (0, license_service_js_1.revokeLicense)(req.params.id);
    res.json({ success: true, data: license });
}));
//# sourceMappingURL=license.js.map