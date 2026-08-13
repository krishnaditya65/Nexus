FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
# The runner shells out to `git` (clone) and `docker` (per-step execution)
# directly — docker-cli here talks to the HOST's Docker daemon via the
# mounted socket (see infra/docker/docker-compose.yml's cicd service:
# `-v /var/run/docker.sock:/var/run/docker.sock`), it does not run its own
# nested daemon.
RUN apk add --no-cache git docker-cli
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/migrations ./migrations
EXPOSE 4005
CMD ["node", "dist/main.js"]
