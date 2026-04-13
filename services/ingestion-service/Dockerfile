FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY services/common-auth /app/services/common-auth
COPY services/ingestion-service /app/services/ingestion-service

WORKDIR /app/services/ingestion-service

COPY services/ingestion-service/go.mod ./
RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/ingestion-service ./cmd/ingestion-service

FROM alpine:3.20

WORKDIR /app
RUN adduser -D appuser
USER appuser

COPY --from=builder /bin/ingestion-service /usr/local/bin/ingestion-service

EXPOSE 8091

ENTRYPOINT ["/usr/local/bin/ingestion-service"]
