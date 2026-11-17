FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
# Workspace install from the single root lockfile (no separate web lockfile).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build -w @streakd/web
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
