FROM golang:1.22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /git-host ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache git
COPY --from=build /git-host /usr/local/bin/git-host
EXPOSE 4003
VOLUME /data/repos
CMD ["git-host"]
