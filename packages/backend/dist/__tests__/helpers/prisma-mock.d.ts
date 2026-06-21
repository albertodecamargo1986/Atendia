export declare function createPrismaMock(): {
    user: {
        findUnique: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
    };
    tenant: {
        findUnique: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
    };
    contact: {
        findUnique: import("vitest").Mock<any, any>;
        findFirst: import("vitest").Mock<any, any>;
        findMany: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
        delete: import("vitest").Mock<any, any>;
        upsert: import("vitest").Mock<any, any>;
    };
    ticket: {
        findFirst: import("vitest").Mock<any, any>;
        findUnique: import("vitest").Mock<any, any>;
        findMany: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
        count: import("vitest").Mock<any, any>;
    };
    conversation: {
        findFirst: import("vitest").Mock<any, any>;
        findUnique: import("vitest").Mock<any, any>;
    };
    license: {
        findUnique: import("vitest").Mock<any, any>;
        findFirst: import("vitest").Mock<any, any>;
        findMany: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
        updateMany: import("vitest").Mock<any, any>;
    };
    licenseEvent: {
        create: import("vitest").Mock<any, any>;
        findFirst: import("vitest").Mock<any, any>;
        count: import("vitest").Mock<any, any>;
    };
    customer: {
        findFirst: import("vitest").Mock<any, any>;
        findUnique: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
    };
    payment: {
        findUnique: import("vitest").Mock<any, any>;
        findFirst: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
    };
    refreshToken: {
        findUnique: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        delete: import("vitest").Mock<any, any>;
        deleteMany: import("vitest").Mock<any, any>;
    };
    webhook: {
        findFirst: import("vitest").Mock<any, any>;
        findMany: import("vitest").Mock<any, any>;
        create: import("vitest").Mock<any, any>;
        update: import("vitest").Mock<any, any>;
        delete: import("vitest").Mock<any, any>;
    };
    webhookDelivery: {
        create: import("vitest").Mock<any, any>;
        findMany: import("vitest").Mock<any, any>;
    };
    $transaction: import("vitest").Mock<[fn: any], any>;
};
export type PrismaMock = ReturnType<typeof createPrismaMock>;
