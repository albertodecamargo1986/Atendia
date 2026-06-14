# Stage 1 — Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN npm install

# Stage 2 — Build
FROM deps AS build
WORKDIR /app
COPY packages/shared/ packages/shared/
RUN cd packages/shared && npm run build
COPY packages/backend/ packages/backend/
RUN cd packages/backend && npx prisma generate --schema=prisma/schema.prisma
RUN cd packages/backend && npm run build

# Stage 3 — Runtime
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl curl
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma

WORKDIR /app/packages/backend
RUN npx prisma generate --schema=prisma/schema.prisma

# Create uploads dir owned by app user
RUN mkdir -p /app/uploads /app/whatsapp-auth && chown -R app:app /app/uploads /app/whatsapp-auth

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/index.js"]
