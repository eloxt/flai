# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN NODE_OPTIONS=--dns-result-order=ipv4first pnpm --filter @flai/web build \
 && pnpm --filter @flai/server build \
 && pnpm --filter @flai/server deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production PORT=8000 WEB_DIST=/app/web MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/drizzle ./drizzle
COPY --from=build /app/apps/web/build/client ./web
EXPOSE 8000
USER node
# Apply pending migrations, then serve the API and the web app.
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
