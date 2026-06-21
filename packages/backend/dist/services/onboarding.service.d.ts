export interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    skippable: boolean;
    route?: string;
}
export declare function getOnboardingProgress(tenantId: string): Promise<{
    steps: OnboardingStep[];
    progress: number;
    isComplete: boolean;
}>;
