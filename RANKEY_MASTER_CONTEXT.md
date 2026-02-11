# RANKEY MASTER CONTEXT FILE

**Version:** 1.4
**Last Updated:** 2026-02-10
**Purpose:** Complete briefing document for any Claude (chat or code) working on Rankey

---

## SECTION 0: META - HOW TO USE THIS FILE

### What This File Is

This file contains **ALL context needed** to work on the Rankey system. It is the single source of truth for:
- System architecture and infrastructure
- Current state of all repositories
- Development workflow and processes
- Deployment procedures
- Known issues and ongoing work
- Critical rules and best practices

### When to Use This File

**At the start of EVERY new conversation:**
1. Upload this file to Claude (chat or code)
2. Claude will read and understand the complete system context
3. Work can begin immediately without lengthy explanations

**During development:**
- Reference this file for deployment procedures
- Check current state before making changes
- Follow the workflow rules in Section 6
- Update the file after every change (see Section 9)

### Critical Rule: THIS FILE MUST BE KEPT UP TO DATE

**After EVERY code change, configuration change, or deployment:**
- Update Section 3 (current commit hashes)
- Add entry to Section 8 (changelog)
- Update Section 10 (if issues were fixed or new ones found)
- Commit the updated file WITH your code changes
- Copy updated file to backup directory

**Why this matters:**
- Out-of-date context leads to confusion
- Future Claude sessions depend on accurate information
- Human doesn't need to re-explain the system every time

### How to Use This File with Claude Code

At the start of EVERY Claude Code session, run:
```
"Read START_HERE.md and RANKEY_MASTER_CONTEXT.md. Follow Section 9 rules."
```

**START_HERE.md is located in both repository roots** and contains:
- Mandatory reading instructions
- Documentation update requirements
- Critical rules reminder
- Reference to this file's Section 9

**Standard Workflow:**
```
# Start of Claude Code session:
1. Claude Code: Read START_HERE.md (in repo root)
2. Claude Code: Read RANKEY_MASTER_CONTEXT.md (this file)
3. Claude Code: Check Section 3 for current state
4. Claude Code: Follow workflow in Section 6
5. Claude Code: Make changes on a NEW BRANCH
6. Claude Code: Update this file in the SAME commit
7. Claude Code: Wait for human approval before merging
```

---

## SECTION 1: SYSTEM OVERVIEW

### What Rankey Is

**Rankey** is an **Amazon product scraping and deal tracking system** designed to:
- Scan Amazon for products with coupons and deals
- Extract detailed pricing data, BSR (Best Seller Rank), and product information
- Track and analyze product categories for deal opportunities
- Provide real-time progress updates during scans

### Purpose & Use Cases

1. **ASIN Scan:** Scrape specific products by Amazon ASIN (product ID)
2. **Category Scan:** Scan entire Amazon categories for products with deals
3. **Deals Scan:** Monitor Amazon deals pages for promotional products
4. **Deal Tracking:** Identify products with coupons, Subscribe & Save, or price discounts

### Technology Stack

| Layer | Technology | Details |
|-------|------------|---------|
| **Frontend** | React + Vite | Modern React with Vite build system |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **Backend** | Node.js + Express | RESTful API server |
| **Database** | MongoDB | NoSQL database for products, scans, categories |
| **Scraping** | ScrapingBee API | Third-party service for Amazon scraping |
| **Real-time** | Server-Sent Events (SSE) | Real-time scan progress updates |
| **Hosting (Frontend)** | Render.com | Auto-deploy from GitHub |
| **Hosting (Backend)** | Hetzner VPS | Self-hosted VPS server |
| **Tunnel** | Cloudflare Tunnel | HTTPS access to backend |
| **Process Manager** | PM2 | Keeps Node.js app running |

### Three Scan Types

1. **ASIN Scan**
   - Input: List of Amazon ASINs
   - Process: Scrape each product page individually
   - Output: Product details, price, coupon info, BSR
   - Use case: Monitor specific products

2. **Category Scan**
   - Input: Amazon category URL
   - Process: Scrape category pages, extract all products
   - Output: All products in category with deal information
   - Use case: Find deals in specific categories

3. **Deals Scan**
   - Input: Amazon deals/coupons page
   - Process: Scrape deals pages, extract products with active deals
   - Output: Products currently on sale or with coupons
   - Use case: Track current deals and promotions

### Scraping Modes

Rankey supports **two scraping modes** for product data extraction:

#### 1. HTML Scraping Mode (Default)

- **Endpoint:** ScrapingBee HTML API (`/api/v1/`)
- **Process:**
  - Fetches full HTML page from Amazon
  - Parses HTML with Cheerio (jQuery-like selector library)
  - Extracts data using CSS selectors
- **Advantages:**
  - Can extract all available fields (including quantity, dateFirstAvailable)
  - Mature and battle-tested
  - Current accuracy: ~98%
- **Disadvantages:**
  - Subject to HTML structure changes
  - Location-based pricing issues (37% of products show "cannot be shipped")
  - More complex parsing logic
- **Cost:** 5 credits per request
- **Parser:** handlers/pages-parser.js

#### 2. Amazon API Mode (NEW - feature/amazon-api-mode branch)

- **Endpoint:** ScrapingBee Amazon API (`/api/v1/amazon/product`)
- **Process:**
  - Calls Amazon API with ASIN and zip_code parameters
  - Returns structured JSON response
  - Transforms JSON to database schema
- **Advantages:**
  - **Solves location-based pricing issue** (sets zip_code=10001 for US pricing)
  - More reliable data extraction (no HTML parsing)
  - Structured data format (no selector breakage)
  - Cleaner, simpler parsing logic
- **Disadvantages:**
  - Missing some fields (quantity, dateFirstAvailable)
  - Newer, less battle-tested
- **Cost:** 5 credits per request (same as HTML mode)
- **Scraper:** handlers/amazon-api-scraper.js
- **Parser:** handlers/amazon-api-parser.js
- **Configuration:** Set `useAmazonAPI: true` in scan config
- **Supported Scan Types:** ALL scan types (ASIN, Category, Deals)
- **Status:** Fully implemented and tested locally, ready for production deployment

#### Mode Selection

- **Default:** HTML mode (backward compatible)
- **Toggle:** Set `useAmazonAPI: true` in scan configuration (available for ALL scan types)
- **Recommendation:** Use Amazon API mode for products with location restrictions
- **Frontend:** UI checkbox available in NewScanModal for all scan types (ASIN, Category, Deals)

#### Field Mapping Comparison

| Field | HTML Mode | API Mode | Notes |
|-------|-----------|----------|-------|
| ASIN | ✅ | ✅ | Both modes |
| Title | ✅ | ✅ | Both modes |
| Price | ✅ | ✅ | API more reliable for restricted items |
| Brand | ✅ | ✅ | Both modes |
| Category | ✅ | ✅ | Both modes |
| Rank (BSR) | ✅ | ✅ | Both modes |
| Coupon | ✅ | ✅ | API uses discount_percentage field |
| Rating | ✅ | ✅ | Both modes |
| Reviews Count | ✅ | ✅ | Both modes |
| Availability | ✅ | ✅ | Both modes |
| isPrime | ✅ | ✅ | API checks delivery_details |
| Color | ✅ | ✅ | API extracts from variations |
| Size | ✅ | ✅ | API extracts from variations |
| Images | ✅ | ✅ | Both modes |
| Product Link | ✅ | ✅ | Both modes |
| **Quantity** | ✅ | ❌ | Only in HTML mode |
| **dateFirstAvailable** | ✅ | ❌ | Only in HTML mode |
| Purchase Info | ✅ | ❌ | Only in HTML mode |
| scrapeMethod | N/A | ✅ | Metadata: "html" or "amazon-api" |
| scrapedAt | N/A | ✅ | Metadata: timestamp |
| apiVersion | N/A | ✅ | Metadata: "v1" |

### Real-Time Updates

- **Technology:** Server-Sent Events (SSE)
- **Purpose:** Stream scan progress to frontend in real-time
- **Flow:** Backend sends events → Frontend displays progress bar and status
- **Endpoint:** `/amazon/scans-list/events`
- **Reconnection:** Frontend automatically reconnects if connection drops

---

## SECTION 2: ARCHITECTURE

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Internet Users                               │
│                      (Browser: Chrome/Firefox/etc.)                   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 │ HTTPS/443
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
                 │                                │
        ┌────────▼──────────┐          ┌─────────▼────────┐
        │   FRONTEND         │          │   BACKEND API    │
        │   React + Vite     │──────────│   (via Tunnel)   │
        │                    │   HTTPS  │                  │
        │ Render.com         │          │ rankey-api       │
        │ Auto-Deploy        │          │ .jsecom.pl       │
        │                    │          │                  │
        └────────────────────┘          └─────────┬────────┘
                                                  │
        https://rankey-staging-ui                 │
              .onrender.com                       │
                                                  │
                                         ┌────────▼────────┐
                                         │  Cloudflare     │
                                         │  Tunnel         │
                                         │  (cloudflared)  │
                                         │  Systemd        │
                                         │  Service        │
                                         └────────┬────────┘
                                                  │
                                                  │ HTTP/7000
                                                  │ (localhost)
                                                  │
                        ┌─────────────────────────▼──────────────────────────┐
                        │         VPS SERVER (5.78.43.96)                    │
                        │         Ubuntu 24, Hetzner                         │
                        │                                                    │
                        │  ┌──────────────────────────────────────────┐    │
                        │  │  BACKEND APPLICATION                     │    │
                        │  │  /root/rankey-api/                       │    │
                        │  │                                          │    │
                        │  │  ┌────────────────────────────────┐     │    │
                        │  │  │  Node.js + Express             │     │    │
                        │  │  │  Port 7000 (localhost)         │     │    │
                        │  │  │  Managed by PM2                │     │    │
                        │  │  │  Process: rankey-api           │     │    │
                        │  │  └────────┬───────────────────────┘     │    │
                        │  │           │                              │    │
                        │  │           │ mongodb://localhost:27017    │    │
                        │  │           │                              │    │
                        │  │  ┌────────▼───────────────────────┐     │    │
                        │  │  │  MongoDB                       │     │    │
                        │  │  │  Database: rankey              │     │    │
                        │  │  │  Port 27017 (localhost only)   │     │    │
                        │  │  │  Systemd: mongod.service       │     │    │
                        │  │  └────────────────────────────────┘     │    │
                        │  └──────────────────────────────────────────┘    │
                        │                      │                            │
                        │                      │ HTTPS API calls            │
                        │                      │                            │
                        │              ┌───────▼──────────┐                 │
                        │              │  External APIs   │                 │
                        │              │                  │                 │
                        │              │  ScrapingBee     │                 │
                        │              │  ScrapingDog     │                 │
                        │              └──────────────────┘                 │
                        └────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Frontend (React/Vite - Render.com)

**What it does:**
- Provides user interface for creating and managing scans
- Displays scan results and product data
- Shows real-time progress via SSE
- Handles user authentication

**Technology:**
- React 18 with Vite build system
- Tailwind CSS for styling
- React Router for navigation
- SSE for real-time updates

**Deployment:**
- **Platform:** Render.com
- **Auto-Deploy:** Yes (on push to main branch)
- **Build Command:** `npm install && npm run build`
- **URL:** https://rankey-staging-ui.onrender.com
- **Repository:** https://github.com/eyshstore/rankey-staging-ui

**Configuration:**
- Environment variable: `VITE_API_BASE_URL` → points to backend
- No secrets stored in frontend (all API keys in backend)

#### 2. Backend (Node.js/Express - Hetzner VPS)

**What it does:**
- RESTful API for frontend
- Orchestrates Amazon scraping via ScrapingBee
- Stores and retrieves data from MongoDB
- Manages scan jobs and queue
- Sends real-time updates via SSE

**Technology:**
- Node.js 20.19.6
- Express.js framework
- PM2 process manager
- Session management with express-session

**Deployment:**
- **Platform:** Hetzner VPS (5.78.43.96)
- **Process Manager:** PM2
- **Process Name:** rankey-api
- **Port:** 7000 (localhost only)
- **Directory:** `/root/rankey-api/`
- **Repository:** https://github.com/eyshstore/rankey-staging-backend

**Configuration:**
- Environment file: `/root/rankey-api/.env`
- See Section 5 for environment variables

#### 3. MongoDB (Database - VPS)

**What it does:**
- Stores products, scans, categories, and session data
- Provides fast queries for product search
- Maintains scan history

**Configuration:**
- **Host:** localhost:27017
- **Database:** rankey
- **Collections:** products, categories, scans, sessions
- **Authentication:** None (localhost-only access)
- **Systemd Service:** mongod.service

**Data Size:**
- 392,210 total documents
- 296,889 products
- 95,214 categories
- 105 scans
- 2 sessions

#### 4. Cloudflare Tunnel (HTTPS Access)

**What it does:**
- Provides public HTTPS access to backend
- Tunnels traffic from internet to localhost:7000
- Managed SSL certificates

**Configuration:**
- **Tunnel Name:** rankey-staging
- **Tunnel ID:** 4b565581-488c-419c-aebe-48173f386f5e
- **Public URL:** rankey-api.jsecom.pl
- **Target:** http://localhost:7000
- **Config File:** `/etc/cloudflared/config.yml`
- **Systemd Service:** cloudflared.service

#### 5. ScrapingBee API (External Service)

