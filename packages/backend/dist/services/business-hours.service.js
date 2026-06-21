"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBusinessHours = listBusinessHours;
exports.updateBusinessHour = updateBusinessHour;
exports.isWithinBusinessHours = isWithinBusinessHours;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const zod_1 = require("zod");
const businessHourSchema = zod_1.z.object({
    dayOfWeek: zod_1.z.number().min(0).max(6),
    isOpen: zod_1.z.boolean(),
    openTime: zod_1.z.string().optional(),
    closeTime: zod_1.z.string().optional(),
});
async function listBusinessHours(tenantId) {
    const hours = await prisma_js_1.default.businessHour.findMany({
        where: { tenantId },
        orderBy: { dayOfWeek: 'asc' },
    });
    if (hours.length === 0) {
        return createDefaultBusinessHours(tenantId);
    }
    return hours;
}
async function createDefaultBusinessHours(tenantId) {
    const defaults = [
        { dayOfWeek: 0, isOpen: true, openTime: '00:00', closeTime: '23:59' },
        { dayOfWeek: 1, isOpen: true, openTime: '00:00', closeTime: '23:59' },
        { dayOfWeek: 2, isOpen: true, openTime: '00:00', closeTime: '23:59' },
        { dayOfWeek: 3, isOpen: true, openTime: '00:00', closeTime: '23:59' },
        { dayOfWeek: 4, isOpen: true, openTime: '00:00', closeTime: '23:59' },
        { dayOfWeek: 5, isOpen: true, openTime: '00:00', closeTime: '23:59' },
        { dayOfWeek: 6, isOpen: true, openTime: '00:00', closeTime: '23:59' },
    ];
    const created = await Promise.all(defaults.map((d) => prisma_js_1.default.businessHour.create({
        data: {
            tenantId,
            dayOfWeek: d.dayOfWeek,
            isOpen: d.isOpen,
            openTime: d.openTime,
            closeTime: d.closeTime,
        },
    })));
    return created;
}
async function updateBusinessHour(tenantId, dayOfWeek, data) {
    const parsed = businessHourSchema.parse(data);
    return prisma_js_1.default.businessHour.upsert({
        where: { tenantId_dayOfWeek: { tenantId, dayOfWeek } },
        update: {
            isOpen: parsed.isOpen,
            openTime: parsed.isOpen ? parsed.openTime || null : null,
            closeTime: parsed.isOpen ? parsed.closeTime || null : null,
        },
        create: {
            tenantId,
            dayOfWeek: parsed.dayOfWeek,
            isOpen: parsed.isOpen,
            openTime: parsed.isOpen ? parsed.openTime || null : null,
            closeTime: parsed.isOpen ? parsed.closeTime || null : null,
        },
    });
}
async function isWithinBusinessHours(tenantId) {
    const hours = await prisma_js_1.default.businessHour.findMany({ where: { tenantId } });
    if (hours.length === 0)
        return true;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayConfig = hours.find((h) => h.dayOfWeek === dayOfWeek);
    if (!dayConfig || !dayConfig.isOpen || !dayConfig.openTime || !dayConfig.closeTime) {
        return false;
    }
    // "23:59" closeTime means open 24h (00:00-23:59 covers the entire day)
    if (dayConfig.openTime === '00:00' && dayConfig.closeTime === '23:59') {
        return true;
    }
    const [openH, openM] = dayConfig.openTime.split(':').map(Number);
    const [closeH, closeM] = dayConfig.closeTime.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    // Handle overnight shifts (e.g. 22:00-06:00)
    if (openMinutes > closeMinutes) {
        return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}
//# sourceMappingURL=business-hours.service.js.map