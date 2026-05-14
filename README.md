# SAR Manager

## Description

SAR Manager is a unified web application designed to consolidate and augment all the tools that Search and Rescue managers in Alberta are already using. Currently, these critical tools—CalTopo, D4H, and SARCommand Assist—are located in separate places, requiring managers to constantly switch between platforms during time-critical operations.

SAR Manager provides a centralized platform where SAR managers can log in once and manage all their tools from a single, intuitive interface. This application was designed specifically for Southeastern Alberta Search and Rescue (SEASAR) to streamline workflow and improve operational efficiency.

## Overview

This application integrates three major SAR management platforms:

- **CalTopo**: Real-time collaborative mapping, search zones, and terrain analysis
- **D4H**: Personnel management, resource allocation, and incident coordination  
- **SARCommand Assist**: Incident command structure and resource management

All integrated with **Lost Person Behavior Analysis** (ISRID) to provide intelligent decision support prompts guiding managers toward optimal search strategies.

## Tech Stack

- **Framework**: Next.js 16.2.6 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Map Library**: Leaflet & react-leaflet
- **API Client**: Axios
- **Authentication**: Context API with token management
- **Deployment**: PWA-ready (manifest configured)

## Installation

### Prerequisites
- Node.js 18+ and npm
- CalTopo service account credentials (Team ID & Secret)
- D4H personal access token
- SARCommand Assist credentials (if available)

### Setup
```bash
# Clone or download the repository
git clone <repository-url>
cd sarmanager

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

### Configuration
1. Navigate to `/auth` on first visit
2. Enter your API credentials:
   - CalTopo Team ID and Secret
   - D4H Personal Access Token
3. Credentials are stored securely in your session

## Usage

### Main Dashboard
Upon login, you'll see a unified dashboard with four main sections:

1. **Map Overview** - Real-time collaborative map view showing search zones, team locations, and terrain data from CalTopo
2. **Personnel & Resources** - View available team members, their status, and qualifications from D4H
3. **Active Incidents** - See all current incidents and their status
4. **Decision Prompts** - AI-powered recommendations for next actions based on lost person behavior analysis

### Typical Workflow
1. **Login** at `/auth` with your credentials
2. **View Incident** on the unified dashboard
3. **Check Personnel Availability** to see who's ready for deployment
4. **Review Map** to understand terrain and search zones
5. **Follow Decision Prompts** for optimized search recommendations
6. **Coordinate Teams** through D4H while tracking progress on CalTopo

### Mobile Access
SAR Manager is optimized for mobile and tablet devices. Use the PWA (Progressive Web App) to install it directly on your phone for offline access to critical data.

## Features

```
.
├── app/
│   ├── layout.tsx              # Root layout with Auth provider
│   ├── page.tsx                # Main dashboard
│   ├── auth/
│   │   └── page.tsx            # Authentication page
│   └── globals.css             # Global styles
├── components/
│   ├── MapViewer.tsx           # Leaflet map integration
│   ├── PersonnelManager.tsx    # D4H personnel interface
│   ├── IncidentManager.tsx     # Active incidents display
│   └── DecisionPrompts.tsx     # Next-action suggestions
├── lib/
│   ├── api/
│   │   ├── caltopo.ts          # CalTopo API client
│   │   └── d4h.ts              # D4H API client
│   ├── lostPersonModel.ts      # ISRID-based probability calculations
│   ├── types.ts                # TypeScript interfaces
│   └── auth-context.tsx        # Authentication context
├── public/
│   └── manifest.json           # PWA manifest
├── next.config.ts              # Next.js configuration
├── package.json                # Dependencies
└── tsconfig.json               # TypeScript configuration
```

## Features Implemented

### ✅ Phase 1: Foundation (Complete)
1. **Next.js Setup** - App Router with TypeScript and Tailwind CSS
2. **Authentication System** - Token management for CalTopo, D4H, and SARCommand Assist
3. **Dashboard UI** - Responsive grid layout with map, personnel, incidents, and decision prompts
4. **Map Integration** - Leaflet map viewer with sample markers (CalTopo foundation)
5. **API Clients** - Type-safe clients for CalTopo and D4H APIs
6. **Lost Person Model** - ISRID-based probability calculations based on:
   - Age demographics
   - Terrain type
   - Time elapsed
7. **PWA Manifest** - Configuration for offline capabilities

### 🔄 Phase 2: API Integration (Next)
- Real API authentication with CalTopo and D4H
- CalTopo live mapping with search zones
- D4H personnel and incident data loading
- Unified incident dashboard

### 📋 Phase 3: Decision Support (Planned)
- Search probability visualization
- Resource availability matching
- Risk assessment prompts
- Environmental data integration

## Running the App

### Development
```bash
npm run dev
```
App runs at `http://localhost:3000`

### Build
```bash
npm run build
npm start
```

### Lint
```bash
npm run lint
```

## Authentication

Navigate to `/auth` to provide credentials:
1. **CalTopo Team ID & Secret** - Service Account credentials
2. **D4H Personal Access Token** - API access token

Credentials are stored in session context during operation.

## Lost Person Behavior Model

The `lostPersonModel.ts` module implements ISRID-based statistical models:

### Search Probability Calculation
```typescript
calculateSearchProbability(age, terrain, timeElapsed)
```
Returns probability (0-1) based on:
- Age (children/elderly stay put longer)
- Terrain type (forest vs. mountain behavior)
- Time elapsed (probability decreases over time)

### Suggested Search Areas
```typescript
suggestSearchAreas(lat, lng, probability)
```
Returns concentric circles prioritized by likelihood.

## Component Overview

### MapViewer
Displays collaborative map with search zones and team locations using Leaflet.

### PersonnelManager
Lists available personnel from D4H with status and qualifications.

### IncidentManager
Shows active incidents and their status from D4H.

### DecisionPrompts
Provides next-action recommendations based on lost person behavior analysis.

## API Integration

### CalTopo API
```typescript
const caltopo = new CalTopoAPI(teamId, secret);
const data = await caltopo.getAccountData(since);
```

### D4H API
```typescript
const d4h = new D4HAPI(token);
const incidents = await d4h.getIncidents();
```

## Next Steps

1. Integrate real CalTopo mapping data
2. Load D4H personnel and incidents
3. Build decision engine combining all platforms
4. Implement offline field mode
5. Add real-time team coordination
6. Deploy to production

## Deployment

Ready for deployment on:
- Vercel (recommended)
- AWS Amplify
- Railway
- Any Node.js host

## Contributing

Contributions and improvements are welcome. Please ensure:
- Code follows TypeScript best practices
- Components are documented
- New features include appropriate tests
- Documentation is updated

## License

Unlimited license granted to Southeastern Alberta Search and Rescue (SEASAR).  
Copyright © 2023 Pascal Hamish Seguin. All rights reserved.

---

**Status**: Active Development - Phase 1 Complete ✅  
**Organization**: Southeastern Alberta Search and Rescue (SEASAR)  
**Region**: Alberta, Canada