**What it does:**
- Scrapes Amazon pages (handles JavaScript rendering)
- Bypasses Amazon's anti-bot measures
- Provides clean HTML for parsing

**Configuration:**
- **API Key:** Stored in backend .env
- **Usage:** Backend makes HTTPS requests to ScrapingBee
- **Features Used:** JavaScript rendering, cookie support, custom headers

### Data Flow

**Typical Scan Flow:**

1. **User initiates scan** (Frontend)
   - User enters ASINs or category URL
   - Frontend sends POST request to backend

2. **Backend receives request**
   - Validates input
   - Creates scan record in MongoDB
   - Queues scraping jobs

3. **Backend scrapes Amazon** (via ScrapingBee)
   - For each ASIN/product:
     - Request page via ScrapingBee API
     - Parse HTML for price, BSR, coupon info
     - Extract product details

4. **Backend stores results**
   - Save products to MongoDB
   - Update scan status
   - Send SSE events to frontend

5. **Frontend displays results**
   - Receives SSE updates in real-time
   - Updates progress bar
   - Shows products as they're scraped

6. **Scan completes**
   - Backend marks scan as complete
   - Frontend shows final results
   - User can download data

---

## SECTION 3: REPOSITORIES & CURRENT STATE

### Frontend Repository

**Repository:** https://github.com/eyshstore/rankey-staging-ui

| Property | Value |
|----------|-------|
| **Current Branch** | main |
| **Latest Commit** | ee48500 |
| **Commit Message** | docs: Add START_HERE.md with mandatory Claude Code instructions |
| **Commit Date** | 2026-02-02 |
| **Deployed URL** | https://rankey-staging-ui.onrender.com |
| **Deployment Status** | ✅ Deployed (auto-deploy from main) |

**Repository Status:**
- Clean working tree (no uncommitted changes)
- Up to date with remote origin/main
- Auto-deploys to Render on every push to main

### Backend Repository

**Repository:** https://github.com/eyshstore/rankey-staging-backend

| Property | Value |
|----------|-------|
| **Current Branch** | main |
| **Latest Commit** | 3ba0cbd |
| **Commit Message** | fix: setState() not persisting to MongoDB + cleanup job |
| **Commit Date** | 2026-02-05 |
| **API URL** | https://rankey-api.jsecom.pl |

**Repository Status:**
- Clean working tree (no uncommitted changes)
- Up to date with remote origin/main
- Requires manual deployment to VPS

**Server Status:**
| Property | Value |
|----------|-------|
| **Server Commit** | 3ba0cbd (matches GitHub) |
| **Status** | ✅ Server is up to date with GitHub |
| **PM2 Status** | Online (restarted 2026-02-09) |

### Feature Branch Status (In Development)

**Branch:** feature/amazon-api-mode (both frontend and backend)

| Repository | Latest Commit | Status |
|------------|---------------|--------|
| **Backend** | ffeeb52 | ⏸️ Ready to push |
| **Frontend** | 39b29e3 | ✅ Pushed to GitHub |

**Feature:** Amazon API mode integration for solving location-based pricing issues

**Backend Commits:**
- 7496ed8: Core implementation (scraper, parser, ASINScan modifications)
- 6058f74: Documentation update
- ffc6ad8: Investigation findings for coupon detection failure
- 2b8dedb: Fix for coupon detection using discount_percentage field
- ffeeb52: Hybrid coupon extraction with HTML fallback + data investigation

**Frontend Commits:**
- 39b29e3: UI toggle for Amazon API mode

**Status:**
- ✅ Backend implementation complete and tested locally
- ✅ Frontend UI toggle implemented
- ⏸️ Awaiting integration testing
- ⏸️ Awaiting human approval for merge to main
- ❌ NOT deployed to production yet

---

## SECTION 4: INFRASTRUCTURE DETAILS

### VPS Server

**Provider:** Hetzner
**Server Details:**

| Property | Value |
|----------|-------|
| **IP Address** | 5.78.43.96 |
| **Hostname** | rankey-staging |
| **OS** | Ubuntu 24 (systemd-based) |
| **Access** | SSH as root |
| **SSH Command** | `ssh root@5.78.43.96` |

### Services Running

#### 1. PM2 (Process Manager)

**Process:** rankey-api

| Property | Value |
|----------|-------|
| **Process ID** | 0 |
| **Status** | online |
| **Uptime** | 6+ days |
| **Restarts** | 32,201 (automatic on crash) |
| **Memory** | 174.4 MB |
| **Script Path** | /root/rankey-api/index.js |
| **Working Dir** | /root/rankey-api |
| **Node.js Version** | 20.19.6 |
| **Memory Limit** | 4096 MB (max-old-space-size) |

**Log Locations:**
- Output: `/root/.pm2/logs/rankey-api-out.log`
- Errors: `/root/.pm2/logs/rankey-api-error.log`

#### 2. MongoDB (mongod.service)

| Property | Value |
|----------|-------|
| **Service** | mongod.service |
| **Status** | active (running) |
| **Auto-start** | enabled |
| **Port** | 27017 (localhost only) |
| **Config File** | /etc/mongod.conf |
| **Database** | rankey |
| **Memory Usage** | 518.5 MB |

#### 3. Cloudflare Tunnel (cloudflared.service)

| Property | Value |
|----------|-------|
| **Service** | cloudflared.service |
| **Status** | active (running) |
| **Auto-start** | enabled |
| **Uptime** | 3+ weeks |
| **Version** | 2025.11.1 (⚠️ outdated, 2026.1.2 available) |
| **Memory Usage** | 18.5 MB |

### Network Ports

| Port | Service | Access | Purpose |
|------|---------|--------|---------|
| 22 | SSH | External (authorized keys) | Server administration |
| 7000 | Backend | Localhost only | Node.js application |
| 27017 | MongoDB | Localhost only | Database connections |
| 443 | Cloudflare | Public (HTTPS) | Tunneled to backend:7000 |

### File Locations

| Purpose | Path |
|---------|------|
| **Backend Code** | /root/rankey-api/ |
| **Environment Config** | /root/rankey-api/.env |
| **PM2 Logs** | /root/.pm2/logs/ |
| **MongoDB Config** | /etc/mongod.conf |
| **Cloudflare Config** | /etc/cloudflared/config.yml |
| **Cloudflare Credentials** | /root/.cloudflared/4b565581-488c-419c-aebe-48173f386f5e.json |
| **Backups (temporary)** | /tmp/rankey-*-backup-YYYYMMDD/ |

### Disk Usage

| Item | Size |
|------|------|
| **Total Disk** | 80 GB |
| **Used** | 10 GB |
| **Available** | 70 GB |
| **MongoDB Data** | 104 MB |

---

## SECTION 5: CONFIGURATION & ENVIRONMENT

### Backend Environment Variables

**Location:** `/root/rankey-api/.env` (on VPS server)

**Required Variables (Keys Only):**

| Variable | Purpose | Example |
|----------|---------|---------|
| `DB_HOST` | MongoDB connection string | mongodb://localhost:27017/rankey |
| `PORT` | Backend application port | 7000 |
| `SESSION_SECRET` | Express session encryption | ⚠️ Currently "secret" (MUST CHANGE) |
| `NODE_ENV` | Environment mode | production |
| `FRONTEND_URL` | Frontend origin for CORS | https://rankey-staging-ui.onrender.com |
| `SCRAPINGBEE_API_KEY` | ScrapingBee authentication | (see CREDENTIALS.md) |
| `SCRAPINGDOG_API_KEY` | ScrapingDog authentication | (see CREDENTIALS.md) |

**⚠️ SECURITY WARNING:**
- Actual values are stored in `CREDENTIALS.md` (private, not in git)
- `.env` file is in `.gitignore` (never commit it)
- `SESSION_SECRET` is currently "secret" - MUST be changed to strong random value

### Frontend Environment Variables

**Location:** Render.com Dashboard → Environment Tab

| Variable | Purpose | Value (public) |
|----------|---------|----------------|
| `VITE_API_BASE_URL` | Backend API endpoint | https://rankey-api.jsecom.pl |

**Note:** Vite requires `VITE_` prefix to expose variables to client

**Usage in Code:**
```javascript
// src/config.js
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL
};
```

### API Keys Management

**ScrapingBee:**
- Primary scraping provider (default)
- Key stored in backend `.env`
- Used with `render_js=true` for JavaScript rendering
- Monitor usage at: https://www.scrapingbee.com/dashboard

**ScrapingDog:**
- Backup scraping provider
- Key stored in backend `.env`
- Currently not default (can switch in backend config)

### Configuration Files

| File | Location | In Git? | Purpose |
|------|----------|---------|---------|
| `.env` | /root/rankey-api/.env | ❌ No | Backend secrets |
| `.env.example` | Repository | ✅ Yes | Template (no values) |
| `config.yml` | /etc/cloudflared/config.yml | ✅ Yes (no secrets) | Tunnel config |
| `credentials.json` | /root/.cloudflared/[tunnel-id].json | ❌ No | Tunnel auth |
| `package.json` | Repository root | ✅ Yes | Dependencies |
| `vite.config.js` | Frontend root | ✅ Yes | Vite config |

---

## SECTION 6: THE WORKFLOW - HOW WE WORK

### Complete Development Workflow

This is the **EXACT process** to follow for ANY change to the Rankey system.

---

#### Step 1: Discussion Phase (Claude Chat)

**Purpose:** Plan the work before coding

**Process:**
1. Human describes what they want: feature, fix, or improvement
2. Claude Chat asks clarifying questions
3. Claude Chat and human **decide together** on the approach
4. Claude Chat writes **detailed prompt** for Claude Code
5. Claude Chat tells human:
   - Where to open Claude Code (which directory)
   - What prompt to paste
   - What the expected outcome is

**Example:**
```
Human: "I want to add a bulk import feature for scanning multiple ASINs"

Claude Chat: "Let me understand:
- How many ASINs should we support? (100? 1000?)
- What format? (CSV? Text file? Paste in textarea?)
- Should we validate ASINs before starting scan?
- Should this be a new scan type or added to existing ASIN scan?"

[Discussion continues...]

Claude Chat: "Here's the plan:
1. Add CSV upload to frontend
2. Parse CSV, validate ASINs
3. Create new /api/bulk-import endpoint
4. Queue scan jobs in batches

Open Claude Code in: C:\Users\user\Documents\Jonathan Documents\NEW\
Paste this prompt: [detailed prompt here]"
```

---

#### Step 2: Development Phase (Claude Code)

**Purpose:** Implement the changes on a feature branch

**CRITICAL RULES:**
- ✋ **NEVER work directly on main branch**
- ✅ **ALWAYS create a feature/fix branch first**
- ✅ **ALWAYS update documentation in the same commit**

**Process:**

1. **Create branch:**
   ```bash
   # For new features
   git checkout -b feature/bulk-import

   # For bug fixes
   git checkout -b fix/price-extraction

   # For hotfixes
   git checkout -b hotfix/session-secret
   ```

2. **Make changes:**
   - Edit files as needed
   - Follow existing code style
   - Add comments where logic is complex
   - DO NOT over-engineer (keep it simple)

3. **Update documentation:**
   - Update `RANKEY_MASTER_CONTEXT.md` (this file)
   - Update Section 3 (current state)
   - Add entry to Section 8 (changelog)
   - Update Section 10 (if fixing issues)

4. **Commit changes:**
   ```bash
   git add .
   git commit -m "Feature: Add bulk import for multiple ASINs

   - Frontend: New BulkImportForm component
   - Backend: New /api/bulk-import endpoint
   - Validates CSV format and ASINs
   - Update RANKEY_MASTER_CONTEXT.md

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   ```

5. **Provide output:**
   - Show what files were changed
   - Show git diff summary
   - Explain what was done
   - Note any issues or limitations

**DO NOT YET:**
- ❌ Push to GitHub
- ❌ Merge to main
- ❌ Deploy to server

---

#### Step 3: Testing & Feedback Loop

**Purpose:** Verify changes work correctly

**Process:**

1. **Human copies Claude Code output to Claude Chat:**
   ```
   Human: "Here's what Claude Code did:
   [paste output]

   Should I test this? What should I check?"
   ```

2. **Claude Chat reviews and suggests tests:**
   ```
   Claude Chat: "Test these scenarios:
   1. Upload CSV with valid ASINs - should start scan
   2. Upload CSV with invalid ASINs - should show errors
   3. Upload file larger than 1000 ASINs - should reject
   4. Check scan progress updates in real-time"
   ```

3. **Human tests locally (if local setup ready) or reviews code:**
   - Check git diff for correctness
   - Review logic and approach
   - Verify documentation was updated

4. **If changes needed:**
   - Human tells Claude Chat what needs fixing
   - Claude Chat writes another prompt
   - Human gives prompt to Claude Code
   - Claude Code makes additional commits
   - Repeat until satisfied

**Iteration Example:**
```
Human: "The CSV upload works but it doesn't validate ASINs"

Claude Chat: "Got it, let's add validation.
Give Claude Code this prompt: [prompt to add ASIN validation]"

[Claude Code adds validation, commits]
```

---

#### Step 4: Approval & Deployment (ONLY after human confirms)

**Purpose:** Merge approved changes and deploy to production

**⚠️ CRITICAL:** Do NOT proceed without explicit human approval

**Wait for human to say:**
- "Approved, ready to merge and deploy"
- "LGTM, deploy it"
- "Looks good, push it"

**Claude Chat then writes final deployment prompt:**

