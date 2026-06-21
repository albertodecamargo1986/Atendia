export interface JwtPayload {
    sub: string;
    email: string;
    tenantId: string;
    role: string;
    plan: string;
}
export declare function signAccessToken(payload: JwtPayload): string;
export declare function signRefreshToken(payload: {
    sub: string;
    tenantId: string;
}): string;
export declare function verifyAccessToken(token: string): JwtPayload;
export declare function verifyRefreshToken(token: string): {
    sub: string;
    tenantId: string;
};
export declare function sign2FATempToken(payload: {
    sub: string;
    tenantId: string;
}): string;
export declare function verify2FATempToken(token: string): {
    sub: string;
    tenantId: string;
};
