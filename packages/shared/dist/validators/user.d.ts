import { z } from 'zod';
export declare const createUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["OWNER", "ADMIN", "SUPERVISOR", "OPERATOR"]>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
    role: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR";
}, {
    email: string;
    password: string;
    name: string;
    role?: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | undefined;
}>;
export declare const updateUserSchema: z.ZodObject<Omit<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodDefault<z.ZodEnum<["OWNER", "ADMIN", "SUPERVISOR", "OPERATOR"]>>>;
}, "password">, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    name?: string | undefined;
    role?: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | undefined;
}, {
    email?: string | undefined;
    name?: string | undefined;
    role?: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | undefined;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
//# sourceMappingURL=user.d.ts.map