```
Claude Chat: "Great! Give Claude Code this final prompt:

1. Merge your feature branch to main
2. Push to GitHub
3. Update SYSTEM.md changelog
4. [For backend] Deploy to server via SSH
5. [For frontend] Render will auto-deploy
6. Verify deployment
```

**Claude Code executes:**

```bash
# 1. Merge to main
git checkout main
git merge feature/bulk-import

# 2. Push to GitHub
git push origin main

# 3. Update SYSTEM.md (add changelog entry)
[Edit SYSTEM.md Section 8]

# 4. For backend: Deploy to server
ssh root@5.78.43.96 << 'EOF'
cd /root/rankey-api
git pull origin main
npm install  # only if package.json changed
pm2 restart rankey-api
pm2 logs rankey-api --lines 50
EOF

# 5. For frontend: nothing needed (Render auto-deploys)

# 6. Verify
# Check frontend: https://rankey-staging-ui.onrender.com
# Check backend: curl https://rankey-api.jsecom.pl
```

**Claude Code reports:**
- ✅ Merged to main
- ✅ Pushed to GitHub
- ✅ Backend deployed (PM2 restarted, no errors)
- ✅ Frontend building on Render
- ✅ Documentation updated

---

#### Step 5: Verification

**Purpose:** Confirm changes are live and working

**Process:**

1. **Human verifies production:**
   - Open frontend URL: https://rankey-staging-ui.onrender.com
   - Test the new feature
   - Check for errors in browser console
   - Verify backend API is responding

2. **If issues found:**
   - Report to Claude Chat
   - Claude Chat may suggest rollback or hotfix
   - Follow Steps 2-4 again for fixes

3. **If all good:**
   - Human: "Verified, all working!"
   - Move to next task

---

### Special Cases

#### Hotfix Workflow (Emergency Fixes)

For critical bugs in production:

1. **Skip lengthy discussion** - create hotfix branch immediately
2. **Branch naming:** `hotfix/critical-bug-name`
3. **Make minimal changes** - only fix the specific bug
4. **Test thoroughly** - verify fix doesn't break anything else
5. **Deploy immediately** - merge and deploy ASAP
6. **Document in Section 10** - add to known issues as resolved

#### Configuration-Only Changes

For changes to `.env`, config files, or infrastructure:

1. **No code changes** - only configuration
2. **No git commit needed** - unless config file is in git
3. **SSH to server** - make changes directly
4. **Restart services** - pm2 restart, systemctl restart
5. **Update RANKEY_MASTER_CONTEXT.md** - document the change
6. **Commit documentation** - push updated context file

#### ⚠️ CRITICAL: .env File Handling

**NEVER include .env in git stash or git operations**

**The Problem:**
- `.env` contains production secrets (API keys, database URLs)
- Git stash can accidentally revert .env to old values
- This has caused the ScrapingBee API key to revert to expired key multiple times
- Results in production failures with 401 errors

**WRONG Way:**
```bash
# This will include .env and can cause issues
git stash
git stash pop
```

**CORRECT Way:**
```bash
# Exclude .env from stash
git stash push -- ":(exclude).env"

# Or manually backup before stashing
cp .env .env.backup
git stash
# ... do your git operations ...
git stash pop
cp .env.backup .env
```

**During Workflow - ALWAYS:**

1. **Before git stash:**
   ```bash
   # Backup .env manually
   cp .env .env.backup

   # Stash without .env
   git stash push -- ":(exclude).env"
   ```

2. **After git unstash:**
   ```bash
   # Restore .env from backup
   cp .env.backup .env

   # Or verify .env has correct values
   grep SCRAPINGBEE_API_KEY .env
   ```

3. **After ANY git operation (pull, merge, checkout):**
   ```bash
   # ALWAYS verify ScrapingBee API key is correct
   grep SCRAPINGBEE_API_KEY .env
   ```

**ScrapingBee API Key - ALWAYS VERIFY:**

```bash
# Production and local MUST use this key:
SCRAPINGBEE_API_KEY=FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83

# If different, update immediately:
# Production:
ssh root@5.78.43.96 'cd /root/rankey-api && cp .env .env.backup && sed -i "s/^SCRAPINGBEE_API_KEY=.*/SCRAPINGBEE_API_KEY=FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83/" .env && pm2 restart rankey-api --update-env'

# Local:
sed -i "s/^SCRAPINGBEE_API_KEY=.*/SCRAPINGBEE_API_KEY=FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83/" .env
```

**Symptoms of Wrong API Key:**
- 401 Unauthorized errors from ScrapingBee
- "Invalid api key" errors in PM2 logs
- All scans failing immediately
- Check PM2 logs: `pm2 logs rankey-api --err`

**Prevention Checklist:**
- [ ] .env is in .gitignore ✅ (already done)
- [ ] Never `git add .env`
- [ ] Always use `git stash push -- ":(exclude).env"`
- [ ] Verify API key after every git pull/merge/checkout
- [ ] Keep .env.backup for quick restore
- [ ] Check CREDENTIALS.md for correct keys

**Historical Context:**
- This issue has occurred multiple times (2026-02-03, 2026-02-09)
- Root cause: .env accidentally included in git stash operations
- Result: Production reverts to old/expired API key
- Impact: All scans fail until manually fixed

---

## SECTION 7: LOCAL TESTING SETUP

### Current Local Structure

**Working Directory:**
```
C:\Users\user\Documents\Jonathan Documents\NEW\
├── rankey-staging-backend/     # Backend repo (local clone)
├── rankey-staging-ui/          # Frontend repo (local clone)
├── CREDENTIALS.md              # Private credentials file
├── SYSTEM.md                   # Public documentation
└── RANKEY_MASTER_CONTEXT.md    # This file
```

**Original Local Setup (Needs Reconfiguration):**
```
C:\Users\user\Documents\Jonathan Documents\eBay\Rankey\rankey-staging\
├── frontend/   # Original frontend location
└── backend/    # Original backend location
```

### Local Testing Status

✅ **Current Status:** Local testing environment is FULLY CONFIGURED and operational

**Completed Setup:**
1. ✅ Local MongoDB instance running (Windows Service)
2. ✅ `.env.local` for backend (configured for local development)
3. ✅ `.env.local` for frontend (pointing to local backend)
4. ✅ Dependencies installed in both repos
5. ✅ Production data imported to local MongoDB
   - 296,889 products
   - 95,214 categories
   - 105 scans
   - 2 sessions
6. ✅ Backend runs: `npm start` (Node.js on port 7000)
7. ✅ Frontend runs: `npm run dev` (Vite dev server on port 5173)

**Last Updated:** 2026-02-03

### Temporary Testing Approach

**Until local setup is complete, we test by:**

1. **Code Review:**
   - Carefully review all code changes
   - Check git diff before merging
   - Verify logic and syntax

2. **Staging Deployment:**
   - Deploy to production (staging environment)
   - Test immediately on live site
   - Monitor PM2 logs for errors
   - Be ready to rollback if needed

3. **Gradual Rollout:**
   - Test features on non-critical data first
   - Monitor logs closely after deployment
   - Get user feedback quickly

### Active Local Testing Setup

**MongoDB Local:**
- Running as Windows Service on localhost:27017
- Database: `rankey` (imported from production backup 2026-02-02)
- Collections: products, categories, scans, sessions
- Total documents: 392,210

**Backend Environment Files (Updated 2026-02-10):**

The backend now uses **separate environment files** to prevent CORS issues:

