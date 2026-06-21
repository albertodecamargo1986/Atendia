export interface SendEmailParams {
    to: string;
    subject: string;
    text: string;
    html?: string;
}
export declare function sendEmail(params: SendEmailParams): Promise<void>;
export declare function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
export declare function sendWelcomeEmail(email: string, name: string, tenantName: string): Promise<void>;
