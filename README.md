# SmileCare Dental Practice — Backend API

Node.js + Express + PostgreSQL backend for the SmileCare Dental Practice Management System.  
Designed for deployment on [Railway](https://railway.app).

---

## Project Structure

```
dental-backend/
├── routes/
│   ├── patients.js       # CRUD for patients
│   ├── appointments.js   # CRUD for appointments + auto-schedules reminders
│   ├── reminders.js      # Reminder engine (GET + POST /run)
│   └── analytics.js      # Dashboard metrics
├── server.js             # Express app + CORS + route registration
├── db.js                 # PostgreSQL connection pool
├── whatsapp.js           # WhatsApp message builder + send function
├── schema.sql            # Database table definitions (auto-run on startup)
├── package.json
├── .env.example          # Copy this to .env and fill in your values
├── .gitignore
└── README.md
```

---

## Local Development

### Prerequisites
- Node.js 18 or higher
- A PostgreSQL database (local install or a free Railway PostgreSQL instance)

### Steps

```bash
# 1. Clone / copy this folder into your project
cd dental-backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Then open .env and fill in your DATABASE_URL and other values

# 4. Start the development server (auto-restarts on file changes)
npm run dev

# The API will be available at http://localhost:3001
```

The database tables are created automatically on first startup — you do not need to run `schema.sql` manually.

---

## Railway Deployment (Step-by-Step)

### Part 1 — Create a PostgreSQL database on Railway

1. Go to [railway.app](https://railway.app) and log in.
2. Click **New Project**.
3. Choose **Deploy a database** → select **PostgreSQL**.
4. Railway will provision a PostgreSQL instance. Click on it.
5. Go to the **Connect** tab and copy the **DATABASE_URL** — it looks like:
   ```
   postgresql://postgres:abc123@containers-us-west-XX.railway.app:7777/railway
   ```
   Keep this safe — you will paste it in Part 3.

---

### Part 2 — Push this backend to GitHub

```bash
# Inside the dental-backend folder:
git init
git add .
git commit -m "Initial commit — SmileCare dental backend"

# Create a NEW repo on github.com (name it e.g. smilecare-dental-backend)
# Then push to it:
git remote add origin https://github.com/YOUR_USERNAME/smilecare-dental-backend.git
git branch -M main
git push -u origin main
```

> **Important:** Make sure `.env` is in `.gitignore` (it already is).  
> Never push your real credentials to GitHub.

---

### Part 3 — Deploy the backend on Railway

1. In your Railway project, click **New Service** → **GitHub Repo**.
2. Select your `smilecare-dental-backend` repo and click **Deploy**.
3. Railway will detect it is a Node.js app and run `npm start` automatically.

**Add environment variables:**

4. Click on your new service → go to the **Variables** tab.
5. Add each of the following (click **+ New Variable** for each):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Paste the URL you copied in Part 1 |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://dental-practice-frontend-production.up.railway.app` |
| `TWILIO_ACCOUNT_SID` | *(leave blank for now — fill in when ready)* |
| `TWILIO_AUTH_TOKEN` | *(leave blank for now)* |
| `TWILIO_WHATSAPP_NUMBER` | *(leave blank for now)* |

6. Railway will automatically redeploy after you save variables.
7. Go to the **Settings** tab → **Networking** → click **Generate Domain**.  
   Copy your backend URL — it will look like:  
   `https://smilecare-dental-backend-production.up.railway.app`

---

### Part 4 — Connect your React frontend to this backend

In your React app, set the API base URL to your Railway backend domain:

```javascript
// In your React app — create a config file or use an environment variable
const API_BASE_URL = 'https://smilecare-dental-backend-production.up.railway.app';

// Example fetch call
const patients = await fetch(`${API_BASE_URL}/api/patients`).then(r => r.json());
```

If using Vite, add to your `.env`:
```
VITE_API_URL=https://smilecare-dental-backend-production.up.railway.app
```

If using Create React App:
```
REACT_APP_API_URL=https://smilecare-dental-backend-production.up.railway.app
```

---

### Part 5 — Set up the daily reminder cron job

The reminder engine lives at `POST /api/reminders/run`. You need to call this once per day.

**Option A — Railway Cron Service (recommended)**

1. In your Railway project, click **New Service** → **Empty Service**.
2. Set the start command to:
   ```
   node -e "fetch('https://YOUR-BACKEND-URL.railway.app/api/reminders/run', {method:'POST'}).then(r=>r.json()).then(console.log)"
   ```
3. Go to **Settings** → enable **Cron** → set schedule: `0 8 * * *` (runs at 8:00 AM UTC daily).

**Option B — cron-job.org (free external scheduler)**

1. Sign up at [cron-job.org](https://cron-job.org) (free).
2. Create a new cron job:
   - URL: `https://YOUR-BACKEND-URL.railway.app/api/reminders/run`
   - Method: `POST`
   - Schedule: every day at 08:00

---

## API Reference

### Patients
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/patients` | List all patients |
| GET | `/api/patients/:id` | Get one patient |
| POST | `/api/patients` | Create a patient |
| PUT | `/api/patients/:id` | Update a patient |
| DELETE | `/api/patients/:id` | Delete a patient |

**POST /api/patients body:**
```json
{
  "full_name": "Thandi Mokoena",
  "phone": "+27821234567",
  "email": "thandi@email.com",
  "date_of_birth": "1985-03-15",
  "notes": "No allergies.",
  "whatsapp_opt_in": true
}
```

---

### Appointments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/appointments` | List all (supports `?date=` and `?status=`) |
| GET | `/api/appointments/:id` | Get one appointment |
| POST | `/api/appointments` | Create + auto-schedule reminders |
| PUT | `/api/appointments/:id` | Update (e.g. change status) |
| DELETE | `/api/appointments/:id` | Delete appointment + reminders |

**POST /api/appointments body:**
```json
{
  "patient_id": 1,
  "appointment_date": "2025-07-15",
  "appointment_time": "09:00",
  "appointment_type": "Check-up & Clean",
  "duration_minutes": 60,
  "status": "confirmed",
  "notes": "First visit"
}
```

---

### Reminders
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reminders` | List reminders (supports `?sent=false`) |
| POST | `/api/reminders/run` | Run the daily reminder engine |

---

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics` | All dashboard metrics in one call |

**Response includes:**
- `total_patients`
- `todays_appointments` (array)
- `todays_count`
- `monthly_appointments` (last 6 months)
- `whatsapp.opted_in`, `whatsapp.opted_out`
- `recalls_due` (array of patients)
- `recalls_count`
- `appointments_by_status`
- `appointments_by_type`

---

## Activating Real WhatsApp Messages

1. Sign up at [twilio.com](https://www.twilio.com) (or [infobip.com](https://www.infobip.com)).
2. Get a WhatsApp-enabled number and note your credentials.
3. Add credentials to Railway environment variables (`TWILIO_ACCOUNT_SID`, etc.).
4. Open `whatsapp.js` and follow the instructions in the comments to uncomment the Twilio block and remove the simulation block.
5. Redeploy — Railway will pick up the changes automatically.

---

## Health Check

```
GET /health
```
Returns `{ "status": "ok" }`. Railway uses this to monitor the service.
