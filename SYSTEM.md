# Rankey Staging System Documentation

**Last Updated:** 2026-02-02
**System Status:** Production
**Environment:** Staging

---

## Section 1: Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet Users                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
         │ Frontend                              │ Backend
         │ (Render.com)                          │ (Cloudflare Tunnel)
         │                                       │
         │ https://rankey-staging-ui             │ https://rankey-api.jsecom.pl
         │       .onrender.com                   │
         │                                       │
         └───────────────────┬───────────────────┘
                             │
                             │ HTTPS/443
                             │
                    ┌────────▼────────┐
                    │  Cloudflare     │
                    │  Tunnel         │
                    │  (cloudflared)  │
                    └────────┬────────┘
                             │
                             │ HTTP/7000 (localhost)
                             │
                    ┌────────▼────────┐
                    │  VPS Server     │
                    │  5.78.43.96     │
                    │                 │
                    │  ┌───────────┐  │
                    │  │ Backend   │  │
                    │  │ Node.js   │  │
                    │  │ PM2       │  │
                    │  │ Port 7000 │  │
                    │  └─────┬─────┘  │
                    │        │        │
                    │  ┌─────▼─────┐  │
                    │  │ MongoDB   │  │
                    │  │ Port      │  │
                    │  │ 27017     │  │
                    │  └───────────┘  │
                    └─────────────────┘
```

### Component Communication Flow

1. **User → Frontend (Render)**
   - Users access: `https://rankey-staging-ui.onrender.com`
   - React/Vite application served over HTTPS
   - Auto-deploys on git push to main branch

2. **Frontend → Backend (via Cloudflare Tunnel)**
   - Frontend makes API calls to: `https://rankey-api.jsecom.pl`
   - Cloudflare Tunnel proxies requests to VPS
   - Configured in: `VITE_API_BASE_URL` environment variable

3. **Cloudflare Tunnel → Backend Application**
   - Tunnel listens on: `rankey-api.jsecom.pl` (public)
   - Forwards to: `http://localhost:7000` (VPS internal)
   - Managed by systemd service: `cloudflared.service`

4. **Backend → MongoDB**
   - Backend connects to: `mongodb://localhost:27017/rankey`
   - MongoDB only accepts localhost connections (no external access)
   - Managed by systemd service: `mongod.service`

### Ports & Domains

| Component | Type | Address | Access |
|-----------|------|---------|--------|
| Frontend | Public | https://rankey-staging-ui.onrender.com | Internet |
| Backend API | Public | https://rankey-api.jsecom.pl | Internet (via Cloudflare) |
| Backend App | Private | http://localhost:7000 | VPS only |
| MongoDB | Private | mongodb://localhost:27017 | VPS only |
| SSH | Semi-Private | root@5.78.43.96:22 | Authorized keys |

---

## Section 2: Infrastructure Details

### Frontend (Render.com)

- **Platform:** Render.com Web Service
- **Service Name:** rankey-staging-ui
- **Repository:** https://github.com/eyshstore/rankey-staging-ui
- **Branch:** main
- **Auto-Deploy:** Enabled (deploys on every push to main)
- **Build Command:** `npm install && npm run build`
- **Start Command:** Serves static build output
- **Framework:** React + Vite
- **Current Version:** 0.0.0
- **Public URL:** https://rankey-staging-ui.onrender.com

**Environment Variables (Keys Only):**
- `VITE_API_BASE_URL` - Backend API endpoint

### Backend (VPS Server)

- **Provider:** VPS Hosting
- **IP Address:** 5.78.43.96
- **OS:** Linux (systemd-based)
- **User:** root
- **Application Directory:** `/root/rankey-api`
- **Repository:** https://github.com/eyshstore/rankey-staging-backend
- **Branch:** main
- **Process Manager:** PM2
- **Process Name:** rankey-api
- **Script:** `/root/rankey-api/index.js`
- **Port:** 7000 (localhost only)
- **Node.js Version:** 20.19.6
- **Memory Limit:** 4096MB (max-old-space-size)
- **Uptime:** 6+ days (auto-restart on crash)
- **Restart Count:** 32201 (automatic PM2 restarts)

**Systemd Services:**
- `mongod.service` - MongoDB database server
- `cloudflared.service` - Cloudflare Tunnel daemon

**Environment Variables (Keys Only):**
- `DB_HOST` - MongoDB connection string
- `PORT` - Application port
- `SESSION_SECRET` - Express session secret
- `NODE_ENV` - Environment mode
- `FRONTEND_URL` - Frontend origin for CORS
- `SCRAPINGBEE_API_KEY` - ScrapingBee service key
- `SCRAPINGDOG_API_KEY` - ScrapingDog service key

