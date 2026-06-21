"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPrismaMock = createPrismaMock;
const vitest_1 = require("vitest");
function createPrismaMock() {
    return {
        user: {
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        tenant: {
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        contact: {
            findUnique: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
            upsert: vitest_1.vi.fn(),
        },
        ticket: {
            findFirst: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            count: vitest_1.vi.fn(),
        },
        conversation: {
            findFirst: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
        },
        license: {
            findUnique: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            updateMany: vitest_1.vi.fn(),
        },
        licenseEvent: {
            create: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn(),
            count: vitest_1.vi.fn(),
        },
        customer: {
            findFirst: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        payment: {
            findUnique: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        refreshToken: {
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
            deleteMany: vitest_1.vi.fn(),
        },
        webhook: {
            findFirst: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
        },
        webhookDelivery: {
            create: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
        },
        $transaction: vitest_1.vi.fn((fn) => fn(typeof fn === 'function' ? {
            ticket: {
                findFirst: vitest_1.vi.fn(),
                findUnique: vitest_1.vi.fn(),
                update: vitest_1.vi.fn(),
                create: vitest_1.vi.fn(),
            },
            payment: {
                update: vitest_1.vi.fn(),
            },
            license: {
                update: vitest_1.vi.fn(),
                updateMany: vitest_1.vi.fn(),
            },
        } : undefined)),
    };
}
//# sourceMappingURL=prisma-mock.js.map