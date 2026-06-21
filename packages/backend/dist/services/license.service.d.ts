export declare function generateSerial(): string;
export declare function ensureUniqueSerial(): Promise<string>;
interface LicenseTokenPayload {
    sub: string;
    hwid: string;
    plan: string;
    exp?: number;
    iat?: number;
    iss?: string;
}
export declare function verifyLicenseToken(token: string): LicenseTokenPayload;
export declare function activateLicense(serial: string, hwid: string): Promise<{
    token: string;
    plan: import(".prisma/client").$Enums.LicensePlan;
    expiresAt: Date | null;
    status: string;
}>;
export declare function validateLicense(token: string, hwid: string): Promise<{
    valid: boolean;
    plan: import(".prisma/client").$Enums.LicensePlan;
    expiresAt: Date;
    status: "INACTIVE" | "ACTIVE" | "EXPIRED" | "SUSPENDED";
}>;
export declare function recordHeartbeat(licenseId: string, hwid: string, ip: string): Promise<{
    received: boolean;
    nextHeartbeatAt: string;
}>;
export declare function checkTransferEligibility(licenseId: string): Promise<{
    allowed: boolean;
    remaining: number;
    reason: string;
} | {
    allowed: boolean;
    remaining: number;
    reason: null;
}>;
export declare function transferLicense(serial: string, hwid: string, transferToken: string): Promise<{
    token: string;
    plan: import(".prisma/client").$Enums.LicensePlan;
    expiresAt: Date;
    status: string;
}>;
export declare function createLicense(data: {
    customerId: string;
    plan: string;
    periodMonths: number;
}): Promise<{
    status: import(".prisma/client").$Enums.LicenseStatus;
    id: string;
    plan: import(".prisma/client").$Enums.LicensePlan;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    serial: string;
    hwid: string | null;
    activatedAt: Date | null;
    expiresAt: Date;
    lastSeenAt: Date | null;
    transferCount: number;
    lastTransferredAt: Date | null;
    revokedAt: Date | null;
}>;
export declare function revokeLicense(licenseId: string): Promise<{
    status: import(".prisma/client").$Enums.LicenseStatus;
    id: string;
    plan: import(".prisma/client").$Enums.LicensePlan;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    serial: string;
    hwid: string | null;
    activatedAt: Date | null;
    expiresAt: Date;
    lastSeenAt: Date | null;
    transferCount: number;
    lastTransferredAt: Date | null;
    revokedAt: Date | null;
}>;
export declare function listLicenses(filters?: {
    customerId?: string;
    tenantId?: string;
    status?: string;
}): Promise<({
    payments: {
        status: import(".prisma/client").$Enums.PaymentStatus;
        id: string;
        plan: string;
        createdAt: Date;
        updatedAt: Date;
        amount: number;
        customerId: string;
        licenseId: string | null;
        licenseSerial: string | null;
        gateway: import(".prisma/client").$Enums.PaymentGateway;
        gatewayTransactionId: string | null;
        periodMonths: number;
        paidAt: Date | null;
        mercadopagoPreferenceId: string | null;
        mercadopagoStatus: string | null;
    }[];
    customer: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        tenantId: string | null;
        cpfCnpj: string;
        phone: string;
    };
} & {
    status: import(".prisma/client").$Enums.LicenseStatus;
    id: string;
    plan: import(".prisma/client").$Enums.LicensePlan;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    serial: string;
    hwid: string | null;
    activatedAt: Date | null;
    expiresAt: Date;
    lastSeenAt: Date | null;
    transferCount: number;
    lastTransferredAt: Date | null;
    revokedAt: Date | null;
})[]>;
export {};
