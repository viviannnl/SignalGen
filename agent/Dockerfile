FROM node:lts-alpine AS build
WORKDIR /app

# Copy package and TypeScript config first for layer caching.
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies, copy source, and compile TypeScript to dist/.
RUN npm ci
COPY src/ ./src/
RUN npm run build

# Remove development-only dependencies after build.
RUN npm prune --omit=dev

FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Cloud Run injects PORT env var; server uses process.env.PORT ?? 8080.
EXPOSE 8080

# Start the compiled custom HTTP worker.
CMD ["node", "dist/src/server.js"]
