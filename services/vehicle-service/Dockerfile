FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY services/common-auth /app/services/common-auth
COPY services/vehicle-service /app/services/vehicle-service

WORKDIR /app/services/vehicle-service

COPY services/vehicle-service/go.mod ./
RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/vehicle-service ./cmd/vehicle-service

FROM alpine:3.20

WORKDIR /app
RUN adduser -D appuser
USER appuser

COPY --from=builder /bin/vehicle-service /usr/local/bin/vehicle-service

EXPOSE 8094

ENTRYPOINT ["/usr/local/bin/vehicle-service"]