### MongoDB

- **Version:** 8.x
- **Database Name:** rankey
- **Access:** localhost:27017 only (no external access)
- **Authentication:** None (localhost trust)
- **Collections:**
  - `products` - 296,889 documents
  - `categories` - 95,214 documents
  - `scans` - 105 documents
  - `sessions` - 2 documents
- **Total Objects:** 392,210
- **Data Size:** 289 MB
- **Storage Size:** 95 MB
- **Index Size:** 8.7 MB
- **Total Size:** 104 MB
- **Memory Usage:** 518.5 MB

**Backup Location:** `/tmp/rankey-mongo-backup-YYYYMMDD/`

### Cloudflare Tunnel

- **Tunnel Name:** rankey-staging
- **Tunnel ID:** 4b565581-488c-419c-aebe-48173f386f5e
- **Public Hostname:** rankey-api.jsecom.pl
- **Domain:** jsecom.pl
- **Target Service:** http://localhost:7000
- **Config File:** `/etc/cloudflared/config.yml`
- **Credentials File:** `/root/.cloudflared/4b565581-488c-419c-aebe-48173f386f5e.json`
- **Systemd Service:** cloudflared.service
- **Status:** Active (running)
- **Uptime:** 3 weeks 5 days
- **Version:** 2025.11.1 (outdated - 2026.1.2 available)

**Tunnel Configuration:**
```yaml
tunnel: 4b565581-488c-419c-aebe-48173f386f5e
credentials-file: /root/.cloudflared/4b565581-488c-419c-aebe-48173f386f5e.json

ingress:
  - hostname: rankey-api.jsecom.pl
    service: http://localhost:7000
  - service: http_status:404
```

---

## Section 3: Git Repositories

### Frontend Repository

- **URL:** https://github.com/eyshstore/rankey-staging-ui
- **Branch:** main
- **Latest Commit:** c74f94559a5dabbe624bc159fdd67da2ffaebcb5
- **Commit Message:** "Show maxConcurrentRequests for all providers"
- **Commit Date:** 2026-01-26
- **Status:** Clean (no uncommitted changes)
- **Remote:** origin/main (up to date)

### Backend Repository

- **URL:** https://github.com/eyshstore/rankey-staging-backend
- **Branch:** main
- **Latest Commit:** 274a1afa969461361f51a03a6445fcddbc93d1ed
- **Commit Message:** "fix: enable render_js for accurate price extraction"
- **Commit Date:** 2026-01-19
- **Status:** Clean (no uncommitted changes)
- **Remote:** origin/main (up to date)

### Git Workflow Rules

1. **Never work directly on main branch**
   - Always create feature branches for new work
   - Branch naming: `feature/description`, `fix/description`, `hotfix/description`

2. **Development workflow:**
   ```bash
   # Create feature branch
   git checkout -b feature/your-feature-name

   # Make changes and commit
   git add .
   git commit -m "description"

   # Push to remote
   git push origin feature/your-feature-name

   # Create pull request on GitHub
   # After approval, merge to main
   ```

3. **Deployment workflow:**
   - Frontend: Push/merge to main → Render auto-deploys
   - Backend: Merge to main → Manual deployment required (see Section 4)

4. **Commit message conventions:**
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `debug:` - Debug changes
   - `refactor:` - Code refactoring
   - Use imperative mood: "Add feature" not "Added feature"

---

## Section 4: Deployment Process

### Frontend Deployment (Automatic)

**Trigger:** Git push to main branch

**Process:**
1. Developer pushes changes to main branch on GitHub
2. Render.com detects the push (webhook)
3. Render automatically starts build process:
   ```bash
   npm install
   npm run build
   ```
4. Build creates static files in `dist/` directory
5. Render deploys the static files
6. Site becomes available at https://rankey-staging-ui.onrender.com

**Build Time:** ~2-3 minutes

**Verification:**
1. Check Render dashboard for build status
2. Visit frontend URL and verify changes
3. Check browser console for errors
4. Test API connectivity

**Rollback:**
- Render keeps previous deployments
- Can roll back via Render dashboard
- Or: revert git commit and push

### Backend Deployment (Manual)

**Trigger:** Manual SSH deployment

