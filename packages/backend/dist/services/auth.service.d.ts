import { z } from 'zod';
declare const loginSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    twoFactorToken: z.ZodOptional<z.ZodString>;
    tempToken: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    password?: string | undefined;
    twoFactorToken?: string | undefined;
    tempToken?: string | undefined;
}, {
    email?: string | undefined;
    password?: string | undefined;
    twoFactorToken?: string | undefined;
    tempToken?: string | undefined;
}>;
declare const registerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    tenantName: z.ZodString;
    tenantSlug: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
    tenantName: string;
    tenantSlug: string;
}, {
    name: string;
    email: string;
    password: string;
    tenantName: string;
    tenantSlug: string;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export declare function register(data: RegisterInput): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    };
    tenant: {
        id: string;
        name: string;
        slug: string;
        plan: import(".prisma/client").$Enums.Plan;
    };
    accessToken: string;
    refreshToken: string;
}>;
export declare function login(data: LoginInput): Promise<any>;
export declare function refresh(token: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare function logout(token: string): Promise<void>;
export {};
