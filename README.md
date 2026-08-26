# OmniTrust B2B Marketplace

OmniTrust is an intelligent B2B marketplace platform demonstrating advanced agentic negotiations, secure escrow flows, and end-to-end logistics tracking. The platform ensures trust between buyers and sellers using AI agents and cryptographic verifications.

## Project Structure

This monorepo is split into three main components:

- **`/backend`**: FastAPI backend powering the core marketplace API, AI Agent integrations, and webhook receivers.
- **`/frontend`**: React/Vite web application providing the buyer and seller interfaces.
- **`/mock-logistics`**: A standalone logistics service (simulating a 3PL provider) that exposes APIs and dispatches cryptographic webhooks to the main backend.

## Features

- **Agentic Negotiation**: Buyers and sellers negotiate via LLM-powered agents that enforce internal rules and thresholds.
- **Escrow-Based Settlement**: Payments are held in escrow (using Razorpay Test Mode) and only released upon cryptographic proof of delivery.
- **Webhook Verifications**: Real-time updates from third-party logistics via HMAC-verified webhooks.
- **Dispute Resolution**: Automated dispute handling with penalty scoring and refund processing for damaged goods.
- **Supabase Integration**: Data modeling and user authentication managed securely by Supabase.

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+
- Supabase Project & CLI (optional, for local DB)
- Groq API Key (for LLM Agents)
- Razorpay Account (Test Mode)

### Backend Configuration
1. Navigate to `backend/`.
2. Copy `.env.example` to `.env` and fill in your Supabase, Groq, and Razorpay credentials.
3. Install dependencies: `pip install -r requirements.txt`.
4. Run the server: `uvicorn app.main:app --reload`.

### Mock Logistics Configuration
1. Navigate to `mock-logistics/`.
2. Install Python dependencies: `pip install fastapi uvicorn httpx pyjwt cryptography pydantic`.
3. Set the `WEBHOOK_SECRET` environment variable to match the backend.
4. Run the logistics server: `uvicorn main:app --port 5001 --reload`.

### Frontend Configuration
1. Navigate to `frontend/`.
2. Install dependencies: `npm install`.
3. Configure your Supabase URL and keys in the frontend's environment file.
4. Start the frontend: `npm run dev`.

## Testing

Run the full end-to-end integration suite from the backend directory:
```bash
pytest tests/test_e2e_full_lifecycle.py -v
```
