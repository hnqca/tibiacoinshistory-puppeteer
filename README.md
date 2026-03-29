# Tibia Coins History Scraper

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-%2340B5A4.svg?style=for-the-badge&logo=Puppeteer&logoColor=black)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)

A lightweight **web automation** and **scraping tool** built with **Puppeteer** to track Tibia Coin transactions.

## Overview

This project automates the authentication process on the official Tibia website ([tibia.com](https://tibia.com)) to extract Tibia Coin transaction history from dynamic tables. Collected data is formatted as JSON and can be forwarded to a configurable HTTP POST webhook.

## 📦 Installation & Setup

### ⚙️ Prerequisites

Ensure you have the following installed:

- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/)

### 🚀 Getting Started

Follow these steps to set up the project locally.

### 1. Clone the repository

```bash
git clone https://github.com/hnqca/tibiacoinshistory-puppeteer
cd tibiacoinshistory-puppeteer
```

### 2. Configure Environment Variables

Rename **`.env.example`** to **`.env`** and fill in your credentials:

```bash
ACCOUNT_EMAIL="<ACCOUNT_EMAIL>"       # Tibia account email     (required)
ACCOUNT_PASSWORD="<ACCOUNT_PASSWORD>" # Tibia account password  (required)
WEBHOOK_URL="<YOUR_WEBHOOK_URL>"      # Destination webhook URL (optional)
```

### 3. Build and Start the Container

```bash
docker compose up -d --build
```

### 4. Monitor the Logs

```bash
docker compose logs -f
```

#### Expected Output:

When the scraper starts, you should see logs similar to this:

```txt
[START] Initializing scraper...
[INFO] Cookie file not found. Fresh login required.
[INFO] User logged out. Starting authentication flow...
[SUCCESS] Login successful.
[2026-03-29T18:14:56.495Z] Checking Tibia Coins history...
[INFO] 1 new records detected.
[SUCCESS] Dispatched updates to webhook.
```

## Tibia Coins History Table Example

![](https://i.ibb.co/nM2kK4zz/Captura-de-tela-19-1-2026-17372-www-tibia-com.jpg)


## Payload Example:

The scraper dispatches a POST request to the configured **`WEBHOOK_URL`** in `.env` file.

The payload consists of a structured JSON array containing only the new records detected since the last check.

```json
[
  {
    "id": 14,
    "datetime": "Apr 17 2025, 21:17:04 CEST",
    "event": "gift",
    "type": "withdrawal",
    "amount": -25,
    "description": "Brewie gifted to Valanan Dulf",
    "sender": "Brewie",
    "receiver": "Valanan Dulf"
  },
  {
    "id": 13,
    "datetime": "Apr 17 2025, 18:26:30 CEST",
    "event": "gift",
    "type": "deposit",
    "amount": 25,
    "description": "Alim gifted to Brewie",
    "sender": "Alim",
    "receiver": "Brewie"
  },
  // ...
]
```

## Local Persistence

All processed records are stored in: **`files/coins_history_latest.json`**

This file acts as a local database. When the container restarts, the scraper reads this file to compare existing IDs with the latest data from Tibia.com, preventing duplicate notifications.

## 🔁 Continuous Execution (Loop Mode)
The script features an optional continuous execution mode, allowing automated periodic checks at defined intervals.

Configure this in **``index.js``** using the following object:

```js
loop: {
  active: true,
  interval: 60 // seconds
},
```

## Workflow

![](https://i.ibb.co/ksrwTmzZ/workflow.jpg)

- Load environment variables and initial configurations.
- Initialize required directories and files (cookies.json, coins_history_latest.json).
- Launch headless browser via Puppeteer.
- Load session cookies (if available).
- Access Tibia.com for session validation.
- Perform automated login (if the session is expired).
- Navigate to the Tibia Coins history page.
- Scrape and normalize data from the dynamic table.
- Compare results with the last saved history.
- Dispatch only new records to the webhook (if configured).
- Wait for the defined interval and repeat.

## License

This project is open-source and licensed under the MIT License.