**Process:**
```bash
# 1. SSH to server
ssh root@5.78.43.96

# 2. Navigate to application directory
cd /root/rankey-api

# 3. Check current status
git status
git log -1

# 4. Pull latest changes
git pull origin main

# 5. Install dependencies (if package.json changed)
npm install

# 6. Restart PM2 process
pm2 restart rankey-api

# 7. Verify deployment
pm2 logs rankey-api --lines 50
```

**Deployment Time:** ~1-2 minutes

**Verification Commands:**
```bash
# Check PM2 status
pm2 list

# Check application logs
pm2 logs rankey-api --lines 100

# Check systemd services
systemctl status mongod
systemctl status cloudflared

# Test API endpoint
curl http://localhost:7000/health

# Check git status
cd /root/rankey-api && git log -1
```

**Common Issues During Deployment:**

| Issue | Symptom | Solution |
|-------|---------|----------|
| Port in use | PM2 restart fails | `pm2 delete rankey-api && pm2 start index.js --name rankey-api` |
| MongoDB down | Connection errors | `systemctl restart mongod` |
| Cloudflare down | API unreachable | `systemctl restart cloudflared` |
| Memory leak | High memory usage | `pm2 restart rankey-api` clears memory |
| npm packages | Missing dependencies | Run `npm install` before restart |

### Deployment Checklist

**Before deploying backend:**
- [ ] Code reviewed and tested locally
- [ ] Committed to feature branch
- [ ] Pull request created and approved
- [ ] Merged to main branch
- [ ] Database migrations ready (if any)
- [ ] Environment variables updated (if needed)

**After deploying backend:**
- [ ] PM2 process restarted successfully
- [ ] No errors in PM2 logs
- [ ] API endpoint responding: `curl http://localhost:7000`
- [ ] Frontend can connect to backend
- [ ] MongoDB connection working
- [ ] Cloudflare tunnel active

**After deploying frontend:**
- [ ] Build completed successfully on Render
- [ ] Frontend loads in browser
- [ ] No console errors
- [ ] API calls working
- [ ] UI changes visible

---

## Section 5: Configuration & Secrets

### Frontend Environment Variables

**Location:** Render.com dashboard → Environment tab

