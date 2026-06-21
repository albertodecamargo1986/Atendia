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
const userService = __importStar(require("../services/user.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.get('/', (0, auth_js_1.requireRole)('OWNER', 'ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const users = await userService.listUsers(req.user.tenantId);
    res.json(users);
}));
router.get('/stats', (0, auth_js_1.requireRole)('OWNER', 'ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const stats = await userService.getTeamStats(req.user.tenantId);
    res.json(stats);
}));
router.patch('/profile/me', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { name, currentPassword, newPassword } = req.body;
    const user = await userService.updateProfile(req.user.sub, req.user.tenantId, { name, currentPassword, newPassword });
    res.json(user);
}));
router.get('/:id', (0, auth_js_1.requireRole)('OWNER', 'ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const user = await userService.getUser(req.user.tenantId, req.params.id);
    res.json(user);
}));
router.post('/', (0, auth_js_1.requireRole)('OWNER', 'ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const user = await userService.createUser(req.user.tenantId, req.body, req.user.sub);
    res.status(201).json(user);
}));
router.patch('/:id', (0, auth_js_1.requireRole)('OWNER', 'ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const user = await userService.updateUser(req.user.tenantId, req.params.id, req.body, req.user.sub);
    res.json(user);
}));
router.post('/:id/toggle-active', (0, auth_js_1.requireRole)('OWNER', 'ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const user = await userService.toggleUserActive(req.user.tenantId, req.params.id, req.user.sub);
    res.json(user);
}));
router.delete('/:id', (0, auth_js_1.requireRole)('OWNER'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await userService.deleteUser(req.user.tenantId, req.params.id, req.user.sub);
    res.json({ message: 'Usuário removido com sucesso' });
}));
exports.default = router;
//# sourceMappingURL=users.js.map