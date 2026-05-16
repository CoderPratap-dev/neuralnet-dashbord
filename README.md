# Phantom API Gateway

> High-throughput Node.js reverse proxy with JWT authentication, adaptive rate limiting, structured logging, and a built-in admin panel.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-00f5ff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-ff00aa?style=flat-square)

---

## Features

- **Zero npm dependencies** — pure Node.js stdlib only
- **JWT authentication** — HS256 verification with timing-safe comparison
- **Adaptive rate limiting** — sliding-window per-IP, configurable per environment
- **Path-based routing** — prefix matching with upstream rewriting
- **Request logging** — colorized console + rotating file logs
- **Admin panel** — metrics, health, route listing, token generation at `/_admin`
- **Docker-ready** — single container, no external services required

---

## Quick Start

```bash
git clone https://github.com/CoderPratap-dev/phantom-api-gateway.git
cd phantom-api-gateway

# Set your JWT secret
export JWT_SECRET="your-super-secret-key"

# Start
node src/index.js
```

Gateway runs on **port 3000** by default.

---

## Configuration

Edit `src/config/gateway.config.js`:

```js
module.exports = {
  port: 3000,

  jwt: {
    secret: process.env.JWT_SECRET || "change-me",
  },

  rateLimit: {
    windowMs: 60_000,   // 1 minute
    maxRequests: 100,   // per IP
  },

  upstreams: {
    users: { url: "http://localhost:4001", timeout: 8000 },
    // add more upstream services here
  },

  routes: [
    { method: "POST", prefix: "/auth/login", upstream: "users", public: true },
    { method: "GET",  prefix: "/users",      upstream: "users", public: false },
    // add more routes here
  ],
};
```

---

## Admin Panel

| Endpoint | Description |
|----------|-------------|
| `GET /_admin/health` | Uptime, memory |
| `GET /_admin/metrics` | Request count, latency percentiles, error rate |
| `GET /_admin/routes` | All configured routes |
| `GET /_admin/rate-limits` | Per-IP rate limit state |
| `POST /_admin/token` | Generate a test JWT `{"sub":"user","role":"admin"}` |

---

## Generate a Test Token

```bash
curl -X POST http://localhost:3000/_admin/token \
  -H "Content-Type: application/json" \
  -d '{"sub": "alice", "role": "admin"}'
```

Use the returned token:

```bash
curl http://localhost:3000/users \
  -H "Authorization: Bearer <token>"
```

---

## Run Tests

```bash
# Unit tests (no gateway needed)
node tests/gateway.test.js

# With live gateway running
node src/index.js &
node tests/gateway.test.js
```

---

## Project Structure

```
phantom-api-gateway/
├── src/
│   ├── index.js                  # Main server
│   ├── config/
│   │   └── gateway.config.js     # Routes, upstreams, limits
│   ├── middleware/
│   │   ├── auth.js               # JWT verify + sign
│   │   ├── rateLimit.js          # Sliding-window rate limiter
│   │   └── logger.js             # Access + error logging
│   ├── routes/
│   │   ├── router.js             # Route matcher
│   │   └── admin.js              # Admin endpoints
│   └── services/
│       └── metrics.js            # In-memory metrics store
├── tests/
│   └── gateway.test.js
├── logs/                         # Created at runtime
├── package.json
└── README.md
```

---

## Production Checklist

- [ ] Set `JWT_SECRET` via environment variable
- [ ] Set `UPSTREAM_*` env vars for all services
- [ ] Lower `rateLimit.maxRequests` for public-facing deployments
- [ ] Mount a volume for `/logs` persistence
- [ ] Add HTTPS termination (nginx/Caddy in front)
- [ ] Swap rate limiter store to Redis for multi-node

---

## License

MIT
