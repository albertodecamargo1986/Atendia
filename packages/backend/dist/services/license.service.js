"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSerial = generateSerial;
exports.ensureUniqueSerial = ensureUniqueSerial;
exports.verifyLicenseToken = verifyLicenseToken;
exports.activateLicense = activateLicense;
exports.validateLicense = validateLicense;
exports.recordHeartbeat = recordHeartbeat;
exports.checkTransferEligibility = checkTransferEligibility;
exports.transferLicense = transferLicense;
exports.createLicense = createLicense;
exports.revokeLicense = revokeLicense;
exports.listLicenses = listLicenses;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const hwid_js_1 = require("../lib/hwid.js");
const errors_js_1 = require("../lib/errors.js");
const index_js_1 = require("../config/index.js");
const SERIAL_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateSerial() {
    const segments = [];
    for (let s = 0; s < 4; s++) {
        let segment = '';
        for (let i = 0; i < 4; i++) {
            segment += SERIAL_CHARS[crypto_1.default.randomInt(0, SERIAL_CHARS.length)];
        }
        segments.push(segment);
    }
    return `ATND-${segments.join('-')}`;
}
async function ensureUniqueSerial() {
    let serial = generateSerial();
    let exists = true;
    while (exists) {
        const found = await prisma_js_1.default.license.findUnique({ where: { serial } });
        if (!found) {
            exists = false;
        }
        else {
            serial = generateSerial();
        }
    }
    return serial;
}
// Lazy-access config to avoid reading process.env directly
function getLicenseConfig() {
    const config = (0, index_js_1.getConfig)();
    return {
        JWT_SECRET: config.LICENSE_JWT_SECRET || config.JWT_SECRET,
        JWT_EXPIRES: config.LICENSE_JWT_EXPIRES_IN,
        OFFLINE_TOLERANCE_DAYS: config.OFFLINE_TOLERANCE_DAYS,
        TRANSFER_LIMIT_PER_YEAR: config.TRANSFER_LIMIT_PER_YEAR,
    };
}
function signLicenseToken(data) {
    const cfg = getLicenseConfig();
    const payload = { sub: data.serial, hwid: data.hwid, plan: data.plan, iss: 'atend-ia' };
    return jsonwebtoken_1.default.sign(payload, cfg.JWT_SECRET, { expiresIn: cfg.JWT_EXPIRES });
}
function verifyLicenseToken(token) {
    const cfg = getLicenseConfig();
    return jsonwebtoken_1.default.verify(token, cfg.JWT_SECRET, { issuer: 'atend-ia' });
}
// ---------- Activate ----------
async function activateLicense(serial, hwid) {
    const license = await prisma_js_1.default.license.findUnique({ where: { serial } });
    if (!license) {
        throw new errors_js_1.NotFoundError('Serial', serial);
    }
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
        throw new errors_js_1.ForbiddenError('Licença expirada.');
    }
    if (license.status === 'REVOKED') {
        throw new errors_js_1.ForbiddenError('Licença revogada.');
    }
    // Same machine — reissue token
    if (license.hwid && (0, hwid_js_1.isSameMachine)(license.hwid, hwid)) {
        const token = signLicenseToken({ serial: license.serial, hwid, plan: license.plan });
        await prisma_js_1.default.license.update({
            where: { id: license.id },
            data: { hwid, status: 'ACTIVE', activatedAt: license.activatedAt ?? new Date() },
        });
        await prisma_js_1.default.licenseEvent.create({
            data: { licenseId: license.id, hwid, eventType: 'ACTIVATE' },
        });
        return { token, plan: license.plan, expiresAt: license.expiresAt, status: 'ACTIVE' };
    }
    // Different machine — check transfer
    if (license.hwid && !(0, hwid_js_1.isSameMachine)(license.hwid, hwid)) {
        const eligible = await checkTransferEligibility(license.id);
        if (!eligible.allowed) {
            throw new errors_js_1.ForbiddenError(`Limite de transferência atingido. ${eligible.reason}`);
        }
        await prisma_js_1.default.license.update({
            where: { id: license.id },
            data: {
                hwid,
                transferCount: { increment: 1 },
                lastTransferredAt: new Date(),
                status: 'ACTIVE',
            },
        });
        await prisma_js_1.default.licenseEvent.create({
            data: { licenseId: license.id, hwid, eventType: 'TRANSFER' },
        });
    }
    else {
        // First activation
        await prisma_js_1.default.license.update({
            where: { id: license.id },
            data: { hwid, status: 'ACTIVE', activatedAt: new Date() },
        });
        await prisma_js_1.default.licenseEvent.create({
            data: { licenseId: license.id, hwid, eventType: 'ACTIVATE' },
        });
    }
    const token = signLicenseToken({ serial: license.serial, hwid, plan: license.plan });
    const updated = await prisma_js_1.default.license.findUnique({ where: { id: license.id } });
    return { token, plan: license.plan, expiresAt: updated?.expiresAt ?? null, status: 'ACTIVE' };
}
// ---------- Validate ----------
async function validateLicense(token, hwid) {
    let payload;
    try {
        payload = verifyLicenseToken(token);
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new errors_js_1.UnauthorizedError('Token expirado.');
        }
        throw new errors_js_1.UnauthorizedError('Token inválido.');
    }
    if (!(0, hwid_js_1.isSameMachine)(payload.hwid, hwid)) {
        throw new errors_js_1.ForbiddenError('Hardware ID não confere. Use /transfer para migrar.');
    }
    const license = await prisma_js_1.default.license.findUnique({ where: { serial: payload.sub } });
    if (!license) {
        throw new errors_js_1.NotFoundError('Licença', payload.sub);
    }
    if (license.status === 'REVOKED') {
        throw new errors_js_1.ForbiddenError('Licença revogada.');
    }
    const isExpired = license.expiresAt ? new Date(license.expiresAt) < new Date() : false;
    // Check offline tolerance
    let offlineTooLong = false;
    const lastHeartbeat = await prisma_js_1.default.licenseEvent.findFirst({
        where: { licenseId: license.id, eventType: 'HEARTBEAT' },
        orderBy: { createdAt: 'desc' },
    });
    if (lastHeartbeat) {
        const offlineDays = (Date.now() - lastHeartbeat.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (offlineDays > getLicenseConfig().OFFLINE_TOLERANCE_DAYS) {
            offlineTooLong = true;
        }
    }
    const valid = !isExpired && !offlineTooLong;
    return {
        valid,
        plan: license.plan,
        expiresAt: license.expiresAt,
        status: valid ? 'ACTIVE' : (isExpired ? 'EXPIRED' : offlineTooLong ? 'EXPIRED' : license.status),
    };
}
// ---------- Heartbeat ----------
async function recordHeartbeat(licenseId, hwid, ip) {
    await prisma_js_1.default.licenseEvent.create({
        data: { licenseId, hwid, ip, eventType: 'HEARTBEAT' },
    });
    await prisma_js_1.default.license.update({
        where: { id: licenseId },
        data: { lastSeenAt: new Date() },
    });
    const nextHeartbeatAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4h
    return { received: true, nextHeartbeatAt: nextHeartbeatAt.toISOString() };
}
// ---------- Transfer ----------
async function checkTransferEligibility(licenseId) {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const yearlyTransfers = await prisma_js_1.default.licenseEvent.count({
        where: {
            licenseId,
            eventType: 'TRANSFER',
            createdAt: { gte: yearAgo },
        },
    });
    if (yearlyTransfers >= getLicenseConfig().TRANSFER_LIMIT_PER_YEAR) {
        return {
            allowed: false,
            remaining: 0,
            reason: `Máximo de ${getLicenseConfig().TRANSFER_LIMIT_PER_YEAR} transferências por ano já utilizado.`,
        };
    }
    return {
        allowed: true,
        remaining: getLicenseConfig().TRANSFER_LIMIT_PER_YEAR - yearlyTransfers,
        reason: null,
    };
}
async function transferLicense(serial, hwid, transferToken) {
    let payload;
    try {
        payload = verifyLicenseToken(transferToken);
    }
    catch {
        throw new errors_js_1.UnauthorizedError('Token de transferência inválido ou expirado.');
    }
    if (payload.sub !== serial) {
        throw new errors_js_1.ForbiddenError('Token de transferência não corresponde a este serial.');
    }
    const license = await prisma_js_1.default.license.findUnique({ where: { serial } });
    if (!license) {
        throw new errors_js_1.NotFoundError('Licença', serial);
    }
    if (license.status === 'REVOKED') {
        throw new errors_js_1.ForbiddenError('Licença revogada.');
    }
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
        throw new errors_js_1.ForbiddenError('Licença expirada.');
    }
    const eligible = await checkTransferEligibility(license.id);
    if (!eligible.allowed) {
        throw new errors_js_1.ForbiddenError(eligible.reason || 'Transferência não permitida.');
    }
    await prisma_js_1.default.license.update({
        where: { id: license.id },
        data: {
            hwid,
            transferCount: { increment: 1 },
            lastTransferredAt: new Date(),
        },
    });
    await prisma_js_1.default.licenseEvent.create({
        data: { licenseId: license.id, hwid, eventType: 'TRANSFER' },
    });
    const newToken = signLicenseToken({ serial, hwid, plan: license.plan });
    return { token: newToken, plan: license.plan, expiresAt: license.expiresAt, status: 'ACTIVE' };
}
// ---------- Admin: CRUD ----------
async function createLicense(data) {
    const serial = await ensureUniqueSerial();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + data.periodMonths);
    const license = await prisma_js_1.default.license.create({
        data: {
            customerId: data.customerId,
            serial,
            plan: data.plan,
            expiresAt,
        },
    });
    return license;
}
async function revokeLicense(licenseId) {
    const license = await prisma_js_1.default.license.update({
        where: { id: licenseId },
        data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await prisma_js_1.default.licenseEvent.create({
        data: { licenseId, eventType: 'REVOKE' },
    });
    return license;
}
async function listLicenses(filters) {
    const where = {};
    if (filters?.customerId)
        where.customerId = filters.customerId;
    if (filters?.tenantId)
        where.customer = { tenantId: filters.tenantId };
    if (filters?.status)
        where.status = filters.status;
    return prisma_js_1.default.license.findMany({
        where,
        include: { customer: true, payments: true },
        orderBy: { createdAt: 'desc' },
    });
}
//# sourceMappingURL=license.service.js.map