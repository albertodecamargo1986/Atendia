import { PrismaClient } from '@prisma/client';
declare const prisma: PrismaClient<{
    log: ({
        level: "query";
        emit: "event";
    } | {
        level: "error";
        emit: "stdout";
    } | {
        level: "warn";
        emit: "stdout";
    })[];
}, "query", import("@prisma/client/runtime/library").DefaultArgs>;
export default prisma;
