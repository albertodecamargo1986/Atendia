export declare function getDashboardStats(): Promise<{
    tenants: {
        total: number;
        active: number;
    };
    licenses: {
        total: number;
        active: number;
    };
    payments: {
        total: number;
        totalRevenue: number;
    };
    users: {
        total: number;
    };
    conversations: {
        total: number;
    };
    online: {
        count: number;
    };
    planDistribution: {
        plan: import(".prisma/client").$Enums.Plan;
        count: number;
    }[];
    recentTenants: {
        id: string;
        slug: string;
        name: string;
        plan: import(".prisma/client").$Enums.Plan;
        isActive: boolean;
        createdAt: Date;
        _count: {
            users: number;
        };
    }[];
    recentPayments: ({
        customer: {
            name: string;
            email: string;
        };
    } & {
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
    })[];
    monthlyRevenue: {
        date: Date;
        amount: number;
    }[];
    monthlyTenants: {
        date: Date;
        count: number;
    }[];
    topTenants: {
        id: string;
        name: string;
        plan: import(".prisma/client").$Enums.Plan;
        _count: {
            conversations: number;
            agents: number;
            users: number;
        };
    }[];
}>;
export declare function listTenants(page?: number, limit?: number, search?: string): Promise<{
    tenants: {
        id: string;
        slug: string;
        name: string;
        plan: import(".prisma/client").$Enums.Plan;
        isActive: boolean;
        maxAgents: number;
        maxConversations: number;
        maxWhatsapp: number;
        maxAiRequests: number;
        createdAt: Date;
        updatedAt: Date;
        subscription: {
            status: import(".prisma/client").$Enums.SubscriptionStatus;
            currentPeriodEnd: Date | null;
        } | null;
        _count: {
            conversations: number;
            agents: number;
            users: number;
        };
    }[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}>;
export declare function getTenant(id: string): Promise<{
    users: {
        role: import(".prisma/client").$Enums.Role;
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        email: string;
    }[];
    subscription: {
        status: import(".prisma/client").$Enums.SubscriptionStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        mercadopagoId: string | null;
        currentPeriodEnd: Date | null;
    } | null;
    _count: {
        tickets: number;
        conversations: number;
        contacts: number;
        agents: number;
        users: number;
    };
} & {
    id: string;
    slug: string;
    name: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    maxAgents: number;
    maxConversations: number;
    maxWhatsapp: number;
    maxAiRequests: number;
    trialEndAt: Date | null;
    trialUsed: boolean;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function updateTenant(id: string, data: {
    name?: string;
    plan?: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
    isActive?: boolean;
    maxAgents?: number;
    maxConversations?: number;
    maxWhatsapp?: number;
    maxAiRequests?: number;
}): Promise<{
    id: string;
    slug: string;
    name: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    maxAgents: number;
    maxConversations: number;
    maxWhatsapp: number;
    maxAiRequests: number;
    trialEndAt: Date | null;
    trialUsed: boolean;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function listLicenses(page?: number, limit?: number, search?: string): Promise<{
    licenses: ({
        customer: {
            id: string;
            name: string;
            email: string;
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
    })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}>;
export declare function createLicense(data: {
    customerId: string;
    plan: string;
    expiresAt: string;
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
export declare function revokeLicense(id: string): Promise<{
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
export declare function listPayments(page?: number, limit?: number): Promise<{
    payments: ({
        license: {
            serial: string;
        } | null;
        customer: {
            id: string;
            name: string;
            email: string;
        };
    } & {
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
    })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}>;
export declare function getSystemSettings(): Promise<{
    tenantsCount: number;
    planDistribution: (import(".prisma/client").Prisma.PickEnumerable<import(".prisma/client").Prisma.TenantGroupByOutputType, "plan"[]> & {
        _count: number;
    })[];
}>;
export declare function listCustomers(search?: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    email: string;
    cpfCnpj: string;
    phone: string;
}[]>;
export declare function getPermissions(tenantId: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    tenantId: string;
    module: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
}[]>;
export declare function upsertPermission(data: {
    tenantId: string;
    role: string;
    module: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
}): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    tenantId: string;
    module: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
}>;
export declare function seedDefaultPermissions(tenantId: string): Promise<void>;
export declare function adminListUsers(tenantId: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    email: string;
}[]>;
export declare function adminCreateUser(tenantId: string, data: {
    name: string;
    email: string;
    password: string;
    role?: string;
}): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    email: string;
}>;
export declare function adminDeleteUser(userId: string): Promise<{
    message: string;
}>;
export declare function adminResetPassword(userId: string, newPassword: string): Promise<{
    message: string;
}>;
export declare function listCoupons(): Promise<({
    tenant: {
        name: string;
    } | null;
} & {
    code: string;
    id: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string | null;
    expiresAt: Date | null;
    discount: number;
    maxUses: number;
    usedCount: number;
})[]>;
export declare function createCoupon(data: {
    code: string;
    discount: number;
    plan: string;
    maxUses?: number;
    expiresAt?: string;
    tenantId?: string;
}): Promise<{
    code: string;
    id: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string | null;
    expiresAt: Date | null;
    discount: number;
    maxUses: number;
    usedCount: number;
}>;
export declare function toggleCouponStatus(id: string): Promise<{
    code: string;
    id: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string | null;
    expiresAt: Date | null;
    discount: number;
    maxUses: number;
    usedCount: number;
}>;
export declare function deleteCoupon(id: string): Promise<{
    message: string;
}>;
export declare function extendTrial(tenantId: string, days: number): Promise<{
    id: string;
    slug: string;
    name: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    maxAgents: number;
    maxConversations: number;
    maxWhatsapp: number;
    maxAiRequests: number;
    trialEndAt: Date | null;
    trialUsed: boolean;
    createdAt: Date;
    updatedAt: Date;
}>;
