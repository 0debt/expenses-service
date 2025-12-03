
# 💸 0debt - Expenses Service

> **The financial heart of the 0debt ecosystem.**

This microservice is responsible for expense management, currency conversion, and the complex algorithmic logic to calculate debts and simplify payments within groups.

Built with **Bun** and **Hono**, it is designed to be high-performance, resilient, and scalable, implementing advanced distributed system patterns to achieve robust consistency.

---

## 🚀 Key Features

### Core Business Logic
* **Expense Tracking:** CRUD operations for shared expenses with support for multiple split types (Equal, Exact, Percentage).
* **Debt Simplification Algorithm:** Implements a greedy algorithm to minimize the number of transactions required to settle up debts within a group.
* **Currency Conversion:** Automatically converts expenses paid in foreign currencies (USD, GBP, etc.) to the group's base currency (EUR) using the **Frankfurter API**.

### Architecture & Resilience (Grade 10 Features)
* **🛡️ Circuit Breaker:** Implemented via `opossum` to protect the system when the synchronous dependency `groups-service` is down.
* **⚡ Redis Caching:** Caches calculated balances to reduce CPU load on high-traffic groups, with automatic invalidation on new expenses.
* **📊 Materialized Views:** Uses MongoDB atomic operators (`$inc`) to maintain real-time pre-calculated statistics for the Analytics Service, ensuring $O(1)$ read performance.
* **📢 Event-Driven:** Publishes `expense.created` events to Redis Pub/Sub to trigger asynchronous notifications.
* **🔗 Saga Pattern Participant:** Exposes endpoints to validate user deletability, ensuring data integrity across the distributed system.

---

## 🛠️ Tech Stack

* **Runtime:** [Bun](https://bun.sh) (v1.x)
* **Framework:** [Hono](https://hono.dev) (OpenAPI-based)
* **Database:** MongoDB Atlas (Mongoose ODM)
* **Caching & Messaging:** Redis
* **Validation:** Zod (Automatic Swagger generation)
* **Testing:** Bun Test Runner
* **Resilience:** Opossum (Circuit Breaker)

---

## 🔌 Architecture Overview

```mermaid
graph TD
    Client -->|HTTPS| API_Gateway
    API_Gateway -->|REST| Expenses_Service
    
    subgraph "Expenses Service Internals"
        Hono_Server -->|Read/Write| MongoDB[(MongoDB Atlas)]
        Hono_Server -->|Cache/Pub| Redis[(Redis)]
        Hono_Server -->|Sync Validation| Circuit_Breaker
        Circuit_Breaker -->|HTTP| Groups_Service
        Hono_Server -->|External API| Frankfurter_API
    end
````

-----

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/expenses-db

# Redis (Cache & Pub/Sub)
REDIS_URL=redis://localhost:6379

# Internal Microservices Links
GROUPS_SERVICE_URL=http://localhost:3001
```

-----

## 📦 Installation & Running

### 1\. Local Development

```bash
# Install dependencies
bun install

# Run in development mode (Hot reload)
bun run dev
```

### 2\. Docker (Production)

```bash
# Build the image
docker build -t expenses-service .

# Run the container
docker run -p 3000:3000 --env-file .env expenses-service
```

### 3\. Running Tests

We use **Bun Test** for unit and integration testing, covering the debt algorithm and materialized view logic.

```bash
bun test
```

-----

## 📖 API Documentation (OpenAPI / Swagger)

This service uses `@hono/zod-openapi` to generate documentation automatically.

  * **UI Interface:** `http://localhost:3000/ui`
  * **JSON Spec:** `http://localhost:3000/doc`

### Main Endpoints

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/expenses` | Creates a new expense, converts currency, updates stats, and publishes event. | **User** (Protected) |
| `GET` | `/api/v1/expenses/groups/:id` | Lists expenses for a specific group. | **User** |
| `GET` | `/api/v1/balances/:groupId` | Calculates debts and generates a payment plan (Cached). | **User** |
| `GET` | `/api/v1/internal/stats/:id` | Returns aggregated stats reading from the **Materialized View**. | **Internal** (Analytics) |
| `GET` | `/api/v1/internal/users/:id/debtStatus` | Checks if a user has pending debts (Saga Pattern). | **Internal** (Users) |

-----

## 🧠 Advanced Implementation Details

### 1\. The Debt Simplification Algorithm

Instead of forcing every user to pay every other user they owe, the service calculates the **net balance** of each participant. It then matches the biggest debtors with the biggest creditors to minimize the total number of transactions required to settle the group.

### 2\. Resilience Strategy (Circuit Breaker)

Before creating an expense, we verify if the `payerId` belongs to the `groupId`.

  * **Normal State:** Calls `groups-service` to validate.
  * **Failure State:** If `groups-service` fails repeatedly (50% error rate), the **Circuit Breaker opens**.
  * **Fallback:** The system enters a "degraded mode" (Simulated Validation) to allow the user to continue creating expenses, ensuring availability over strict consistency during outages.

### 3\. Business Logic Limits

To comply with the monetization strategy:

  * **FREE Plan:** Users are limited to 50 expenses per group.
  * **PRO Plan:** Unlimited expenses.
  * *Implementation:* The service reads the `X-User-Plan` header injected by the API Gateway.

-----

## 🤝 Contribution

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

