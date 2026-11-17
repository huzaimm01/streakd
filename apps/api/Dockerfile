FROM node:22-alpine
WORKDIR /app
# Workspace install: root lockfile + every workspace manifest, then npm ci.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev
COPY packages/core packages/core
COPY apps/api apps/api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["npx", "tsx", "apps/api/src/index.ts"]