**Required Variables:**
- `VITE_API_BASE_URL` - Backend API base URL (e.g., https://rankey-api.jsecom.pl)

**Note:** Vite environment variables must be prefixed with `VITE_` to be exposed to the client.

**Usage in Code:**
```javascript
// src/config.js
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL
};
```

### Backend Environment Variables

**Location:** `/root/rankey-api/.env` on VPS server

**Required Variables:**
- `DB_HOST` - MongoDB connection string
- `PORT` - Application port number
- `SESSION_SECRET` - Express session encryption secret
- `NODE_ENV` - Environment mode (production/development)
- `FRONTEND_URL` - Frontend origin for CORS configuration
- `SCRAPINGBEE_API_KEY` - ScrapingBee API authentication key
- `SCRAPINGDOG_API_KEY` - ScrapingDog API authentication key

**Security Notes:**
- ⚠️ `.env` file contains sensitive credentials
- ⚠️ Never commit `.env` to version control
- ⚠️ `.env` is listed in `.gitignore`
- ✅ Actual values stored in `CREDENTIALS.md` (private, not in git)

### Configuration Files Locations

| File | Location | Purpose | In Git? |
|------|----------|---------|---------|
| `.env` | `/root/rankey-api/.env` | Backend environment variables | ❌ No |
| `config.yml` | `/etc/cloudflared/config.yml` | Cloudflare Tunnel config | ✅ Yes (no secrets) |
| `credentials.json` | `/root/.cloudflared/[tunnel-id].json` | Tunnel authentication | ❌ No |
| `package.json` | Repository root | Dependencies & scripts | ✅ Yes |
| `vite.config.js` | Frontend root | Vite build configuration | ✅ Yes |

### Secrets Management

**DO NOT commit these to git:**
- API keys (ScrapingBee, ScrapingDog)
- Session secrets
- Database credentials
- Cloudflare tunnel credentials
- User passwords

**Safe to commit:**
- Public URLs and domains
- Port numbers
- Non-sensitive configuration
- Package dependencies

---

## Section 6: Monitoring & Debugging

### Checking Logs

#### Frontend Logs (Render)
```bash
# Via Render Dashboard:
# 1. Go to https://dashboard.render.com
# 2. Select rankey-staging-ui service
# 3. Click "Logs" tab
# 4. View real-time or historical logs
```

#### Backend Logs (PM2)
```bash
# SSH to server first
ssh root@5.78.43.96

# View live logs (all output)
pm2 logs rankey-api

# View last 100 lines
pm2 logs rankey-api --lines 100

# View only errors
pm2 logs rankey-api --err

# View log files directly
tail -f /root/.pm2/logs/rankey-api-out.log
tail -f /root/.pm2/logs/rankey-api-error.log
```

#### MongoDB Logs
```bash
# View MongoDB service logs
journalctl -u mongod -n 100 -f

# View MongoDB log file
tail -f /var/log/mongodb/mongod.log
```

#### Cloudflare Tunnel Logs
```bash
# View tunnel service logs
journalctl -u cloudflared -n 100 -f

# Check tunnel status
systemctl status cloudflared
```

### Restarting Services

#### Restart Backend Application
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
```

#### Restart MongoDB
```bash
ssh root@5.78.43.96
systemctl restart mongod

# Check status
systemctl status mongod
```

#### Restart Cloudflare Tunnel
```bash
ssh root@5.78.43.96
systemctl restart cloudflared

# Check status
systemctl status cloudflared
```

#### Restart Entire Server (Last Resort)
```bash
ssh root@5.78.43.96
reboot

# Services auto-start on boot:
# - mongod.service (enabled)
# - cloudflared.service (enabled)
# - PM2 must be manually started after reboot
```

### Common Issues & Solutions

#### Issue: Frontend can't connect to backend

**Symptoms:**
- API calls fail with network errors
- CORS errors in browser console
- "Failed to fetch" errors

**Debugging:**
```bash
# 1. Check if backend is running
ssh root@5.78.43.96 "pm2 list"

# 2. Check backend logs
ssh root@5.78.43.96 "pm2 logs rankey-api --lines 50"

# 3. Check Cloudflare tunnel
ssh root@5.78.43.96 "systemctl status cloudflared"

# 4. Test backend locally
ssh root@5.78.43.96 "curl http://localhost:7000"

# 5. Check frontend env variable
# In Render dashboard, verify VITE_API_BASE_URL is set correctly
```

**Solutions:**
- Restart PM2: `pm2 restart rankey-api`
- Restart Cloudflare: `systemctl restart cloudflared`
- Check CORS settings in backend code
- Verify VITE_API_BASE_URL in Render

#### Issue: MongoDB connection failed

**Symptoms:**
- Backend logs show "MongoError"
- "Failed to connect to database" errors
- Requests timeout

**Debugging:**
```bash
# 1. Check if MongoDB is running
ssh root@5.78.43.96 "systemctl status mongod"

# 2. Check MongoDB logs
ssh root@5.78.43.96 "journalctl -u mongod -n 50"

# 3. Test MongoDB connection
ssh root@5.78.43.96 "mongosh --eval 'db.stats()' rankey"

# 4. Check disk space
ssh root@5.78.43.96 "df -h"
```

**Solutions:**
- Restart MongoDB: `systemctl restart mongod`
- Check disk space (MongoDB needs free space)
- Verify DB_HOST in .env file

#### Issue: High memory usage

**Symptoms:**
- PM2 shows high memory (>500MB)
- Server becomes slow
- Out of memory errors

**Debugging:**
```bash
# Check memory usage
ssh root@5.78.43.96 "free -h"
ssh root@5.78.43.96 "pm2 list"

# Check Node.js heap usage
ssh root@5.78.43.96 "pm2 show rankey-api"
```

**Solutions:**
- Restart PM2: `pm2 restart rankey-api` (clears memory)
- Node.js is configured with `--max-old-space-size=4096`
- Monitor for memory leaks in application code

#### Issue: Cloudflare tunnel down

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
```

**Solutions:**
- Restart tunnel: `systemctl restart cloudflared`
- Check if backend is running on port 7000
- Verify tunnel config: `/etc/cloudflared/config.yml`

#### Issue: Render deployment failed

**Symptoms:**
- Build fails in Render dashboard
- "Build failed" notification
- Old version still deployed

**Debugging:**
- Check build logs in Render dashboard
- Look for npm install errors
- Check for syntax errors in code

**Solutions:**
- Fix code errors and push again
- Clear build cache in Render
- Verify package.json dependencies
- Check build command in Render settings

### Health Check Commands

Run these to verify system health:

```bash
# Quick health check script
ssh root@5.78.43.96 << 'EOF'
echo "=== System Health Check ==="
echo ""
echo "1. PM2 Status:"
pm2 list
echo ""
echo "2. Backend Logs (last 10 lines):"
pm2 logs rankey-api --lines 10 --nostream
echo ""
echo "3. MongoDB Status:"
systemctl status mongod --no-pager | grep "Active:"
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
EOF
```

---

## Section 7: Backup & Restore

### Backup Storage

**Server Location:** `/tmp/rankey-*-backup-YYYYMMDD/`
**Local Storage:** `C:\Users\user\Documents\Jonathan Documents\NEW\`

**Backup Files:**
- `rankey-api-backup-YYYYMMDD.tar.gz` - Full backend code backup
- `rankey-mongo-backup-YYYYMMDD.tar.gz` - MongoDB database dump

### Creating a Backup

#### Full System Backup Script

```bash
# SSH to server
ssh root@5.78.43.96

# Set date variable
BACKUP_DATE=$(date +%Y%m%d)

# 1. Backup backend application
cd /root/rankey-api
tar -czf /tmp/rankey-api-backup-${BACKUP_DATE}.tar.gz .

# 2. Backup MongoDB database
mongodump --db rankey --out /tmp/rankey-mongo-backup-${BACKUP_DATE}

# 3. Compress MongoDB backup
tar -czf /tmp/rankey-mongo-backup-${BACKUP_DATE}.tar.gz /tmp/rankey-mongo-backup-${BACKUP_DATE}

# 4. List backup files
ls -lh /tmp/rankey-*${BACKUP_DATE}*

# 5. Copy backups to local machine (run from local terminal)
scp root@5.78.43.96:/tmp/rankey-api-backup-${BACKUP_DATE}.tar.gz .
scp root@5.78.43.96:/tmp/rankey-mongo-backup-${BACKUP_DATE}.tar.gz .
```

#### Automated Backup Script

Create `/root/backup-rankey.sh`:

```bash
#!/bin/bash
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_DIR="/root/backups"

mkdir -p ${BACKUP_DIR}

# Backup application
cd /root/rankey-api
tar -czf ${BACKUP_DIR}/rankey-api-backup-${BACKUP_DATE}.tar.gz .

# Backup database
mongodump --db rankey --out /tmp/rankey-mongo-backup-${BACKUP_DATE}
tar -czf ${BACKUP_DIR}/rankey-mongo-backup-${BACKUP_DATE}.tar.gz /tmp/rankey-mongo-backup-${BACKUP_DATE}
rm -rf /tmp/rankey-mongo-backup-${BACKUP_DATE}

# Clean old backups (keep last 7 days)
find ${BACKUP_DIR} -name "rankey-*-backup-*.tar.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_DATE}"
ls -lh ${BACKUP_DIR}/*${BACKUP_DATE}*
```

**Set up cron job for daily backups:**
```bash
# Edit crontab
crontab -e

# Add line (runs at 3 AM daily)
0 3 * * * /root/backup-rankey.sh >> /var/log/rankey-backup.log 2>&1
```

### Restoring from Backup

#### Restore Backend Application

```bash
# SSH to server
ssh root@5.78.43.96

# Stop PM2 process
pm2 stop rankey-api

# Backup current version (just in case)
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
```

#### Restore MongoDB Database

```bash
# SSH to server
ssh root@5.78.43.96

# Extract MongoDB backup
cd /tmp
tar -xzf /path/to/rankey-mongo-backup-YYYYMMDD.tar.gz

# Stop backend to prevent writes during restore
pm2 stop rankey-api

# Drop existing database (CAREFUL!)
mongosh rankey --eval "db.dropDatabase()"

# Restore database
mongorestore --db rankey /tmp/rankey-mongo-backup-YYYYMMDD/rankey

# Verify restore
mongosh rankey --eval "db.stats()"

# Start backend
pm2 start rankey-api

# Clean up
rm -rf /tmp/rankey-mongo-backup-YYYYMMDD
```

#### Emergency Full Restore Procedure

If both backend and database need restoration:

```bash
# 1. SSH to server
ssh root@5.78.43.96

# 2. Stop all services
pm2 stop rankey-api
systemctl stop cloudflared

# 3. Restore backend
cd /root
mv rankey-api rankey-api-broken-$(date +%Y%m%d)
mkdir rankey-api
cd rankey-api
tar -xzf /path/to/rankey-api-backup-YYYYMMDD.tar.gz
npm install

# 4. Restore database
mongosh rankey --eval "db.dropDatabase()"
tar -xzf /path/to/rankey-mongo-backup-YYYYMMDD.tar.gz -C /tmp
mongorestore --db rankey /tmp/rankey-mongo-backup-YYYYMMDD/rankey

# 5. Restart services
systemctl start cloudflared
pm2 start index.js --name rankey-api

# 6. Verify
pm2 logs rankey-api --lines 50
mongosh rankey --eval "db.stats()"
curl http://localhost:7000
```

### Backup Best Practices

1. **Frequency:**
   - Daily automatic backups (via cron)
   - Manual backup before major changes
   - Backup before deployments

2. **Retention:**
   - Keep last 7 daily backups on server
   - Download weekly backups to local storage
   - Store monthly backups for long-term retention

3. **Verification:**
   - Periodically test restore procedures
   - Verify backup file integrity
   - Document restore time (RTO)

4. **Security:**
   - Backups contain sensitive data
   - Store backups securely
   - Encrypt backups for off-site storage

---

## Section 8: Changelog

### Backend Repository (rankey-staging-backend)

| Date | Commit | Description |
|------|--------|-------------|
| 2026-01-19 | 274a1af | fix: enable render_js for accurate price extraction |
| 2026-01-18 | 6a08ddc | fix: extract price section before searching to avoid shipping costs |
| 2026-01-18 | 5589a6f | feat: add test harness for price/coupon extraction debugging |
| 2026-01-18 | 7441ccb | debug: add detailed logging to setPrice and getDiscountCoupon |
| 2026-01-18 | d95b297 | fix: price extraction - always use .first() to get single price |
| 2026-01-18 | e81b4ca | fix: move cookies from headers to ScrapingBee params for USD currency |
| 2026-01-14 | d1060d0 | fix: correct syntax error in currency symbols array |
| 2026-01-14 | 7cb3a6f | fix: improved currency validation and coupon detection from coupon-gleaner |
| 2026-01-13 | 0898145 | Add missing auth middleware file |
| 2026-01-13 | d8cbd84 | Improve coupon detection: add S&S filtering and value extraction |

### Frontend Repository (rankey-staging-ui)

| Date | Commit | Description |
|------|--------|-------------|
| 2026-01-26 | c74f945 | Show maxConcurrentRequests for all providers |
| 2026-01-25 | b9c9c36 | Fix: Add debugPriceLogging to scan request payload |
| 2026-01-25 | 6247cdc | Add debug logging UI: checkbox and download ZIP button |
| 2026-01-25 | 27e245f | Fix: Handle 'failed' state in frontend UI |
| 2026-01-07 | 47b9135 | Fix: Convert maxConcurrentRequests to number type |
| 2025-10-31 | 346f8e7 | Fixed issue with pagination |
| 2025-10-24 | e14ff1c | Added DealsScan |
| 2025-09-29 | 8659a1e | Added scraping provider key update feature |
| 2025-09-26 | cab00f8 | Fixed ScanDetails modal |
| 2025-09-26 | 8bb181c | Minor patches |

### System Events

| Date | Event | Details |
|------|-------|---------|
| 2026-02-02 | Backups Created | Full system backup (API + MongoDB) |
| 2026-02-01 | MongoDB Restarted | Automatic restart, 18h uptime |
| 2026-01-26 | Backend Running | 6 days uptime, 32201 total restarts |
| 2026-01-06 | Cloudflare Tunnel Started | 3+ weeks uptime |

---

## Appendix: Quick Reference

### Emergency Contacts

- **Repository Owner:** eyshstore@gmail.com
- **VPS Access:** root@5.78.43.96
- **Domain Management:** Cloudflare account (jsecom.pl)

### Quick Commands Cheat Sheet

```bash
# Deploy backend
ssh root@5.78.43.96 "cd /root/rankey-api && git pull && pm2 restart rankey-api"

# View logs
ssh root@5.78.43.96 "pm2 logs rankey-api --lines 100"

# Check status
ssh root@5.78.43.96 "pm2 list && systemctl status mongod && systemctl status cloudflared"

# Backup now
ssh root@5.78.43.96 "cd /root/rankey-api && tar -czf /tmp/backup-$(date +%Y%m%d).tar.gz ."

# Database shell
ssh root@5.78.43.96 "mongosh rankey"
```

### Service Status URLs

- Frontend: https://rankey-staging-ui.onrender.com
- Backend API: https://rankey-api.jsecom.pl
- Render Dashboard: https://dashboard.render.com
- Cloudflare Dashboard: https://dash.cloudflare.com

---

**Document Version:** 1.0
**Created:** 2026-02-02
**Last Updated:** 2026-02-02
**Next Review:** 2026-03-02
