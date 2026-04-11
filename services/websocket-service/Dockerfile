FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/websocket-service ./cmd/websocket-service

FROM alpine:3.20

WORKDIR /app
RUN adduser -D appuser
USER appuser

COPY --from=builder /bin/websocket-service /usr/local/bin/websocket-service

EXPOSE 8093

ENTRYPOINT ["/usr/local/bin/websocket-service"]