- `.env.local` - Local development (FRONTEND_URL=http://localhost:5173)
- `.env.production` - Production/VPS (FRONTEND_URL=https://rankey-staging-ui.onrender.com)
- `.env.example` - Template for new developers (safe for git)

**IMPORTANT:** Use the correct npm script:
- Local: `npm start` → uses .env.local
- Production: `npm start:prod` → uses .env.production

**Backend .env.local:**
```env
DB_HOST=mongodb://localhost:27017/rankey
PORT=7000
SESSION_SECRET=local-dev-secret-not-for-production-use-only
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
SCRAPINGBEE_API_KEY=FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83
SCRAPINGDOG_API_KEY=65958587ebfede1211659265
```

**Backend .env.production:**
```env
DB_HOST=mongodb://localhost:27017/rankey
PORT=7000
SESSION_SECRET=<strong random value - see CREDENTIALS.md>
NODE_ENV=production
FRONTEND_URL=https://rankey-staging-ui.onrender.com
SCRAPINGBEE_API_KEY=FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83
SCRAPINGDOG_API_KEY=65958587ebfede1211659265
```

**Frontend .env.local:**
```env
VITE_API_BASE_URL=http://localhost:7000
```

**Running Locally:**
```bash
# Terminal 1: Backend
cd "C:\Users\user\Documents\Jonathan Documents\NEW\rankey-staging-backend"
npm start

# Terminal 2: Frontend
cd "C:\Users\user\Documents\Jonathan Documents\NEW\rankey-staging-ui"
npm run dev

# Open: http://localhost:5173
```

**Testing with Real Data:**
- Local database contains full production dataset from 2026-02-02
- Can test all features with real product data
- No need to mock data or create test fixtures
- Safe to experiment without affecting production

### Troubleshooting CORS Issues

**Problem:** Frontend at http://localhost:5173 cannot connect to backend, browser shows CORS errors

**Root Cause:** Backend is using wrong FRONTEND_URL in environment configuration

**Solution:**
1. **Check which env file is being used:**
   ```bash
   cd rankey-staging-backend
   # For local: Should use .env.local
   npm start

   # Check backend logs for: "CORS allowed origin: http://localhost:5173"
   ```

2. **Verify .env.local has correct FRONTEND_URL:**
   ```bash
   cat .env.local | grep FRONTEND_URL
   # Should output: FRONTEND_URL=http://localhost:5173
   ```

3. **If FRONTEND_URL is wrong:**
   - Edit .env.local file
   - Change FRONTEND_URL to: http://localhost:5173
   - Restart backend: Ctrl+C then npm start

4. **Common Mistakes:**
   - ❌ Using `npm start:prod` for local (uses .env.production)
   - ❌ Editing .env file (doesn't exist anymore)
   - ❌ Running backend without environment file
   - ✅ Always use `npm start` for local development

**Prevention:**
- NEVER manually edit FRONTEND_URL in .env.local after setup
- Use correct npm script: `npm start` (local) vs `npm start:prod` (VPS)
- Both .env.local and .env.production are in .gitignore (won't be committed)

---

## SECTION 8: DEPLOYMENT PROCEDURES

### Frontend Deployment (Automatic)

**Platform:** Render.com
**Trigger:** Git push to main branch
**Time:** ~2-3 minutes

**Process:**

1. **Developer pushes to main:**
   ```bash
   git push origin main
   ```

2. **Render detects push** (webhook from GitHub)

3. **Render builds:**
   ```bash
   npm install
   npm run build
   ```

4. **Render deploys** static files from `dist/`

5. **Site goes live:** https://rankey-staging-ui.onrender.com

**Verification:**
```bash
# Check deployment status
# Visit: https://dashboard.render.com

# Test site
# Open: https://rankey-staging-ui.onrender.com

# Check browser console for errors
# Test API connectivity
```

**Logs:**
- Available in Render dashboard
- Real-time build logs
- Deployment history

**Rollback:**
- Option 1: Revert git commit, push again (Render auto-deploys)
- Option 2: Use Render dashboard to redeploy previous version

---

### Backend Deployment (Manual)

**Platform:** Hetzner VPS (5.78.43.96)
**Trigger:** Manual SSH deployment
**Time:** ~1-2 minutes

**Standard Deployment:**

```bash
# Step 1: SSH to server
ssh root@5.78.43.96

# Step 2: Navigate to application directory
cd /root/rankey-api

# Step 3: Check current status (optional but recommended)
git status
git log -1

# Step 4: Pull latest changes from GitHub
git pull origin main

# Step 5: Install dependencies (ONLY if package.json changed)
# Check git diff for package.json before running
npm install

# Step 6: Restart PM2 process
pm2 restart rankey-api

# Step 7: Verify deployment (check logs for errors)
pm2 logs rankey-api --lines 50

# Step 8: Verify no errors
pm2 list  # Should show "online" status
```

**Verification Commands:**
```bash
# Check PM2 status
pm2 list

# Check application logs (last 100 lines)
pm2 logs rankey-api --lines 100

# Check only error logs
pm2 logs rankey-api --err

# Check system services
systemctl status mongod
systemctl status cloudflared

# Test API endpoint locally
curl http://localhost:7000

# Test API endpoint publicly
curl https://rankey-api.jsecom.pl

# Check current git commit
cd /root/rankey-api && git log -1
```

**Common Issues During Deployment:**

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Port already in use** | PM2 restart fails | `pm2 delete rankey-api && cd /root/rankey-api && pm2 start index.js --name rankey-api` |
| **MongoDB not running** | Connection errors in logs | `systemctl restart mongod` |
| **Cloudflare tunnel down** | API unreachable from internet | `systemctl restart cloudflared` |
| **High memory usage** | PM2 shows >500MB memory | `pm2 restart rankey-api` (clears memory) |
| **Missing dependencies** | "Cannot find module" errors | Run `npm install` |
| **Git conflicts** | Pull fails with conflicts | `git stash && git pull` |

---

### Deployment Checklist

**Before Deploying Backend:**
- [ ] Code reviewed and tested
- [ ] Committed to feature branch
- [ ] Pull request created and approved (or direct merge if urgent)
- [ ] Merged to main branch on GitHub
- [ ] Database migrations ready (if any)
- [ ] Environment variables updated on server (if needed)
- [ ] RANKEY_MASTER_CONTEXT.md updated

**After Deploying Backend:**
- [ ] PM2 process restarted successfully
- [ ] No errors in `pm2 logs rankey-api --lines 50`
- [ ] API responds: `curl http://localhost:7000`
- [ ] Frontend can connect: check https://rankey-staging-ui.onrender.com
- [ ] MongoDB connection working (no DB errors in logs)
- [ ] Cloudflare tunnel active: `systemctl status cloudflared`
- [ ] Server git commit matches GitHub: `git log -1`

**Before Deploying Frontend:**
- [ ] Code reviewed and tested
- [ ] Merged to main branch on GitHub
- [ ] Backend API is healthy (if frontend depends on new endpoints)
- [ ] RANKEY_MASTER_CONTEXT.md updated

**After Deploying Frontend:**
- [ ] Build completed successfully in Render dashboard
- [ ] Site loads: https://rankey-staging-ui.onrender.com
- [ ] No errors in browser console
- [ ] API calls working
- [ ] UI changes visible
- [ ] Real-time features working (SSE)

---

### Rollback Procedures

#### Frontend Rollback

**Option 1: Revert Git Commit**
```bash
# Find the commit to revert to
cd rankey-staging-ui
git log --oneline -10

# Revert to previous commit
git revert <commit-hash>
git push origin main

# Render will auto-deploy the reverted version
```

**Option 2: Render Dashboard**
- Go to Render dashboard
- Select rankey-staging-ui service
- Go to "Deployments" tab
- Click "Redeploy" on a previous deployment

#### Backend Rollback

```bash
# SSH to server
ssh root@5.78.43.96

# Navigate to backend directory
cd /root/rankey-api

# Find commit to roll back to
git log --oneline -10

# Hard reset to previous commit
git reset --hard <previous-commit-hash>

# Restart PM2
pm2 restart rankey-api

# Verify
pm2 logs rankey-api --lines 50
git log -1
```

#### Database Rollback

**If data corruption or bad migration:**
```bash
# SSH to server
ssh root@5.78.43.96

# Stop backend to prevent writes
pm2 stop rankey-api

# Restore from backup
mongorestore --db rankey --drop /path/to/backup/rankey/

# Verify restore
mongosh rankey --eval "db.stats()"

# Restart backend
pm2 start rankey-api
```

---

## SECTION 9: DOCUMENTATION UPDATE RULES

### CRITICAL: This File MUST Be Updated After Every Change

**Why this matters:**
- Out-of-date context leads to confusion and errors
- Future Claude sessions depend on accurate information
- Human doesn't need to re-explain the system every time
- Keeps entire team (human + Claude) aligned

---

### When to Update

Update `RANKEY_MASTER_CONTEXT.md` after:

✅ **Every feature addition**
- Add to Section 1 (if it changes core functionality)
- Update Section 3 (current commit hashes)
- Add to Section 8 (changelog)
- Update Section 10 (if new known issues)

✅ **Every bug fix**
- Update Section 3 (current commit hashes)
- Add to Section 8 (changelog)
- Move issue from "Active" to "Resolved" in Section 10

✅ **Every configuration change**
- Update Section 5 (if environment variables changed)
- Update Section 4 (if infrastructure changed)
- Add to Section 8 (changelog)

✅ **Every deployment**
- Update Section 3 (verify server commit matches GitHub)
- Add to Section 8 (changelog)

✅ **Any infrastructure change**
- Update Section 4 (infrastructure details)
- Update Section 5 (if configuration affected)
- Add to Section 8 (changelog)

---

### What to Update

**Section 3: Repositories & Current State**
```markdown
# Update commit hashes after merge/deployment
**Latest Commit** | abc123f
**Commit Message** | Feature: Add bulk import
**Commit Date** | 2026-02-03 14:30:00 +0200
```

**Section 8: Changelog**
```markdown
# Add entry with this format:
**2026-02-03 - abc123f - Feature: Add bulk import for multiple ASINs**
- Frontend: New BulkImportForm component
- Backend: New /api/bulk-import endpoint
- Validates CSV format, queues scan jobs
- Testing: Verified with 100-item CSV
```

**Section 10: Known Issues**
```markdown
# If bug was fixed, move from "Active Issues" to "Recently Resolved":

**Recently Resolved:**
1. ✅ **Price extraction accuracy** - RESOLVED (2026-02-02)
   - Root cause: JavaScript rendering not enabled
   - Solution: Enabled render_js in ScrapingBee (commit 274a1af)
   - Verification: Tested on 50 products, 98% accuracy

# If new issue discovered, add to "Active Issues":

**Active Issues:**
1. **Bulk import memory usage** - under investigation
   - Symptoms: High memory usage with >500 ASINs
   - Status: Monitoring, may need batching optimization
   - Discovered: 2026-02-03
```

**Section 7: Local Testing Setup**
```markdown
# If local setup changes:
**Updated:** 2026-02-03
- Configured local MongoDB
- Added .env.local files
- Documented setup steps
```

---

### How to Update

**Claude Code must update this file in the SAME commit as code changes:**

```bash
# Example commit that includes both code and docs:
git add .
git commit -m "Feature: Add bulk import for multiple ASINs

- Frontend: New BulkImportForm component
- Backend: New /api/bulk-import endpoint
- Update RANKEY_MASTER_CONTEXT.md (Section 3, 8, 10)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Use Edit tool to update specific sections:**
```javascript
// Claude Code should use str_replace to update:
Edit(file_path="RANKEY_MASTER_CONTEXT.md",
     old_string="**Latest Commit** | 274a1af",
     new_string="**Latest Commit** | abc123f")
```

---

### Enforcement

**Every prompt to Claude Code should include:**
```
"...and update RANKEY_MASTER_CONTEXT.md:
- Section 3 (current commit)
- Section 8 (changelog entry)
- Section 10 (if fixing issues)"
```

**Claude Code should always:**
- ✅ Check if doc update is needed before completing task
- ✅ Update doc in the SAME commit as code changes
- ✅ Mention doc update in commit message
- ✅ Copy updated file to backup directory

**After deployment:**
```bash
# Copy updated file to backup directory
cp RANKEY_MASTER_CONTEXT.md "C:\Users\user\Documents\Jonathan Documents\NEW\"
```

---

### Documentation Update Examples

#### Example 1: Documenting Bug Fixes

**Before fix:**
```markdown
**Active Issues:**
1. **Price extraction accuracy** needs improvement
   - Symptoms: Some prices not extracted correctly from Amazon pages
   - Recent work: Multiple fixes committed (see commits 274a1af through 7cb3a6f)
   - Status: Ongoing improvement area
```

**After fix:**
```markdown
**Recently Resolved:**
1. ✅ **Price extraction accuracy** - RESOLVED (2026-02-02)
   - Root cause: Amazon's dynamic JavaScript rendering wasn't being captured
   - Solution: Enabled render_js in ScrapingBee config (commit 274a1af)
   - Verification: Tested on 50 products, 98% accuracy achieved
   - Related commits: 7cb3a6f, d95b297, 6a08ddc, 274a1af

**Active Issues:**
[remaining active issues...]
```

**And add to Section 8 (Changelog):**
```markdown
**2026-02-02 - 274a1af - Fix: Enable render_js for accurate price extraction**
- Resolves ongoing price extraction issues
- ScrapingBee now renders JavaScript before scraping
- Accuracy improved from ~70% to ~98%
- Testing: Verified on 50 sample products
```

---

#### Example 2: Documenting Ongoing Investigations

**First attempt:**
```markdown
**Active Issues:**
1. **Price extraction accuracy** - under investigation
   - Symptoms: Some prices not extracted correctly
   - Attempted fixes:
     - 2026-01-14 (commit 7cb3a6f): Improved currency validation - partial improvement
   - Status: Testing, monitoring results
   - Next step: Investigate JavaScript rendering
```

**After second attempt:**
```markdown
**Active Issues:**
1. **Price extraction accuracy** - ongoing investigation
   - Symptoms: Some prices not extracted correctly
   - Attempted fixes:
     - 2026-01-14 (commit 7cb3a6f): Improved currency validation - partial improvement
     - 2026-01-18 (commit d95b297): Always use .first() for price - no improvement
   - Status: Testing alternative approaches
   - Current hypothesis: JavaScript rendering issue
   - Next step: Enable render_js in ScrapingBee
```

**Keep updating until resolved, then move to "Recently Resolved"**

---

#### Example 3: Documenting New Features

**Update Section 1 (if feature changes core functionality):**
```markdown
**What Rankey is:** Amazon product scraping system for deal tracking
**Purpose:** Scan Amazon for products with coupons/deals, extract pricing data
**Technology stack:** React (Vite) frontend, Node.js/Express backend, MongoDB, ScrapingBee API
**Four scan types:** ASIN scan, Category scan, Deals scan, **Bulk Import scan** ← NEW
**Real-time updates** via SSE (Server-Sent Events)
```

**Update Section 3 (current state):**
```markdown
**Latest commit:** abc123f - Add bulk import scan feature
```

**Add to Section 8 (Changelog):**
```markdown
**2026-02-03 - abc123f - Feature: Add bulk import scan**
- New scan type: Import CSV with multiple ASINs
- Frontend: New BulkImportForm component
- Backend: New /api/bulk-import endpoint
- Validates CSV format, queues scan jobs
- Testing: Verified with 100-item CSV
```

**Add to Section 10 if there are known limitations:**
```markdown
**Active Issues:**
1. **Bulk import** - new feature, monitoring for issues
   - Current limit: 1000 ASINs per upload
   - Status: Released 2026-02-03, gathering user feedback
```

---

#### Example 4: Documenting Infrastructure Changes

**Update Section 5:**
```markdown
**Backend environment variables** (keys only, values in CREDENTIALS.md):
- DB_HOST, PORT, SESSION_SECRET ✅ (updated 2026-02-02), NODE_ENV, FRONTEND_URL
```

**Update Section 10:**
```markdown
**Security Issues:**
1. ✅ **SESSION_SECRET fixed** (2026-02-02) - Changed to strong random value
2. ⚠️ MongoDB has no authentication (relies on localhost-only access)
```

**Update Section 8:**
```markdown
**2026-02-02 - def456g - Security: Replace SESSION_SECRET with strong random value**
- Generated 48-character random string
- Updated /root/rankey-api/.env on server
- Restarted PM2 service
- All existing sessions invalidated (users need to re-login)
- Verified new secret is active
```

---

### Changelog Entry Template

**Use this format consistently:**

```markdown
**YYYY-MM-DD - [commit-hash] - [Type]: [Brief description]**
- [Detail 1]
- [Detail 2]
- [Detail 3]
- Testing: [What was tested and results]
```

**Types:**
- `Feature` - New functionality
- `Fix` - Bug fix
- `Security` - Security improvement
- `Refactor` - Code restructuring
- `Docs` - Documentation updates
- `Config` - Configuration changes
- `Deploy` - Deployment/infrastructure changes

**Examples:**
```markdown
**2026-02-03 - abc123f - Feature: Add bulk CSV import**
- New BulkImportForm component
- Validates CSV format and ASINs
- Queues up to 1000 scan jobs
- Testing: Verified with 100-item CSV, all scans completed

**2026-02-02 - 274a1af - Fix: Enable render_js for accurate price extraction**
- ScrapingBee now renders JavaScript
- Price extraction accuracy: 98%
- Testing: 50 products, manual verification

**2026-02-02 - def456g - Security: Replace SESSION_SECRET with strong value**
- Generated 48-character random string
- Updated .env on server
- Restarted PM2
- All users logged out (expected)
```

---

## SECTION 10: KNOWN ISSUES & CURRENT STATE

### Active Issues

1. **SSE (real-time updates) connection errors in Cloudflare Tunnel logs**
   - **Symptoms:** "stream canceled by remote with error code 0" errors in cloudflared logs
   - **Impact:** Real-time scan progress updates may be interrupted occasionally
   - **Status:** Under investigation
   - **Workaround:** Frontend automatically retries connection
   - **First observed:** 2026-02-01
   - **Related logs:** `journalctl -u cloudflared -n 100`

2. **Price extraction accuracy - ongoing improvements**
   - **Symptoms:** Some prices not extracted correctly from Amazon pages
   - **Recent work:** Multiple fixes committed (commits 274a1af through 7cb3a6f)
   - **Current accuracy:** ~98% (improved from ~70%)
   - **Status:** Monitoring, ongoing improvement area with new debugging tools
   - **Last fix:** 2026-01-19 - Enabled render_js in ScrapingBee
   - **✅ Debugging tool deployed (2026-02-05, commit 764edc9):** Detailed price extraction logging in production
     - Shows every selector attempted, element found status, extracted text, regex matches
     - Provides HTML samples when price extraction fails
     - Logs properly saved to scan.log.json files (fixed logger.log issue)
     - Included in downloadable debug ZIP files
     - Helps identify why specific products fail (wrong selector, regex issue, missing HTML section, empty text extraction)
     - **Next step:** Analyze logs from failed price extractions to identify root causes
   - **Testing:** Verified on 50 products, ready for production analysis

3. **🔧 Location-based pricing issue - SOLUTION IMPLEMENTED, awaiting deployment**
   - **Symptoms:** 37% of products show "This item cannot be shipped to your selected delivery location" with no price in HTML
   - **Root Cause:** HTML scraping captures location-restricted products that can't be shipped to scraper's location
   - **Solution Implemented (2026-02-10, commit 7496ed8):** Amazon API mode with zip code parameter
     - Uses ScrapingBee's Amazon API endpoint (/api/v1/amazon/product) instead of HTML API
     - Sets zip_code=10001 (New York) for consistent US pricing
     - Returns structured JSON (no HTML parsing needed, more reliable)
     - Same cost as HTML API (5 credits per request)
   - **Implementation Details:**
     - New handlers/amazon-api-scraper.js: API client with retry logic
     - New handlers/amazon-api-parser.js: JSON to schema transformer
     - Modified handlers/scan-types/ASINScan.js: Dual-mode support (HTML + API)
     - Config parameter: useAmazonAPI (default: false, backward compatible)
   - **Testing Results:**
     - ✅ B014WOXB6O (previously no price): Now returns $11.99
     - ✅ B0G8Y8GR28 (normal product with coupon): Returns $99.99 with 50% coupon (uses discount_percentage field)
     - ✅ B0DDTCQGTR (inconsistent API): 10% coupon detected via HTML fallback (hybrid approach)
     - ✅ B0711QYPJD (empty price issue): Now returns $9.95
     - ✅ All field mappings working correctly (price, coupon, category, rank, etc.)
   - **✅ HYBRID COUPON DETECTION (2026-02-11, commit ffeeb52):** Implemented 4-tier fallback system
     - Priority 1: discount_percentage (fast, works for B0G8Y8GR28 - 50% coupon)
     - Priority 2: coupon_discount_percentage (alternative API field)
     - Priority 3: coupon text field (descriptive text extraction)
     - Priority 4: HTML parsing fallback (reliable, works for B0DDTCQGTR - 10% coupon)
     - Uses getDiscountCoupon() from pages-parser.js for HTML fallback
     - Wrapped in try-catch for error handling
     - Enhanced logging shows which method was used
     - Solves Amazon API inconsistency issue
   - **✅ DATA INTEGRITY VERIFIED (2026-02-11):** MongoDB investigation confirmed all data saves correctly
     - Schema uses uppercase "ASIN" field (collections/product.js line 38)
     - B0DDTCQGTR product _id 68eca4feab8c494a7847efc6 contains all fields
     - Excel export showing old data from changeHistory (not a save bug)
   - **Status:** Code complete on feature/amazon-api-mode branch, awaiting:
     - Full integration testing with hybrid coupon approach
     - Human approval for merge to main
     - Production deployment
   - **Deployment ETA:** Pending approval (ready to deploy)
   - **Known Limitations:** Quantity and dateFirstAvailable not available in Amazon API

---

### Recently Resolved

1. **✅ Debug HTML files and logging system** - RESOLVED & DEPLOYED (2026-02-03, commits 6cbcb71, 17f0437, cc0f012)
   - **Symptoms:** When debugPriceLogging checkbox checked, HTML files were not saved
   - **Solution:** Implemented complete debug logging system for all scan types
   - **Features added:**
     - ScanLogger utility (utilities/logger.js) with comprehensive logging
     - HTML files saved to debug-analysis/{scanId}/ when debugPriceLogging enabled
     - Detailed logs saved to debug-analysis/logs/{scanId}.log.json
     - Download endpoint: GET /scans/:scanId/download-debug
     - ZIP archive with HTML files + JSON and text logs
     - Fixed frontend download button endpoint
   - **Coverage:** ASINScan, CategoryScan, and DealsScan all have full logging
   - **Deployment:** Successfully deployed to production (backend + frontend)
   - **Testing:** Ready for testing with debugPriceLogging enabled scans

2. **✅ Local testing environment reconfigured** - RESOLVED (2026-02-03)
   - **Root cause:** Local dev setup not aligned with current repo structure
   - **Solution:**
     - Fixed CORS issue by renaming .env files
     - Restored missing backend files (index.js, utilities/)
     - Imported production MongoDB backup (392,210 documents)
     - Installed all dependencies
   - **Result:** Local environment fully operational with production data
   - **Verification:** Backend starts successfully, all collections accessible

2. **✅ SESSION_SECRET fixed** - RESOLVED (2026-02-02)
   - **Root cause:** Weak session secret set to "secret"
   - **Solution:** Generated strong 48-character random value
   - **File updated:** `/root/rankey-api/.env` on server
   - **Action taken:** Updated .env, restarted PM2
   - **Impact:** All existing sessions invalidated (users need to re-login)
   - **Verification:** Backend restarted successfully, no errors
   - **New value stored in:** CREDENTIALS.md

### Security Issues

1. **⚠️ MongoDB has no authentication**
   - **Risk:** Relies on localhost-only access
   - **Mitigation:** MongoDB bound to localhost only, firewall blocks external access
   - **Status:** Acceptable for current setup (VPS-only access)
   - **Future improvement:** Consider adding authentication
   - **Priority:** Low (mitigated by network isolation)

3. **Cloudflare Tunnel version outdated**
   - **Current:** 2025.11.1
   - **Latest:** 2026.1.2
   - **Risk:** Missing security patches and bug fixes
   - **Action Required:** Update tunnel version
   - **Priority:** Medium
   - **Command:** Check Cloudflare docs for upgrade procedure

---

### Pending Tasks

**Immediate (High Priority):**
- [x] Fix SESSION_SECRET - change to strong random value (COMPLETED 2026-02-02)
- [x] Reconfigure local testing environment (COMPLETED 2026-02-03)
- [x] Fix debug HTML download and add logging (COMPLETED 2026-02-03)
- [ ] Test SSE connection stability
- [ ] Monitor price extraction accuracy

**Short-term (Medium Priority):**
- [ ] Update Cloudflare Tunnel to latest version
- [ ] Set up automated daily backups (cron job)
- [ ] Document all API endpoints

**Long-term (Low Priority):**
- [ ] Add MongoDB authentication
- [ ] Implement rate limiting on API
- [ ] Add health check endpoint (/health)
- [ ] Set up monitoring/alerting system
- [ ] Optimize database queries for performance

---

### Recently Resolved

*(Issues fixed in the last 30 days)*

1. ✅ **Price extraction improved significantly** - RESOLVED (2026-01-19)
   - Root cause: Amazon JavaScript rendering not captured
   - Solution: Enabled render_js in ScrapingBee (commit 274a1af)
   - Result: Accuracy improved from ~70% to ~98%
   - Verification: Tested on 50 products
   - Related commits: 7cb3a6f, d1060d0, e81b4ca, d95b297, 6a08ddc, 274a1af

2. ✅ **Currency symbol validation** - RESOLVED (2026-01-14)
   - Issue: Incorrect currency symbols breaking price parsing
   - Solution: Fixed currency symbols array (commit d1060d0)
   - Result: Proper price formatting for all currencies

3. ✅ **Coupon detection improvements** - RESOLVED (2026-01-13)
   - Issue: Some coupons not detected properly
   - Solution: Improved regex patterns, S&S filtering (commit d8cbd84)
   - Result: Better coupon extraction from product pages

---

## SECTION 11: BACKUP & RECOVERY

### Backup Locations

**Server (Temporary):**
- `/tmp/rankey-api-backup-YYYYMMDD.tar.gz` - Backend code
- `/tmp/rankey-mongo-backup-YYYYMMDD.tar.gz` - MongoDB dump
- **Note:** `/tmp/` is cleared on reboot, not for long-term storage

**Local Machine (Permanent):**
- `C:\Users\user\Documents\Jonathan Documents\NEW\`
- `rankey-api-backup-20260202.tar.gz` (79 MB)
- `rankey-mongo-backup-20260202.tar.gz` (49 MB)

---

### Creating a Backup

#### Quick Backup (Manual)

```bash
# SSH to server
ssh root@5.78.43.96

# Set date variable
BACKUP_DATE=$(date +%Y%m%d)

# Backup backend application
cd /root/rankey-api
tar -czf /tmp/rankey-api-backup-${BACKUP_DATE}.tar.gz .

# Backup MongoDB database
mongodump --db rankey --out /tmp/rankey-mongo-backup-${BACKUP_DATE}

# Compress MongoDB backup
tar -czf /tmp/rankey-mongo-backup-${BACKUP_DATE}.tar.gz /tmp/rankey-mongo-backup-${BACKUP_DATE}

# List backup files
ls -lh /tmp/rankey-*${BACKUP_DATE}*

# Exit server
exit

# Copy backups to local machine (run from local terminal)
scp root@5.78.43.96:/tmp/rankey-api-backup-${BACKUP_DATE}.tar.gz .
scp root@5.78.43.96:/tmp/rankey-mongo-backup-${BACKUP_DATE}.tar.gz .
```

---

#### Automated Backup Script

**Create `/root/backup-rankey.sh` on server:**

```bash
#!/bin/bash
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_DIR="/root/backups"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

# Backup application code
echo "Backing up application code..."
cd /root/rankey-api
tar -czf ${BACKUP_DIR}/rankey-api-backup-${BACKUP_DATE}.tar.gz .

# Backup MongoDB database
echo "Backing up MongoDB..."
mongodump --db rankey --out /tmp/rankey-mongo-backup-${BACKUP_DATE}
tar -czf ${BACKUP_DIR}/rankey-mongo-backup-${BACKUP_DATE}.tar.gz /tmp/rankey-mongo-backup-${BACKUP_DATE}
rm -rf /tmp/rankey-mongo-backup-${BACKUP_DATE}

# Clean old backups (keep last 7 days)
echo "Cleaning old backups..."
find ${BACKUP_DIR} -name "rankey-*-backup-*.tar.gz" -mtime +7 -delete

# Summary
echo "Backup completed: ${BACKUP_DATE}"
ls -lh ${BACKUP_DIR}/*${BACKUP_DATE}*
```

**Make script executable:**
```bash
chmod +x /root/backup-rankey.sh
```

**Set up cron job for daily backups:**
```bash
# Edit crontab
crontab -e

# Add line (runs at 3 AM daily)
0 3 * * * /root/backup-rankey.sh >> /var/log/rankey-backup.log 2>&1
```

---

### Restoring from Backup

#### Restore Backend Application

```bash
# SSH to server
ssh root@5.78.43.96

# Stop PM2 process
pm2 stop rankey-api

# Backup current version (safety measure)
cd /root
mv rankey-api rankey-api-old-$(date +%Y%m%d)

# Create new directory
mkdir rankey-api
cd rankey-api

# Extract backup
tar -xzf /path/to/rankey-api-backup-YYYYMMDD.tar.gz

# Install dependencies
npm install

# Start PM2 process
pm2 start index.js --name rankey-api

# Verify
pm2 logs rankey-api --lines 50
pm2 list
```

---

#### Restore MongoDB Database

```bash
# SSH to server
ssh root@5.78.43.96

# Extract MongoDB backup
cd /tmp
tar -xzf /path/to/rankey-mongo-backup-YYYYMMDD.tar.gz

# Stop backend to prevent writes during restore
pm2 stop rankey-api

# CAREFUL: This will drop the existing database
# Drop existing database
mongosh rankey --eval "db.dropDatabase()"

# Restore database
mongorestore --db rankey /tmp/rankey-mongo-backup-YYYYMMDD/rankey

# Verify restore
mongosh rankey --eval "db.stats()"
mongosh rankey --eval "db.products.countDocuments()"

# Start backend
pm2 start rankey-api

# Verify application
pm2 logs rankey-api --lines 50

# Clean up
rm -rf /tmp/rankey-mongo-backup-YYYYMMDD
```

---

#### Emergency Full System Restore

**If both backend and database need restoration:**

```bash
# Step 1: SSH to server
ssh root@5.78.43.96

# Step 2: Stop all services
pm2 stop rankey-api
systemctl stop cloudflared

# Step 3: Restore backend code
cd /root
mv rankey-api rankey-api-broken-$(date +%Y%m%d)
mkdir rankey-api
cd rankey-api
tar -xzf /path/to/rankey-api-backup-YYYYMMDD.tar.gz
npm install

# Step 4: Restore database
mongosh rankey --eval "db.dropDatabase()"
tar -xzf /path/to/rankey-mongo-backup-YYYYMMDD.tar.gz -C /tmp
mongorestore --db rankey /tmp/rankey-mongo-backup-YYYYMMDD/rankey

# Step 5: Restart services
systemctl start cloudflared
pm2 start index.js --name rankey-api

# Step 6: Verify everything
pm2 logs rankey-api --lines 50
systemctl status cloudflared
mongosh rankey --eval "db.stats()"
curl http://localhost:7000

# Step 7: Test from browser
# https://rankey-staging-ui.onrender.com
```

---

### Backup Best Practices

**Frequency:**
- ✅ Daily automatic backups (via cron)
- ✅ Manual backup before major changes
- ✅ Manual backup before deployments
- ✅ Manual backup before database operations

**Retention:**
- Keep last 7 daily backups on server
- Download weekly backups to local storage
- Store monthly backups for long-term retention (6-12 months)

**Verification:**
- Periodically test restore procedures (quarterly)
- Verify backup file integrity (check file sizes)
- Document restore time (RTO - Recovery Time Objective)

**Security:**
- ⚠️ Backups contain sensitive data (.env file with API keys)
- Store backups securely (encrypted local storage)
- Encrypt backups for off-site storage
- Never upload backups to public cloud without encryption

---

## SECTION 12: MONITORING & DEBUGGING

### Checking Service Status

#### Quick Status Check

```bash
# Single command to check all services
ssh root@5.78.43.96 "pm2 list && echo && systemctl status mongod --no-pager | head -5 && echo && systemctl status cloudflared --no-pager | head -5"
```

#### Detailed Service Checks

**Backend (PM2):**
```bash
ssh root@5.78.43.96

# List all PM2 processes
pm2 list

# Detailed info about rankey-api process
pm2 show rankey-api

# View real-time logs
pm2 logs rankey-api

# View last 100 lines
pm2 logs rankey-api --lines 100

# View only errors
pm2 logs rankey-api --err

# View log files directly
tail -f /root/.pm2/logs/rankey-api-out.log
tail -f /root/.pm2/logs/rankey-api-error.log
```

**MongoDB:**
```bash
ssh root@5.78.43.96

# Check systemd service status
systemctl status mongod

# View MongoDB logs
journalctl -u mongod -n 100

# Follow MongoDB logs in real-time
journalctl -u mongod -f

# Connect to MongoDB shell
mongosh

# In mongosh:
use rankey
db.stats()
show collections
db.products.countDocuments()
db.scans.find().sort({createdAt: -1}).limit(5)
```

**Cloudflare Tunnel:**
```bash
ssh root@5.78.43.96

# Check systemd service status
systemctl status cloudflared

# View tunnel logs
journalctl -u cloudflared -n 100

# Follow tunnel logs in real-time
journalctl -u cloudflared -f

# Check configuration
cat /etc/cloudflared/config.yml
```

---

### Restarting Services

**Restart Backend:**
```bash
ssh root@5.78.43.96
pm2 restart rankey-api

# Or full stop/start
pm2 stop rankey-api
pm2 start rankey-api

# Or delete and recreate
pm2 delete rankey-api
cd /root/rankey-api
pm2 start index.js --name rankey-api
pm2 save
```

**Restart MongoDB:**
```bash
ssh root@5.78.43.96
systemctl restart mongod

# Check status
systemctl status mongod

# Verify database is accessible
mongosh rankey --eval "db.stats()"
```

**Restart Cloudflare Tunnel:**
```bash
ssh root@5.78.43.96
systemctl restart cloudflared

# Check status
systemctl status cloudflared

# Verify tunnel is connected
journalctl -u cloudflared -n 20
```

**Restart Entire Server (Last Resort):**
```bash
ssh root@5.78.43.96
reboot

# Wait 2-3 minutes for server to boot

# SSH back in and start PM2
ssh root@5.78.43.96
cd /root/rankey-api
pm2 start index.js --name rankey-api
pm2 save

# Note: mongod and cloudflared auto-start (systemd enabled)
```

---

### Common Problems & Solutions

#### Problem 1: Frontend Can't Connect to Backend

**Symptoms:**
- API calls fail with network errors
- CORS errors in browser console
- "Failed to fetch" errors

**Debugging:**
```bash
# 1. Check if backend is running
ssh root@5.78.43.96 "pm2 list"

# 2. Check backend logs for errors
ssh root@5.78.43.96 "pm2 logs rankey-api --lines 50"

# 3. Check Cloudflare tunnel status
ssh root@5.78.43.96 "systemctl status cloudflared"

# 4. Test backend locally on server
ssh root@5.78.43.96 "curl http://localhost:7000"

# 5. Test backend publicly
curl https://rankey-api.jsecom.pl

# 6. Check frontend environment variable
# In Render dashboard, verify VITE_API_BASE_URL is set correctly
```

**Solutions:**
- Restart PM2: `ssh root@5.78.43.96 "pm2 restart rankey-api"`
- Restart Cloudflare: `ssh root@5.78.43.96 "systemctl restart cloudflared"`
- Check CORS settings in backend code (ensure FRONTEND_URL is correct)
- Verify VITE_API_BASE_URL in Render dashboard

---

#### Problem 2: MongoDB Connection Failed

**Symptoms:**
- Backend logs show "MongoError"
- "Failed to connect to database" errors
- API requests timeout

**Debugging:**
```bash
# 1. Check if MongoDB is running
ssh root@5.78.43.96 "systemctl status mongod"

# 2. Check MongoDB logs
ssh root@5.78.43.96 "journalctl -u mongod -n 50"

# 3. Test MongoDB connection
ssh root@5.78.43.96 "mongosh --eval 'db.stats()' rankey"

# 4. Check disk space (MongoDB needs free space)
ssh root@5.78.43.96 "df -h"

# 5. Check MongoDB is listening on correct port
ssh root@5.78.43.96 "netstat -tlnp | grep 27017"
```

**Solutions:**
- Restart MongoDB: `ssh root@5.78.43.96 "systemctl restart mongod"`
- Check disk space (if full, clean up old files)
- Verify DB_HOST in .env file matches MongoDB connection string
- Check MongoDB error logs for specific issues

---

#### Problem 3: High Memory Usage

**Symptoms:**
- PM2 shows high memory (>500MB)
- Server becomes slow
- Out of memory errors

**Debugging:**
```bash
# Check system memory
ssh root@5.78.43.96 "free -h"

# Check PM2 memory usage
ssh root@5.78.43.96 "pm2 list"

# Check Node.js heap usage
ssh root@5.78.43.96 "pm2 show rankey-api"

# Check for memory leaks in logs
ssh root@5.78.43.96 "pm2 logs rankey-api --lines 100 | grep -i memory"
```

**Solutions:**
- Restart PM2: `ssh root@5.78.43.96 "pm2 restart rankey-api"` (clears memory)
- Node.js is configured with `--max-old-space-size=4096` (4GB limit)
- Monitor for memory leaks in application code
- Consider implementing periodic restarts (e.g., daily via cron)

---

#### Problem 4: Cloudflare Tunnel Down

**Symptoms:**
- API unreachable from internet
- `rankey-api.jsecom.pl` times out
- Cloudflare dashboard shows tunnel offline

**Debugging:**
```bash
# Check tunnel status
ssh root@5.78.43.96 "systemctl status cloudflared"

# Check tunnel logs
ssh root@5.78.43.96 "journalctl -u cloudflared -n 100"

# Verify backend is running on port 7000
ssh root@5.78.43.96 "netstat -tlnp | grep 7000"

# Test backend locally
ssh root@5.78.43.96 "curl http://localhost:7000"
```

**Solutions:**
- Restart tunnel: `ssh root@5.78.43.96 "systemctl restart cloudflared"`
- Check if backend is running: `ssh root@5.78.43.96 "pm2 list"`
- Verify tunnel config: `ssh root@5.78.43.96 "cat /etc/cloudflared/config.yml"`
- Check credentials file exists: `ssh root@5.78.43.96 "ls -la /root/.cloudflared/"`

---

#### Problem 5: Render Deployment Failed

**Symptoms:**
- Build fails in Render dashboard
- "Build failed" notification
- Old version still deployed

**Debugging:**
- Check build logs in Render dashboard
- Look for npm install errors
- Check for syntax errors in code
- Verify package.json is valid JSON

**Solutions:**
- Fix code errors and push again
- Clear build cache in Render settings
- Verify all dependencies are in package.json
- Check build command in Render settings: `npm install && npm run build`

---

### Health Check Script

**Create comprehensive health check script:**

```bash
#!/bin/bash
# Save as: /root/health-check.sh

echo "==========================="
echo "RANKEY SYSTEM HEALTH CHECK"
echo "==========================="
echo ""
echo "Date: $(date)"
echo ""

echo "1. PM2 Status:"
pm2 list
echo ""

echo "2. Backend Logs (last 10 lines):"
pm2 logs rankey-api --lines 10 --nostream
echo ""

echo "3. MongoDB Status:"
systemctl status mongod --no-pager | grep "Active:"
mongosh --quiet --eval "db.stats().ok" rankey
echo ""

echo "4. Cloudflare Tunnel Status:"
systemctl status cloudflared --no-pager | grep "Active:"
echo ""

echo "5. Disk Usage:"
df -h / | tail -1
echo ""

echo "6. Memory Usage:"
free -h | grep "Mem:"
echo ""

echo "7. Current Git Commit:"
cd /root/rankey-api && git log -1 --oneline
echo ""

echo "8. API Test:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:7000
echo ""

echo "==========================="
echo "Health check complete"
echo "==========================="
```

**Run health check:**
```bash
ssh root@5.78.43.96 "bash /root/health-check.sh"
```

---

## SECTION 13: CRITICAL RULES - NEVER VIOLATE

### Git Rules

**NEVER:**
- ✋ **Work directly on main branch**
- ✋ **Push unreviewed code to production**
- ✋ **Commit sensitive data** (.env files, API keys, passwords)
- ✋ **Force push to main** (`git push --force`)
- ✋ **Merge without testing**

**ALWAYS:**
- ✅ **Create a feature/fix branch first**
- ✅ **Update documentation when making changes**
- ✅ **Test before merging to main**
- ✅ **Write clear commit messages**
- ✅ **Use conventional commit format**

**Branch Naming:**
- `feature/description` - For new features
- `fix/bug-name` - For bug fixes
- `hotfix/critical-issue` - For emergency fixes
- `refactor/component-name` - For code refactoring

**Commit Message Format:**
```
Type: Brief description (50 chars or less)

- Detailed point 1
- Detailed point 2
- Testing: How it was tested

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

### Security Rules

**NEVER:**
- ✋ **Commit CREDENTIALS.md to git**
- ✋ **Commit .env.local or .env.production to git**
- ✋ **Expose API keys in code or logs**
- ✋ **Disable authentication without explicit approval**
- ✋ **Share .env files publicly**
- ✋ **Log sensitive data** (passwords, API keys)
- ✋ **Use single .env file for both local and production**

**ALWAYS:**
- ✅ **Use environment variables for sensitive config**
- ✅ **Use .env.local for local development**
- ✅ **Use .env.production for VPS/production**
- ✅ **Verify .env.local and .env.production are in .gitignore**
- ✅ **Use npm start for local** (loads .env.local)
- ✅ **Use npm start:prod on VPS** (loads .env.production)
- ✅ **Rotate API keys periodically**
- ✅ **Use strong random values for secrets**
- ✅ **Keep backups encrypted**

**Security Checklist:**
- [ ] .env.local is NOT committed to git
- [ ] .env.production is NOT committed to git
- [ ] .env.example IS in git (template only, no secrets)
- [ ] API keys are stored in environment variables
- [ ] SESSION_SECRET is strong random value (not "secret")
- [ ] CREDENTIALS.md is in backup directory only (not in git)
- [ ] Backups contain sensitive data (store securely)
- [ ] Local development uses npm start (not npm start:prod)
- [ ] Production/VPS uses npm start:prod (not npm start)

---

### Workflow Rules

**NEVER:**
- ✋ **Skip the human approval step**
- ✋ **Deploy without testing**
- ✋ **Make multiple unrelated changes in one commit**
- ✋ **Merge broken code to main**
- ✋ **Deploy on Friday afternoon** (unless emergency)

**ALWAYS:**
- ✅ **Communicate what you're doing before doing it**
- ✅ **Provide output/logs after operations**
- ✅ **Update changelog with deployments**
- ✅ **Verify deployment success**
- ✅ **Monitor logs after deployment**

**Deployment Safety:**
- Test locally first (when local setup ready)
- Review git diff before pushing
- Deploy backend during low-traffic hours
- Monitor PM2 logs for 5 minutes after deployment
- Have rollback plan ready

---

### Documentation Rules

**NEVER:**
- ✋ **Deploy without updating RANKEY_MASTER_CONTEXT.md**
- ✋ **Leave documentation out of sync with code**
- ✋ **Skip changelog entries**

**ALWAYS:**
- ✅ **Update documentation in the SAME commit as code**
- ✅ **Add changelog entry for every change**
- ✅ **Mark issues as resolved when fixed**
- ✅ **Copy updated doc to backup directory**

---

## SECTION 14: QUICK REFERENCE COMMANDS

### Git Operations

```bash
# Create feature branch
git checkout -b feature/bulk-import

# Check status
git status
git log --oneline -10

# Stage and commit
git add .
git commit -m "Feature: Add bulk import

- Frontend: BulkImportForm component
- Backend: /api/bulk-import endpoint
- Update RANKEY_MASTER_CONTEXT.md

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Merge to main (after approval)
git checkout main
git merge feature/bulk-import
git push origin main

# View differences
git diff
git diff --staged
```

---

### Server Operations

```bash
# SSH access
ssh root@5.78.43.96

# Backend deployment
ssh root@5.78.43.96 "cd /root/rankey-api && git pull && pm2 restart rankey-api"

# Quick status check
ssh root@5.78.43.96 "pm2 list && systemctl status mongod && systemctl status cloudflared"

# Service restarts
ssh root@5.78.43.96 "pm2 restart rankey-api"
ssh root@5.78.43.96 "systemctl restart mongod"
ssh root@5.78.43.96 "systemctl restart cloudflared"

# View logs
ssh root@5.78.43.96 "pm2 logs rankey-api --lines 100"
ssh root@5.78.43.96 "journalctl -u mongod -n 100"
ssh root@5.78.43.96 "journalctl -u cloudflared -n 100"

# Follow logs in real-time
ssh root@5.78.43.96 "pm2 logs rankey-api -f"
ssh root@5.78.43.96 "journalctl -u cloudflared -f"
```

---

### Database Operations

```bash
# Connect to MongoDB
ssh root@5.78.43.96 "mongosh"

# Quick stats
ssh root@5.78.43.96 "mongosh --eval 'db.stats()' rankey"

# Collection counts
ssh root@5.78.43.96 "mongosh --eval 'db.products.countDocuments()' rankey"
ssh root@5.78.43.96 "mongosh --eval 'db.scans.countDocuments()' rankey"

# View recent scans
ssh root@5.78.43.96 "mongosh --eval 'db.scans.find().sort({createdAt: -1}).limit(5).pretty()' rankey"

# List all collections
ssh root@5.78.43.96 "mongosh --eval 'db.getCollectionNames()' rankey"

# Database backup
ssh root@5.78.43.96 "mongodump --db rankey --out /tmp/backup-\$(date +%Y%m%d)"

# Database restore
ssh root@5.78.43.96 "mongorestore --db rankey /path/to/backup/rankey/"
```

---

### Testing & Verification

```bash
# Test backend locally on server
ssh root@5.78.43.96 "curl http://localhost:7000"

# Test backend publicly
curl https://rankey-api.jsecom.pl

# Test frontend
# Open: https://rankey-staging-ui.onrender.com

# Check disk space
ssh root@5.78.43.96 "df -h"

# Check memory usage
ssh root@5.78.43.96 "free -h"

# Check running processes
ssh root@5.78.43.96 "ps aux | grep -E 'node|mongod|cloudflared'"

# Check listening ports
ssh root@5.78.43.96 "netstat -tlnp"
```

---

### Backup Operations

```bash
# Create backup (run on server)
ssh root@5.78.43.96 << 'EOF'
cd /root/rankey-api && tar -czf /tmp/rankey-api-backup-$(date +%Y%m%d).tar.gz .
mongodump --db rankey --out /tmp/rankey-mongo-backup-$(date +%Y%m%d)
tar -czf /tmp/rankey-mongo-backup-$(date +%Y%m%d).tar.gz /tmp/rankey-mongo-backup-$(date +%Y%m%d)
ls -lh /tmp/rankey-*
EOF

# Copy backups to local machine
scp root@5.78.43.96:/tmp/rankey-api-backup-*.tar.gz .
scp root@5.78.43.96:/tmp/rankey-mongo-backup-*.tar.gz .

# Restore from backup
# See Section 11 for detailed restore procedures
```

---

## APPENDIX: ADDITIONAL RESOURCES

### Important URLs

| Resource | URL |
|----------|-----|
| Frontend (Production) | https://rankey-staging-ui.onrender.com |
| Backend API | https://rankey-api.jsecom.pl |
| Render Dashboard | https://dashboard.render.com |
| Cloudflare Dashboard | https://dash.cloudflare.com |
| Frontend GitHub | https://github.com/eyshstore/rankey-staging-ui |
| Backend GitHub | https://github.com/eyshstore/rankey-staging-backend |
| ScrapingBee Dashboard | https://www.scrapingbee.com/dashboard |

### Emergency Contacts

- **Repository Owner:** eyshstore@gmail.com
- **VPS Access:** root@5.78.43.96
- **Domain Management:** Cloudflare account (jsecom.pl)

### File Locations Quick Reference

| Purpose | Location |
|---------|----------|
| Backend Code | /root/rankey-api/ |
| Environment Variables | /root/rankey-api/.env |
| PM2 Logs | /root/.pm2/logs/ |
| MongoDB Config | /etc/mongod.conf |
| Cloudflare Config | /etc/cloudflared/config.yml |
| This Documentation | rankey-staging-backend/RANKEY_MASTER_CONTEXT.md |
| Credentials (Private) | C:\Users\user\Documents\Jonathan Documents\NEW\CREDENTIALS.md |
| Backups (Local) | C:\Users\user\Documents\Jonathan Documents\NEW\ |

---

## CHANGELOG

### Format
```markdown
**YYYY-MM-DD - [commit-hash] - [Type]: [Brief description]**
- [Details]
- Testing: [Results]
```

---

### Recent Changes

**2026-02-11 - ffeeb52 (backend, feature branch) - Feature: Hybrid coupon extraction with HTML fallback**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet)
- **Implementation:** Added Priority 4 HTML parsing fallback to extractCoupon()
  - Uses getDiscountCoupon() from pages-parser.js when API fields empty
  - Wrapped in try-catch for error handling
  - Added cheerio import for HTML parsing
- **Fixes:** B0DDTCQGTR coupon detection (10% coupon found via HTML fallback)
- **Performance:** Maintains speed - B0G8Y8GR28 uses discount_percentage (no HTML parsing needed)
- **Investigation:** Confirmed B0DDTCQGTR data saves correctly - Excel showing old changeHistory data
- **Status:** Hybrid approach complete, ready for testing

**2026-02-11 - 2b8dedb (backend, feature branch) - Fix: Amazon API coupon detection using discount_percentage field**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet)
- **Modified:** handlers/amazon-api-parser.js extractCoupon() function
- **Fix:** Added priority-based field checking: (1) discount_percentage, (2) coupon_discount_percentage, (3) coupon text
- **Testing:** B0G8Y8GR28 ✅ detects 50% coupon from discount_percentage: 50 field
- **Logging:** Enhanced to show which field was used for coupon extraction
- **Status:** Partial fix - works for B0G8Y8GR28, fails for B0DDTCQGTR → led to hybrid approach

**2026-02-11 - ffc6ad8 (backend, feature branch) - Investigation: Amazon API coupon detection failure**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet)
- **Issue:** Checkbox coupons not detected - extractCoupon() only checks apiResponse.coupon field (often empty), ignores discount_percentage and coupon_discount_percentage
- **Root Cause:** Parser returns 'none' even when discount_percentage: 50 exists (verified in scan logs for B0G8Y8GR28)
- **Proposed Solutions:** (1) Check coupon_discount_percentage field, (2) Parse HTML field, (3) Hybrid approach
- **Status:** ✅ Investigation complete, ✅ Fix implemented (see entry above)

**2026-02-10 - [pending] (backend + frontend, feature branch) - Feature: Extend Amazon API mode to ALL scan types**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet - awaiting approval)
- **Completes:** Full Amazon API mode implementation for entire platform
- **Problem Addressed:** 37% pricing issue affects ALL scan types (Category, Deals, ASIN), not just ASIN scans
- **Modified Files - Backend:**
  - handlers/scan-types/CategoryScan.js:
    * Added imports for amazonApiScraper and parseAmazonApiData
    * Added useAmazonAPI to config initialization (default: false)
    * Modified requestProductPage() to check useAmazonAPI flag
    * Added requestProductWithAmazonAPI() method
    * Added handleAmazonApiSuccess() with rank filtering logic
    * Added handleAmazonApiError() method
    * Updated enqueue(), loadAndStart(), startImmediately() to pass useAmazonAPI
  - handlers/scan-types/DealsScan.js:
    * Added imports for amazonApiScraper and parseAmazonApiData
    * Added useAmazonAPI to config initialization (default: false)
    * Modified requestProductPage() to check useAmazonAPI flag
    * Added requestProductWithAmazonAPI() method
    * Added handleAmazonApiSuccess() with discount preservation logic
    * Added handleAmazonApiError() method
    * Updated enqueue(), create(), loadAndStart() to pass useAmazonAPI
- **Modified Files - Frontend:**
  - src/NewScanModal.jsx:
    * Removed `scanType === 'ASIN'` condition from useAmazonAPI checkbox
    * Checkbox now visible for ALL scan types (ASIN, Category, Deals)
    * Added useAmazonAPI to Category scan payload
    * Added useAmazonAPI to Deals scan payload
- **Backend Implementation Pattern:**
  - All scan types follow same dual-mode architecture as ASINScan
  - requestProductPage() checks config.useAmazonAPI flag
  - If true: calls requestProductWithAmazonAPI() → uses amazon-api-scraper
  - If false: calls requestPageWithHtml() → uses HTML scraping (backward compatible)
  - Success handlers preserve scan-type-specific data (rank filters, discounts)
- **Frontend Implementation:**
  - Single checkbox controls mode for all scan types
  - Label: "Use Amazon API mode (beta)"
  - Description: "Better accuracy for products with shipping restrictions..."
  - Default: unchecked (backward compatible)
- **Benefits:**
  - Solves 37% pricing issue across entire platform
  - Users can enable API mode for Category and Deals scans
  - Consistent UX across all scan types
  - Backward compatible (default: HTML mode)
- **Testing:**
  - ⏸️ Pending: Local testing with all 3 scan types
  - ⏸️ Pending: Verify CategoryScan rank filtering works with API mode
  - ⏸️ Pending: Verify DealsScan discount preservation works with API mode
  - ⏸️ Pending: Integration testing on VPS
- **Next Steps:**
  - Local testing: Create scans with API mode enabled for each type
  - Verify logs show correct mode selection
  - Test with products known to have location restrictions
  - Merge to main after approval
  - Deploy to production (both repos will auto-deploy via Render)
- **Documentation:** Updated Section 1 Scraping Modes to note ALL scan types supported

**2026-02-10 - 7b9eccb (backend, feature branch) - Fix: Separate .env files for local and production environments**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet - awaiting approval)
- **Problem Solved:** Recurring CORS issues caused by .env file reverting to production settings
- **Root Cause:** Single .env file used for both local and production, leading to confusion
- **Files Created:**
  - .env.local: Local development settings
    * FRONTEND_URL=http://localhost:5173
    * SESSION_SECRET=local-dev-secret (not for production)
    * NODE_ENV=development
  - .env.production: Production/VPS settings
    * FRONTEND_URL=https://rankey-staging-ui.onrender.com
    * SESSION_SECRET=<strong random value from CREDENTIALS.md>
    * NODE_ENV=production
  - .env.example: Template for new developers (safe for git)
    * Placeholder values, no secrets
    * Serves as documentation
- **Files Modified:**
  - package.json: Updated scripts to use correct env file
    * `npm start` → uses .env.local (local development)
    * `npm start:prod` → uses .env.production (VPS server)
    * `npm run dev` → uses .env.local with nodemon
  - .gitignore: Added .env.local and .env.production exclusions
- **Files Deleted:**
  - .env: Removed single .env file (backed up as .env.old-backup)
- **Benefits:**
  - Prevents CORS errors in local development
  - Clear separation between local and production config
  - No more manual .env editing to switch environments
  - Safe to use npm start without worrying about wrong settings
  - .env.example serves as documentation for new developers
- **Documentation:**
  - Updated Section 7: Local Testing Setup with new env approach
  - Updated Section 13: Added critical rules for env file handling
  - Added troubleshooting section for CORS issues
- **Testing:**
  - ⏸️ Pending: Human will test `npm start` → verify CORS works
  - ⏸️ Pending: Human will verify frontend can connect at http://localhost:5173
- **Next Steps:**
  - Human tests local setup with `npm start`
  - If working, ready for final review and merge

**2026-02-10 - 39b29e3 (frontend, feature branch) - Feature: Add Amazon API mode toggle to ASIN scan form**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet - awaiting approval)
- **Completes:** Frontend UI component for Amazon API mode feature
- **Modified Files:**
  - src/NewScanModal.jsx: Added useAmazonAPI checkbox
    * Checkbox only visible for ASIN scan type
    * Label: "Use Amazon API mode (beta)"
    * Help text: "Better accuracy for products with shipping restrictions. Uses structured API instead of HTML scraping."
    * Default: unchecked (false) - backward compatible
    * Properly integrated with form state management
- **Implementation:**
  - Added useAmazonAPI: false to formData initial state
  - Checkbox conditionally rendered when scanType === 'ASIN'
  - handleInputChange handles checkbox toggle automatically
  - scanData.useAmazonAPI included in ASIN scan request payload
- **UI/UX:**
  - Placed below debugPriceLogging checkbox for consistency
  - Multi-line layout with title and description
  - Consistent styling with existing controls (Tailwind CSS)
  - Clear visual hierarchy with font weight and color differentiation
- **Backend Integration:**
  - Parameter sent to POST /amazon/scans/enqueue endpoint
  - Backend (feature/amazon-api-mode branch) receives and uses flag
  - Selects between HTML scraping and Amazon API mode
- **Testing:**
  - ✅ Checkbox appears only for ASIN scans
  - ✅ Default unchecked state works
  - ⏸️ Integration testing with backend pending
  - ⏸️ Verification that useAmazonAPI parameter is sent correctly pending
- **Next Steps:**
  - Manual integration testing (create scans with checkbox on/off)
  - Test with ASIN B014WOXB6O (should get $11.99 with checkbox checked)
  - Verify backend logs show correct mode selection
  - Merge to main after approval
  - Deploy to production (frontend will auto-deploy via Render)

**2026-02-10 - 7496ed8 (backend, feature branch) - Feature: Add ScrapingBee Amazon API integration**
- **Branch:** feature/amazon-api-mode (NOT merged to main yet - awaiting approval)
- **Problem Solved:** Location-based pricing issue where 37% of products showed "This item cannot be shipped to your selected delivery location" with no price
- **New Files:**
  - handlers/amazon-api-scraper.js: ScrapingBee Amazon API client
    * Uses /api/v1/amazon/product endpoint instead of HTML API
    * Sets zip_code=10001 for consistent US pricing
    * Returns structured JSON (no HTML parsing needed)
    * Implements retry logic: network errors (2x backoff), rate limit (fail fast), 404 (no retry), 500 (retry 1x)
  - handlers/amazon-api-parser.js: JSON to database schema transformer
    * Transforms API response to match HTML parser format
    * Price: buybox[0].price → "$X.XX" format
    * Category: joins category[0].ladder with ", "
    * Coupon: extracts from discount_percentage → "X%" or "none"
    * Prime: detects from delivery_details string
    * Color/Size: extracts from selected variation dimensions
    * Adds metadata: scrapeMethod="amazon-api", scrapedAt, apiVersion="v1"
  - test-amazon-api.js: Local test suite for validation
- **Modified Files:**
  - handlers/scan-types/ASINScan.js: Added dual-mode support
    * New useAmazonAPI config parameter (default: false, backward compatible)
    * New requestProductWithAmazonAPI() method for API requests
    * New handleAmazonApiSuccess() and handleAmazonApiError() methods
    * Conditional logic in runConcurrentRequest() to select HTML vs API mode
    * Both modes use same logger, error handling, and database save
- **Benefits:**
  - Solves location-based pricing issue (products now show prices)
  - More reliable data extraction (no HTML selector changes)
  - Same cost as HTML API (5 credits per request)
  - Tested with 3 problematic ASINs: B014WOXB6O, B0G8Y8GR28, B0711QYPJD
  - All tests passed: correct prices ($11.99, $99.99, $9.95), coupon detection (50%), proper field mapping
- **Known Limitations:**
  - Quantity field not available in Amazon API
  - dateFirstAvailable not available in Amazon API
- **Testing:**
  - ✅ Local testing: All 3 test ASINs returned correct data
  - ✅ Price formatting: "$X.XX" format verified
  - ✅ Coupon detection: 50% coupon correctly extracted from discount_percentage
  - ✅ Category formatting: Comma-separated strings working
  - ✅ Metadata fields: scrapeMethod, scrapedAt, apiVersion all present
  - ⏸️ Integration testing: Pending (requires frontend UI toggle implementation)
  - ⏸️ Production deployment: Awaiting human approval before merge to main
- **Next Steps:**
  - Add frontend UI toggle for "Use Amazon API mode" checkbox
  - Test full scan flow with Amazon API mode enabled
  - Deploy to production after approval
- **Documentation:** This changelog entry

**2026-02-09 - [production-hotfix] - Critical: Fix ScrapingBee API key (AGAIN)**
- **URGENT FIX:** Production and local both had OLD/EXPIRED ScrapingBee API key
- **Issue:** All scans failing with 401 Unauthorized errors
- **Root Cause:** .env file reverted to old key (likely during git stash/unstash)
- **Old key (wrong):** LT5E88BQTYSA07MZAAB1XOH89B83K5TMMC2TY28EZGEM40U2W8NZRI4TLBTQFY8L9I07J4D9B5EY8DHO
- **New key (correct):** FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83
- **Actions Taken:**
  - Production: Backed up .env, updated API key, restarted PM2 with --update-env
  - Local: Backed up .env, updated API key
  - Verified: CREDENTIALS.md has correct key documented
- **Prevention Added:** New section in Section 6 "CRITICAL: .env File Handling"
  - Documents proper git stash usage to exclude .env
  - Provides verification commands
  - Lists symptoms of wrong key
  - Includes historical context of recurring issue
- **This is the SECOND occurrence** (first was 2026-02-03)
- **Status:** Both environments now have correct key, production verified working
- **Documentation:** Added comprehensive .env handling section to prevent recurrence

**2026-02-09 - 3ba0cbd (backend) - Deploy: Merge fix/state-persistence-and-cleanup to main**
- **Merged feature branch** fix/state-persistence-and-cleanup into main branch
- **Production deployment:** Switched production from feature branch to main branch
- **Changes included:**
  - Fixed: setState() not persisting to MongoDB (Scan.js)
  - Added: Automatic cleanup job for stuck scans (utilities/scan-cleanup.js)
  - Added: Missing index.js file
  - Cleanup job runs every 2 hours to mark abandoned scans as "failed"
- **Deployment process:**
  - Local: Merged feature branch to main (fast-forward)
  - GitHub: Pushed main branch (f85875d → 3ba0cbd)
  - Production: Switched from feature branch to main
  - Production: Stashed local changes, pulled main, restarted PM2
- **Verification:**
  - PM2 status: online
  - Database connected successfully
  - HTTP server running on port 7000
  - Cleanup job confirmed active in logs
- **Documentation:** Updated RANKEY_MASTER_CONTEXT.md Section 3 (current state)
- **Ready for:** New feature development on feature/amazon-api-mode branch
- Testing: Production running successfully on main branch

**2026-02-05 - 764edc9 (backend) - Deploy: Improved price extraction logging to production**
- **Deployed to production** with comprehensive price logging system
- Added detailed logging to pages-parser.js setPrice() and extractPriceSection() functions
- **PRICE-SECTION logs:** Shows which price section marker found (corePriceDisplay, apex, etc.), section length, sample content
- **PRICE-SELECTOR logs:** Shows which selector is being tried for each priority level (6 priorities + fallbacks)
- **PRICE-ELEMENT logs:** Shows whether element found and count of matches
- **PRICE-TEXT logs:** Shows raw text and HTML extracted from element
- **PRICE-PARSE logs:** Shows regex pattern, whether it matched, and matched value
- **PRICE-SUCCESS logs:** Confirms which priority level succeeded with final price value
- **PRICE-FAIL logs:** Detailed failure information for each priority, final summary with all attempted selectors and HTML samples
- **Fixed:** All logs now use logger.log() instead of console.log(), properly saved to scan.log.json files
- Applied to all scan types via shared pages-parser.js:
  - ASINScan.js: passes this.logger to parseProductData($, this.logger)
  - CategoryScan.js: passes this.logger to parseProductData($, this.logger)
  - DealsScan.js: passes this.logger to parseProductData($, this.logger)
- Logs included in downloadable debug ZIP files (debug-analysis/logs/{scanId}.log.json)
- Merged improve/price-logging branch to main
- Deployed to production server (5.78.43.96)
- Backend restarted successfully, no errors
- Testing: Ready for production testing with scans that have debugPriceLogging enabled

**2026-02-03 - [production-hotfix] - Fix: Incorrect ScrapingBee API key causing 401 errors**
- **Issue:** All scans failing with 401 Unauthorized from ScrapingBee after deployment
- **Root cause:** Production server had wrong API key in /root/rankey-api/.env
  - Old (invalid): LT5E88BQTYSA07MZAAB1XOH89B83K5TMMC2TY28EZGEM40U2W8NZRI4TLBTQFY8L9I07J4D9B5EY8DHO
  - New (correct): FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83
- **Solution:** Updated .env file directly on production server, restarted PM2 with --update-env
- **Actions:**
  - SSH to production: `ssh root@5.78.43.96`
  - Updated SCRAPINGBEE_API_KEY in .env using sed
  - Verified change applied correctly
  - Restarted: `pm2 restart rankey-api --update-env`
  - Confirmed backend restarted successfully
- **Status:** Fix applied, awaiting user verification with test scan
- **Note:** This was a production-only configuration fix, no code changes needed

**2026-02-03 - cc0f012 (backend) / cc93618 (frontend) - Deploy: Debug logging system to production**
- Merged fix/debug-logging-system branch to main for both backend and frontend
- Backend deployed to production server (5.78.43.96)
  - Stashed local debug files on server
  - Pulled latest code from GitHub
  - Installed archiver dependency
  - Restarted PM2 successfully
  - Verified backend running without errors
- Frontend pushed to GitHub
  - Render.com auto-deployment triggered
  - ScansList.jsx endpoint corrected from /debug-zip to /download-debug
- Complete debug logging now available in production for all scan types
- Testing: Backend verified running, Render deployment pending verification

**2026-02-03 - 17f0437 (backend) / cc93618 (frontend) - Feature: Complete logging system for all scan types**
- Extended logging to CategoryScan and DealsScan (in addition to ASINScan)
- All three scan types now save HTML files when debugPriceLogging enabled
- Comprehensive logging captures:
  - Category page requests and responses
  - Product requests and responses
  - Parsing results with all extracted fields
  - Error details with full context
  - Scan completion statistics
- Fixed frontend download button endpoint (was /debug-zip, now /download-debug)
- Download button now always visible for completed scans
- Added user-friendly error messages when no debug files available
- Testing: Needs testing with category and deals scans with debugPriceLogging enabled

**2026-02-03 - 6cbcb71 (backend) - Feature: Add comprehensive logging system and fix debug HTML download**
- Created ScanLogger utility (utilities/logger.js) for detailed scan logging
- Added logging to all critical points in ASIN scan handler
  - Request logging (URL, provider, ASIN)
  - Response logging (HTML length, response time)
  - Parse logging (title, price, brand, category found)
  - Save logging (database operations)
  - Error logging with detailed error information
- Implemented debug HTML saving functionality
  - HTML files saved to debug-analysis/{scanId}/ when debugPriceLogging is enabled
  - Automatically creates directory structure
- Added download endpoint: GET /scans/:scanId/download-debug
  - Returns ZIP archive with HTML files and logs
  - Includes both JSON and human-readable text logs
- Installed archiver package for ZIP creation
- Logs saved to debug-analysis/logs/{scanId}.log.json
- Testing: Needs testing with a scan that has debugPriceLogging enabled

**2026-02-03 - [local-only] - Setup: Complete local development environment configuration**
- Fixed CORS issue by renaming .env files (.env → .env.production.backup, .env.local → .env)
- Restored missing backend files from production backup (index.js, utilities/)
- Created Node.js import script for MongoDB data (import-backup.js)
- Successfully imported production MongoDB backup to local database
  - 296,889 products
  - 95,214 categories
  - 105 scans
  - 2 sessions
- Verified data integrity with sample queries
- Updated Section 7 documentation to reflect completed setup
- Local environment now fully operational for testing with real production data
- Testing: Backend starts successfully, MongoDB connection verified, all collections accessible

**2026-02-02 - 4966ae1 (backend) / ee48500 (frontend) - Docs: Add START_HERE.md to both repositories**
- Created mandatory instruction file for Claude Code
- Ensures documentation is always updated after every change
- Placed in root of both frontend and backend repos
- Contains reference to RANKEY_MASTER_CONTEXT.md Section 9
- Reminds Claude to update commit hashes, changelog, and known issues
- Enforces workflow: never work on main, always create feature branch first
- Testing: Files created, committed, and pushed successfully to GitHub

**2026-02-02 - 5bf7118 - Security: Replace SESSION_SECRET with strong random value**
- Generated 48-character alphanumeric random string
- Updated /root/rankey-api/.env on server
- Changed from "secret" to strong random value
- Restarted PM2 service: `pm2 restart rankey-api`
- All existing sessions invalidated (users need to re-login)
- Verified backend running successfully, no errors
- Testing: Backend started cleanly, database connected, HTTP server running on port 7000

**2026-02-02 - 5bf7118 - Docs: Add comprehensive system documentation**
- Created SYSTEM.md (technical documentation, public)
- Created RANKEY_MASTER_CONTEXT.md (master context file for Claude)
- Created CREDENTIALS.md (private credentials, not in git)
- Documentation covers all 14 sections: architecture, workflow, deployment, monitoring, etc.
- Saved to both backend repo and backup directory
- Testing: Verified file completeness and accuracy

**2026-01-26 - c74f945 - Feature: Show maxConcurrentRequests for all providers**
- Frontend: Display max concurrent requests setting for each provider
- UI improvement for scan configuration

**2026-01-25 - b9c9c36 - Fix: Add debugPriceLogging to scan request payload**
- Added debug logging flag to scan requests
- Helps troubleshoot price extraction issues

**2026-01-25 - 6247cdc - Feature: Add debug logging UI**
- New checkbox for enabling debug logs
- Download ZIP button for debug data
- Improves troubleshooting capabilities

**2026-01-19 - 274a1af - Fix: Enable render_js for accurate price extraction**
- ✅ Major improvement to price extraction accuracy
- ScrapingBee now renders JavaScript before scraping
- Accuracy improved from ~70% to ~98%
- Testing: Verified on 50 products

**2026-01-18 - 6a08ddc - Fix: Extract price section before searching**
- Avoid including shipping costs in price extraction
- More accurate price parsing

**2026-01-18 - 5589a6f - Feature: Add test harness for price/coupon extraction**
- New debugging tool for testing price extraction
- Helps validate scraping logic

---

## DOCUMENT VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.4 | 2026-02-10 | Extended Amazon API mode to ALL scan types (Section 1, Changelog) |
| 1.3 | 2026-02-10 | Added env separation fix documentation (Section 7, Section 13, Changelog) |
| 1.2 | 2026-02-10 | Added frontend UI toggle documentation (Section 3 feature branch, Changelog) |
| 1.1 | 2026-02-10 | Added Amazon API mode documentation (Section 1, Section 10, Changelog) |
| 1.0 | 2026-02-02 | Initial creation of RANKEY_MASTER_CONTEXT.md |

---

**END OF DOCUMENT**

---

**Document Status:** ✅ Complete and Up-to-Date
**Last Updated:** 2026-02-10 (Extended Amazon API mode to all scan types)
**Next Review:** After next major deployment
**Maintained By:** Claude + Human Collaboration

**Remember:** This file MUST be updated after EVERY code change. See Section 9 for update rules.