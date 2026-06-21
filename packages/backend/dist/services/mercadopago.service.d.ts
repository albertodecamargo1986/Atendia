export declare function createPreference(data: {
    customerId?: string;
    name: string;
    email: string;
    cpfCnpj: string;
    phone: string;
    plan: string;
}): Promise<{
    preferenceId: string | undefined;
    initPoint: string | undefined;
    sandboxInitPoint: string | undefined;
    serial: string;
    paymentId: string;
}>;
export declare function handleMercadoPagoWebhook(body: any): Promise<{
    processed: boolean;
    type?: undefined;
} | {
    processed: boolean;
    type: any;
}>;
export declare function getPaymentStatus(paymentId: string, tenantId: string): Promise<{
    id: string;
    status: import(".prisma/client").$Enums.PaymentStatus;
    plan: string;
    amount: number;
    serial: string | null;
    licenseStatus: string | null;
    createdAt: Date;
    paidAt: Date | null;
}>;
