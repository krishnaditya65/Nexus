# Build context is the MONOREPO ROOT, not this directory — required because
# this service depends on the local ../../packages/rate-limiter workspace
# package via a `file:` reference. Build with:
#   docker build -f services/pm/Dockerfile -t eos-pm .
FROM node:20-alpine AS build
WORKDIR /app
COPY packages/rate-limiter ./packages/rate-limiter
RUN cd packages/rate-limiter && npm install && npm run build
COPY services/pm/package.json ./services/pm/package.json
RUN cd services/pm && npm install
COPY services/pm ./services/pm
RUN cd services/pm && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/pm/dist ./dist
COPY --from=build /app/services/pm/node_modules ./node_modules
COPY --from=build /app/services/pm/migrations ./migrations
EXPOSE 4002
CMD ["node", "dist/main.js"]
