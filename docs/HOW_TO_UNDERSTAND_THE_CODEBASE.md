# The Codebase Decryption Playbook: How to Understand Any Software Project
> **A practical engineering guide for transitioning from "vibecoding" (AI-assisted building) to complete technical comprehension of full-stack, mobile, and real-time systems.**

---

## Table of Contents
1. [The Core Philosophy](#1-the-core-philosophy)
2. [The 7-Step Decryption Framework](#2-the-7-step-decryption-framework)
   - [Step 1: Map the System Topology & Entry Points](#step-1-map-the-system-topology--entry-points)
   - [Step 2: Read the Data Contracts First (The Nouns & States)](#step-2-read-the-data-contracts-first-the-nouns--states)
   - [Step 3: Understand State & The Reactivity Model](#step-3-understand-state--the-reactivity-model)
   - [Step 4: Trace a Vertical Slice (The "Packet Journey")](#step-4-trace-a-vertical-slice-the-packet-journey)
   - [Step 5: Deconstruct Platform Bridges & Specialized Subsystems](#step-5-deconstruct-platform-bridges--specialized-subsystems)
   - [Step 6: Inspect the Build System & CI/CD Pipeline](#step-6-inspect-the-build-system--cicd-pipeline)
   - [Step 7: Active Dissection ("Break & Probe")](#step-7-active-dissection-break--probe)
3. [Complete Walkthrough: Example 1 — The Citizen Emergency SOS Beacon](#3-complete-walkthrough-example-1--the-citizen-emergency-sos-beacon)
4. [Complete Walkthrough: Example 2 — First Responder GPS Telemetry & Navigation](#4-complete-walkthrough-example-2--first-responder-gps-telemetry--navigation)
5. [The 2-Minute Revision Cheat Sheet](#5-the-2-minute-revision-cheat-sheet)

---

## 1. The Core Philosophy

When developing with AI assistants, code gets written fast. You describe the intent, and working code appears. However, **cognitive debt** accumulates when you don't know *why* specific structures, bridges, or dependencies were chosen.

### Rule #1: Software is NOT a Novel
Never attempt to understand a project by opening files alphabetically or reading line-by-line from the top of the folder tree. Real systems are interconnected webs of:
1. **State** (where information is remembered)
2. **Transforms** (functions that modify that information)
3. **Transport Channels** (HTTP, WebSockets, OS IPC that move information across boundaries)

### Rule #2: Follow the Data, Not the Code
Logic changes frequently, but **data structures define the rules of the universe**. If you understand what an `Incident` or `ResponderLocation` looks like, 80% of the UI buttons and backend endpoints become self-explanatory.

---

## 2. The 7-Step Decryption Framework

```
 [1. Topology & Entry Points] ──> [2. Data Contracts] ──> [3. Reactivity & State]
                                                                    │
 [6. CI/CD & Build Pipeline]  <── [5. Platform Bridges] <── [4. Vertical Trace]
              │
 [7. Active Dissection ("Break & Probe")]
```

---

### Step 1: Map the System Topology & Entry Points
*Goal: Understand where code physically runs and where execution starts.*

Every full-stack repository has boundaries separating different runtimes. Before looking at functions, identify the boundaries:

1. **Classify the Monorepo Folders**:
   - `apps/mobile/` → Runs on Android / iOS devices inside JavaScript engines (Hermes) and native OS threads.
   - `apps/web/` → Runs inside a user's desktop/mobile web browser (Chromium, Safari).
   - `services/api/` → Runs on an Ubuntu cloud server or Docker container (Python / FastAPI).
2. **Find the "Ignition Keys" (Entry Points)**:
   - Mobile: `apps/mobile/App.tsx` or `index.ts` (first component rendered when the app starts).
   - Web: `apps/web/src/main.tsx` (where React mounts onto the DOM element `<div id="root">`).
   - Backend: `services/api/app/main.py` (where FastAPI initializes routes, middleware, and database pools).

---

### Step 2: Read the Data Contracts First (The Nouns & States)
*Goal: Learn the vocabulary of the project before reading the sentences.*

Look for files named `types.ts`, `schema.py`, `models.py`, or SQL migrations. Ask three questions about every model:
1. **What are the Core Entities?**
   - In ResQAi: `IncidentReport`, `NearbyAlert`, `ResponderJob`, `UserProfile`.
2. **What are the States?** (State Machines)
   - An incident doesn't just exist; it moves through a pipeline:
     `reported` ➔ `triaged` ➔ `dispatched` ➔ `arrived` ➔ `resolved`.
3. **What are the Geographic Primitives?**
   - For location apps: `lat: number`, `lng: number`, `accuracy_meters`, `source: "gps" | "fallback"`.

> **Key takeaway:** Almost every UI button in an app is just an trigger to move an entity from one state to another.

---

### Step 3: Understand State & The Reactivity Model
*Goal: Know where data lives in memory and how UI responds when data changes.*

Data in modern apps exists at three distinct levels:
1. **Local Ephemeral State**: Held in React `useState()` or component memory. If the user switches screens or refreshes, this data vanishes (e.g., whether a modal is open).
2. **Server/Database State**: Held in PostgreSQL / PostGIS. Persists forever on the server disk.
3. **Real-Time Synchronized State**: Data moved via WebSockets (`services/realtime.ts`) to keep client screens updated without requiring the user to press "Refresh".

When inspecting a screen, locate where data enters:
- Is it fetched once on mount (`useEffect(() => { api.getData() }, [])`)?
- Does it subscribe to a live socket stream (`realtime.subscribe((event) => ... )`)?

---

### Step 4: Trace a Vertical Slice (The "Packet Journey")
*Goal: Understand the complete cycle by following ONE action from user finger to database to other users.*

Pick the single most important action in the app (e.g., "Submit SOS Beacon" or "Accept Dispatch Offer"). Trace the breadcrumb trail across the layers:

1. **User Interaction (UI Layer)**: User taps a button.
2. **Hardware/Sensor Capture**: App asks device sensors for data (e.g., GPS coordinates).
3. **Transport Outbound (Client Network)**: HTTP `fetch()` or WebSocket emits a JSON payload to the server.
4. **Backend Processing & Validation**: Server validates payload via Pydantic schema, authenticates JWT token.
5. **Database Mutation**: Server writes records using SQL/ORM (e.g., storing a geometry point in PostGIS).
6. **Fanout / Notification**: Server emits an event to dispatchers or nearby responders via WebSockets.
7. **Client Reaction (UI Update)**: Receiving clients parse the event, update their state, and re-render the map/list.

---

### Step 5: Deconstruct Platform Bridges & Specialized Subsystems
*Goal: Understand the "Why" behind complex or unusual code blocks.*

Whenever you see code that looks complex, never assume it is random. Ask: **"What physical limitation or external system does this code bridge?"**

1. **Hardware & Operating System Permissions**:
   - *Code:* `expo-location`, `Location.requestForegroundPermissionsAsync()`.
   - *Why:* Mobile operating systems (Android/iOS) kill apps that try to access GPS without explicit user authorization or run runaway background battery drains.
2. **Cross-Platform Embedded Views**:
   - *Code:* `LeafletMapView.tsx` wrapping an HTML page inside `<WebView>`.
   - *Why:* Native Google Maps SDKs require billing accounts, API keys, and complex native Gradle linking that often breaks. An embedded OpenStreetMap layer inside an isolated WebView gives 100% reliable vector maps with pinch-to-zoom on any Android/iOS device for free.
3. **Environment Decoupling**:
   - *Code:* `.env` files with `VITE_API_BASE_URL`.
   - *Why:* So the identical code bundle can run on a developer's phone (pointing to `localhost:8000`) or in production (pointing to `https://resqai-6s8c.onrender.com`) without editing a single source file.

---

### Step 6: Inspect the Build System & CI/CD Pipeline
*Goal: Understand how plain text files are compiled into downloadable apps.*

Code in a repository is not what phones run. Phones run compiled APK bytecode. Cloud servers run Docker containers.
Look at `.github/workflows/build-apk.yml`:
1. **Environment Setup**: Provisions a clean Linux machine (`ubuntu-24.04`), installs Node.js and Java JDK.
2. **Dependency Resolution**: Runs `npm install --legacy-peer-deps`.
   - *Lesson learned:* Version pinning matters. Installing `expo-location@58` on an `expo@57` project caused native Kotlin compile failure because SDK 58 classes did not exist in SDK 57.
3. **Native Compilation Engine**: Runs Gradle (`./gradlew assembleDebug`). Gradle compiles Kotlin/Java code, invokes the React Native asset bundler, compiles Hermes bytecode, and signs the `.apk`.
4. **Artifact Release**: Uploads the resulting `ResQAi-mobile.apk` to GitHub Releases for direct download.

---

### Step 7: Active Dissection ("Break & Probe")
*Goal: Cement knowledge by interacting with the code rather than just reading it.*

Passive reading builds an illusion of competence. Active testing builds true intuition:

1. **The Log Trail Method**: Add distinct logs at each step of a flow:
   ```typescript
   console.log("==> [STEP 1: UI] User tapped SOS button");
   console.log("==> [STEP 2: GPS] Hardware coordinates acquired:", coords);
   console.log("==> [STEP 3: NET] Sending POST /citizen/sos");
   ```
   Trigger the flow and watch the logs appear in sequence.
2. **The Sabotage Test**: Intentionally alter one line:
   - Change the API URL to an invalid route (`/citizen/sos_invalid`).
   - Observe where the app breaks: Does it crash? Does it show an error alert? Does it retry?
   - This reveals the error handling and resilience boundaries.
3. **Read Automated Tests**: Look at files ending in `.test.ts` or `test_*.py`. Tests are executable requirements documents showing expected inputs and outputs.

---

## 3. Complete Walkthrough: Example 1 — The Citizen Emergency SOS Beacon

Let's apply all 7 steps to trace how an emergency beacon works in ResQAi:

```
[Citizen Phone]
  1. SOSRadarButton.tsx (User long-presses SOS)
        │
  2. location.ts (Queries GPS satellite via expo-location)
        │
  3. api.ts (POST /citizen/sos with { lat: 23.2599, lng: 77.4126 })
        │
        ▼ (HTTPS REST)
[Render Cloud Backend]
  4. app/routers/citizen.py (Validates payload via Pydantic)
        │
  5. app/database/ (Inserts into PostGIS incidents table)
        │
  6. app/services/websocket.py (Broadcasts "NEW_EMERGENCY" event)
        │
        ▼ (WSS WebSocket Stream)
[Responder Phone & Operator Web Dashboard]
  7. SafeHeader.tsx / LeafletMapView.tsx (Pulsing red beacon appears on map)
```

### 1. Step 1 & 2 (Topology & Data Contracts)
- **Where does it live?** `apps/mobile/src/screens/citizen/CitizenHomeScreen.tsx`
- **What is the data shape?**
  ```typescript
  interface SOSPayload {
    location: { lat: number; lng: number; accuracy_meters: number; source: "gps" };
    location_label: string;
    note: string;
  }
  ```

### 2. Step 3 & 4 (Vertical Slice Trace)
- In `CitizenHomeScreen.tsx`:
  ```typescript
  const handleSOSTriggered = async () => {
    // 1. Get real device coordinates from location service
    const liveCoords = currentLocation || { lat: 23.2599, lng: 77.4126 };
    // 2. Call backend API
    const sosResult = await mobileApi.triggerSOS(liveCoords);
    // 3. Notify parent state to refresh reports
    onReportCreated(sosResult);
  };
  ```
- In `api.ts`:
  Makes an authenticated `POST /citizen/sos` with an `idempotency_key` so accidental double-taps don't create two emergency tickets.
- In Backend (`citizen.py`):
  Inserts the incident into PostgreSQL using PostGIS `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
- In WebSocket Manager:
  Calls `manager.broadcast_event("incident.created", incident_data)`.

### 3. Step 5 (Why is the code written this way?)
- **Why fallback coordinates?**
  If a citizen is inside a basement or parking garage where GPS satellites are blocked, the app must not crash. It provides Bhopal city center coordinates as a fallback until GPS acquires a fix.

---

## 4. Complete Walkthrough: Example 2 — First Responder GPS Telemetry & Navigation

Now let's trace how a First Responder's live location is continuously tracked and rendered:

```
[Hardware GPS Antenna]
  │ (Every 4 seconds / 5 meters moved)
  ▼
[apps/mobile/src/services/location.ts]
  │ mobileLocation.startLiveTracking() invokes watchPositionAsync
  ▼
[apps/mobile/App.tsx]
  │ setDeviceLocation(coords) updates top-level state
  ├─────────────────────────────────────────────────┐
  ▼                                                 ▼
[SafeHeader.tsx]                        [LeafletMapView.tsx]
Header displays:                         Injected JavaScript runs:
"📍 GPS 23.2599, 77.4126"               selfMarker.setLatLng([lat, lng])
                                        Map moves blue pulsing beacon
  ▼
[apps/mobile/src/services/api.ts]
  │ mobileApi.sendLocationPing(lat, lng)
  ▼ (HTTP POST /responder/location)
[PostGIS Database]
  Stores responder telemetry for closest-unit proximity dispatch
```

### 1. The Hardware Stream (`location.ts`)
```typescript
subscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.Balanced, // Saves battery compared to Navigation accuracy
    timeInterval: 4000,                  // Updates every 4 seconds
    distanceInterval: 5,                 // Or whenever responder moves 5 meters
  },
  (loc) => {
    const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    locationWatchers.forEach((cb) => cb(coords));
  }
);
```

### 2. The Native-to-WebView Bridge (`LeafletMapView.tsx`)
Because Leaflet is running inside an isolated HTML webpage inside the React Native `<WebView>`, React Native and Leaflet cannot access the same JavaScript memory.
- **The Bridge:**
  React Native serializes coordinates into JSON string and injects it into the WebView HTML:
  ```typescript
  var initialCenter = [selfData.lat || BHOPAL[0], selfData.lng || BHOPAL[1]];
  var selfMarker = L.marker(initialCenter, { icon: selfIcon }).addTo(map);
  ```
- **The Recenter Button:**
  ```javascript
  window.recenterBhopal = function() {
    var target = [selfData.lat || BHOPAL[0], selfData.lng || BHOPAL[1]];
    map.flyTo(target, 14, { duration: 0.8 });
  };
  ```

### 3. Why was this designed this way?
- If we didn't run `watchPositionAsync`, dispatchers would see stale positions and might assign a fire or medical emergency to a responder who has already driven 10 km away.

---

## 5. The 2-Minute Revision Cheat Sheet

Whenever you open a new repository or return to this project after months away, run through this mental checklist:

| Step | Question to Ask | What File to Inspect |
| :--- | :--- | :--- |
| **1. Topology** | Where does code execute? Where is the entry point? | `App.tsx`, `main.tsx`, `main.py` |
| **2. Data Contracts** | What are the entities and their allowable states? | `types.ts`, `schemas/*.py` |
| **3. Reactivity** | Where does data live in memory? Is it local, DB, or live socket? | `useState`, `realtime.ts` |
| **4. Vertical Trace** | Can I follow ONE button click down to the DB and back? | `SOSRadarButton` ➔ `api.ts` ➔ router |
| **5. Subsystems** | Why does this tricky code exist? What hardware does it bridge? | `location.ts` (GPS), `LeafletMapView` |
| **6. Build Pipeline** | How does code compile into an executable? | `.github/workflows/build-apk.yml` |
| **7. Active Probing** | What happens if I insert a `console.log` or sabotage an endpoint? | Terminal output, network tab |

*Keep this guide bookmarked in `docs/HOW_TO_UNDERSTAND_THE_CODEBASE.md` whenever you need to onboard into or audit any complex software codebase.*
