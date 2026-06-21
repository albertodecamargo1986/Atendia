export declare function verifyTOTP(secret: string, token: string, window?: number): boolean;
export declare function generateSecret(): string;
export declare function generateQRCodeUrl(email: string, secret: string): string;
export declare function enable2FA(userId: string, token: string): Promise<boolean>;
export declare function disable2FA(userId: string, token: string): Promise<boolean>;
export declare function setup2FA(userId: string): Promise<{
    secret: string;
    qrUrl: string;
}>;
export declare function verify2FAToken(userId: string, token: string): Promise<boolean>;
