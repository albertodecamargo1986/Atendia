import { z } from 'zod';
declare const createUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["ADMIN", "SUPERVISOR", "OPERATOR"]>>;
}, "strip", z.ZodTypeAny, {
    role: "ADMIN" | "SUPERVISOR" | "OPERATOR";
    name: string;
    email: string;
    password: string;
}, {
    name: string;
    email: string;
    password: string;
    role?: "ADMIN" | "SUPERVISOR" | "OPERATOR" | undefined;
}>;
declare const updateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["ADMIN", "SUPERVISOR", "OPERATOR"]>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    role?: "ADMIN" | "SUPERVISOR" | "OPERATOR" | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
}, {
    role?: "ADMIN" | "SUPERVISOR" | "OPERATOR" | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
}>;
declare const updateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    currentPassword: z.ZodOptional<z.ZodString>;
    newPassword: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    currentPassword?: string | undefined;
    newPassword?: string | undefined;
}, {
    name?: string | undefined;
    currentPassword?: string | undefined;
    newPassword?: string | undefined;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export declare function listUsers(tenantId: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: {
        conversations: number;
        auditLogs: number;
    };
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
}[]>;
export declare function getUser(tenantId: string, userId: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: {
        conversations: number;
        auditLogs: number;
    };
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
}>;
export declare function createUser(tenantId: string, data: CreateUserInput, invitedBy: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
}>;
export declare function updateUser(tenantId: string, userId: string, data: UpdateUserInput, updatedBy: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
}>;
export declare function toggleUserActive(tenantId: string, userId: string, deactivatedBy: string): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    email: string;
}>;
export declare function deleteUser(tenantId: string, userId: string, deletedBy: string): Promise<{
    id: string;
    name: string;
    email: string;
}>;
export declare function updateProfile(userId: string, tenantId: string, data: UpdateProfileInput): Promise<{
    role: import(".prisma/client").$Enums.Role;
    id: string;
    name: string;
    email: string;
}>;
export declare function getTeamStats(tenantId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
}>;
export {};
