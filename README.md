# Netra Gateway

A PC desktop application serving as an AAA (Authentication, Authorization, and Accounting) server - essentially "a gateway in your pocket" for on-demand micro-connectivity.

## Features

- **Authentication**: Secure JWT-based login/registration
- **Subscription Management**: Daily, Weekly, Monthly, and Yearly plans
- **VPN Integration**: WireGuard/OpenVPN protocol support
- **Usage Tracking**: Real-time data consumption monitoring
- **Payment Gateway**: Stripe/Paystack/Flutterwave integration ready
- **Kill Switch**: Automatic disconnection when subscription expires
- **System Tray**: Runs in background with tray controls

## Tech Stack

- **Frontend**: Electron (Desktop App)
- **Backend**: Node.js + Express
- **Database**: In-memory (easily swappable to PostgreSQL)
- **Authentication**: JWT + bcrypt

## Project Structure

```
netra/
├── netra-app/           # Electron desktop app
│   ├── src/
│   │   ├── main/       # Main process
│   │   └── renderer/   # UI (HTML/CSS/JS)
│   └── package.json
│
├── netra-backend/       # API server
│   ├── src/
│   │   ├── database/   # Data models
│   │   ├── middleware/ # Auth & subscription middleware
│   │   ├── routes/    # API endpoints
│   │   └── services/   # Business logic
│   └── package.json
│
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
# Install backend dependencies
cd netra-backend
npm install

# Install app dependencies
cd ../netra-app
npm install
```

### Running the Application

1. Start the backend server:

```bash
cd netra-backend
npm start
```

2. Start the Electron app:

```bash
cd netra-app
npm start
```

### Demo Credentials

- Email: `demo@netra.io`
- Password: `demo123`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

### Subscription
- `GET /api/subscription/plans` - List plans
- `GET /api/subscription/status` - Get subscription status
- `POST /api/subscription/purchase` - Purchase plan

### VPN
- `GET /api/vpn/status` - Connection status
- `GET /api/vpn/servers` - List servers
- `POST /api/vpn/connect` - Connect to VPN
- `POST /api/vpn/disconnect` - Disconnect

### Usage
- `GET /api/usage/stats` - Usage statistics
- `POST /api/usage/report` - Report usage

### Webhooks
- `POST /api/webhooks/stripe` - Stripe payments
- `POST /api/webhooks/paystack` - Paystack payments
- `POST /api/webhooks/flutterwave` - Flutterwave payments

## Subscription Plans

| Plan | Price | Data Limit | Duration |
|------|-------|-------------|----------|
| Free Trial | $0 | 100 MB | 24 hours |
| Daily | $0.99 | 500 MB | 1 day |
| Weekly | $4.99 | 2 GB | 7 days |
| Monthly | $14.99 | 50 GB | 30 days |
| Yearly | $99.99 | 500 GB | 365 days |

## Building for Production

```bash
cd netra-app
npm run build
```

The executable will be in `netra-app/dist/`.

## Future Features

- **Community Mode**: Share bandwidth with neighbors for Common-Credits
- **Mobile Apps**: React Native versions for iOS/Android
- **Real VPN Server**: Actual WireGuard server deployment
- **Analytics Dashboard**: Admin panel for monitoring
- **Multiple Payment Methods**: Mobile money, crypto support

## License

MIT
