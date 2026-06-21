"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ level: process.env.LOG_LEVEL || 'info' });
const prisma = new client_1.PrismaClient({
    log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
    ],
});
prisma.$on('query', (e) => {
    logger.debug({ query: e.query, duration: e.duration, params: e.params }, 'Prisma Query');
});
exports.default = prisma;
//# sourceMappingURL=prisma.js.map