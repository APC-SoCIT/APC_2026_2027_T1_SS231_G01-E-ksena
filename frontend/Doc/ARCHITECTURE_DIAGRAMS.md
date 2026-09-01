# E-KSENA Flow Diagram & Architecture

## Complete User Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     MOBILE APP (React Native)                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  HomeScreen                                                       │
│  ├─ Welcome user                                                  │
│  └─ "Press to Send Report" button                                │
│                                                                   │
│         ↓ User taps video button                                  │
│                                                                   │
│  VideoCameraScreen                                               │
│  ├─ Request camera permission                                    │
│  ├─ Show camera preview                                          │
│  └─ Display recording controls                                   │
│                                                                   │
│         ↓ User taps "Start Emergency Recording"                  │
│                                                                   │
│  Recording Simulation                                            │
│  ├─ Show "RECORDING" indicator                                   │
│  ├─ Show "AI Analyzing..." overlay                               │
│  └─ Auto-stop after 5 seconds                                    │
│                                                                   │
│         ↓ Recording stops                                         │
│                                                                   │
│  sendVideoReport() called                                        │
│  ├─ Create video file URI: "video_1767934672872.mp4"            │
│  ├─ Get user location (latitude, longitude, address)             │
│  └─ Call apiClient.post('/report-incident', {...})              │
│                                                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ HTTP POST
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /api/report-incident                                       │
│  ├─ Receive: {lat, lng, user_phone_number, location_address}    │
│  ├─ Create incident record in Supabase                           │
│  │  └─ INSERT into incidents table                              │
│  ├─ Return incident_id                                           │
│  └─ Trigger async AI analysis (setTimeout 4000ms)                │
│                                                                   │
│         [4 seconds pass...]                                       │
│                                                                   │
│  AI Analysis (Async, in setTimeout callback)                    │
│  ├─ Randomly pick emergency type (fire/medical/police)          │
│  ├─ Query responders: SELECT * FROM emergency_responders        │
│  │  WHERE service_type = 'fire' AND is_active = true            │
│  ├─ Randomly select one responder from list                      │
│  └─ UPDATE incident SET responder_phone_number = '...'          │
│                                                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Meanwhile in Mobile App...
                         │
┌─────────────────────────────────────────────────────────────────┐
│ Mobile waits 5 seconds for AI to complete                        │
│ await new Promise(resolve => setTimeout(resolve, 5000))         │
└─────────────────────────┬───────────────────────────────────────┘
                         │
                         │ After 5 seconds
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│                    MOBILE APP (continued)                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  getIncidentDetails() called                                     │
│  └─ Call apiClient.get('/incident/:incidentId')                │
│                                                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ HTTP GET
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│                    BACKEND (continued)                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  GET /api/incident/:incidentId                                   │
│  ├─ Query incident from database                                 │
│  ├─ Get responder_phone_number from incident record              │
│  ├─ Query responder details:                                     │
│  │  SELECT name, phone_number, location_lat, location_lng,      │
│  │         station_address, service_type                         │
│  │  FROM emergency_responders                                    │
│  │  WHERE phone_number = <responder_phone_number>               │
│  ├─ Build response:                                              │
│  │  {                                                            │
│  │    "incident": {                                              │
│  │      "id": "...",                                             │
│  │      "location": { "latitude": 14.531, "longitude": 121.021}, │
│  │      "assigned_dispatcher": {                                 │
│  │        "id": "+12345678901",                                  │
│  │        "name": "Fire Station #1",                             │
│  │        "phone": "+12345678901"                                │
│  │      },                                                       │
│  │      "responder_base": {                                      │
│  │        "latitude": 14.5500,                                   │
│  │        "longitude": 121.0200,                                 │
│  │        "name": "Fire Station #1",                             │
│  │        "address": "123 Main St"                               │
│  │      }                                                        │
│  │    }                                                          │
│  │  }                                                            │
│  └─ Return to mobile app                                         │
│                                                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ HTTP Response with responder data
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│                    MOBILE APP (continued)                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  handleReportSuccess()                                           │
│  ├─ Parse responder data                                         │
│  ├─ Set responder start position from responder_base             │
│  ├─ Call setPendingResponderRoute({...})                         │
│  └─ Show success alert with "View Tracking" button              │
│                                                                   │
│         ↓ User taps "View Tracking"                              │
│                                                                   │
│  Navigation to TrackingScreen                                    │
│  ├─ Pass params: incidentId, userLocation, responderLocation    │
│  └─ Launch TrackingScreen with map                               │
│                                                                   │
│  TrackingScreen (NEW)                                            │
│  ├─ Initialize MapView with responder region                     │
│  ├─ Add 3 markers:                                               │
│  │  ├─ Blue (user): { lat: 14.531, lng: 121.021 }              │
│  │  ├─ Red (responder): { lat: 14.550, lng: 121.020 }          │
│  │  └─ Yellow (base): { lat: 14.550, lng: 121.020 }            │
│  ├─ Draw polyline (dashed line connecting markers)               │
│  ├─ Calculate distance using Haversine formula                   │
│  ├─ Calculate ETA: distance / 40 km/h * 60 minutes              │
│  └─ Display:                                                     │
│     ├─ Dispatcher name: "Fire Station #1"                        │
│     ├─ Distance: "6.82 km"                                       │
│     ├─ ETA: "10 minutes"                                         │
│     ├─ Call button                                               │
│     └─ Message button                                            │
│                                                                   │
│         ✨ DONE! Responder tracking visible ✨                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

```
App.tsx (Root)
│
├─ AuthContext
│  └─ AuthStack
│     └─ LoginScreen, RegistrationScreen, VerificationScreen
│
└─ MainStack (After Login)
   ├─ MainTabs (Bottom Tab Navigation)
   │  ├─ HomeScreen
   │  ├─ VideoCameraScreen ← User starts here
   │  └─ ProfileScreen
   │
   ├─ ChatScreen (Modal overlay)
   ├─ CallingScreen (Modal overlay)
   │
   └─ TrackingScreen ✨ NEW ← Navigated to after video report
      └─ Shows map with responder location
```

---

## Data Flow - Request/Response

### Request Flow

```
Mobile App
    │
    ├─ sendVideoReport()
    │  └─ POST /api/report-incident
    │     ├─ lat: 14.5310248
    │     ├─ lng: 121.0215128
    │     ├─ user_phone_number: "+639123456789"
    │     └─ location_address: "Humabon Makati"
    │
    └─ getIncidentDetails()
       └─ GET /api/incident/{incidentId}
```

### Response Flow

```
Backend Response 1: POST /api/report-incident
{
  "success": true,
  "message": "Emergency report received. AI analysis in progress...",
  "incident_id": "abc-123-def-456"
}

[4 seconds pass - AI analyzes & assigns responder]

Backend Response 2: GET /api/incident/{incidentId}
{
  "success": true,
  "incident": {
    "id": "abc-123-def-456",
    "user_phone_number": "+639123456789",
    "responder_phone_number": "+12345678901",
    "service_type": "fire",
    "location": {
      "latitude": 14.5310248,
      "longitude": 121.0215128,
      "address": "Humabon Makati"
    },
    "status": "assigned",
    "created_at": "2026-01-09T04:58:07.919Z",
    "assigned_at": "2026-01-09T04:58:11.000Z",
    "assigned_dispatcher": {
      "id": "+12345678901",
      "name": "Fire Station #1",
      "phone": "+12345678901"
    },
    "responder_base": {
      "latitude": 14.5500,
      "longitude": 121.0200,
      "name": "Fire Station #1",
      "address": "123 Main St, Manila"
    }
  }
}
```

---

## Database Schema Relationships

```
┌────────────────────────────────┐
│   emergency_responders         │
├────────────────────────────────┤
│ id (UUID) PK                   │
│ phone_number (TEXT) UNIQUE     │ ◄───────┐
│ name (TEXT)                    │         │
│ service_type (fire|med|police) │         │
│ location_lat (NUMERIC)         │         │
│ location_lng (NUMERIC)         │         │
│ station_address (TEXT)         │         │
│ is_active (BOOLEAN)            │         │
│ created_at (TIMESTAMP)         │         │
└────────────────────────────────┘         │
                                           │
                                    (Foreign Key)
                                           │
                                ┌──────────┴──────────┐
                                │                     │
┌──────────────────────────────────┐                 │
│        incidents                 │                 │
├──────────────────────────────────┤                 │
│ id (UUID) PK                     │                 │
│ user_phone_number (TEXT)         │                 │
│ responder_phone_number ──────────┴─► REFERENCES   │
│ service_type (fire|med|police)   │                 │
│ location_lat (NUMERIC)           │ ◄── References emergency_responders
│ location_lng (NUMERIC)           │
│ location_address (TEXT)          │
│ video_url (TEXT)                 │
│ status (pending|assigned|...) ───┤
│ detected_at (TIMESTAMP)          │
│ assigned_at (TIMESTAMP)          │
│ created_at (TIMESTAMP)           │
└──────────────────────────────────┘
```

---

## Timing Sequence

```
Timeline:
─────────────────────────────────────────────────────────────────

0 ms:
└─ User taps "Start Emergency Recording"

100 ms:
└─ Recording starts, "RECORDING" indicator shown

2 sec:
└─ "Analyzing..." overlay appears

5 sec:
└─ Recording stops, "REAL API Stopping video recording..."

5 sec:
└─ POST /api/report-incident sent to backend

10 ms (on backend):
└─ Incident created, setTimeout(4000) started

4 sec (on backend):
└─ AI analysis completes, responder assigned

5 sec (on mobile):
└─ getIncidentDetails() called
└─ GET /api/incident/:id sent to backend

~50 ms (on backend):
└─ Response sent back with responder data

5 sec (on mobile):
└─ Response received: assigned_dispatcher + responder_base populated
└─ Success alert shown with "View Tracking" button

6 sec:
└─ User taps "View Tracking"
└─ TrackingScreen loads with map

7 sec:
└─ Map rendered with 3 markers and connecting line
└─ ✨ Responder tracking visible!

─────────────────────────────────────────────────────────────────

Total time from user action to responder visible: ~7 seconds
```

---

## Error Handling Flow

```
┌─ Request sent to backend
│
├─ Backend responds successfully? ────────► Process response
│  │
│  NO (timeout/network error)
│  │
│  └─ Create offline incident
│     └─ Set fallback responder location
│        └─ Show success message
│           └─ User can tap "View Tracking"
│              └─ Shows map with estimated responder location
│
└─ Continue to TrackingScreen with data
   (either real responder or fallback)
```

---

## Component Relationships

```
TrackingScreen
│
├─ MapView (react-native-maps)
│  ├─ Marker (Blue - User)
│  ├─ Marker (Red - Responder)
│  ├─ Marker (Yellow - Base Station)
│  └─ Polyline (dashed connecting line)
│
├─ Header
│  ├─ Back button
│  ├─ Title
│  └─ Incident ID
│
└─ Info Panel
   ├─ Dispatcher name
   ├─ Distance
   ├─ ETA
   └─ Action Buttons
      ├─ Call button
      └─ Message button
```

---

## State Management

```
VideoCameraScreen State:
{
  hasPermission: boolean,
  isRecording: boolean,
  isAnalyzing: boolean,
  isEmergencyDetected: boolean,
  cameraType: 'front' | 'back'
}

TrackingScreen Props:
{
  incidentId: string,
  userLocation: { latitude, longitude, address },
  responderLocation: { latitude, longitude },
  responderBase: { latitude, longitude, name, address },
  dispatcherName: string,
  dispatcherPhone: string
}

TrackingScreen State:
{
  mapRegion: { latitude, longitude, latitudeDelta, longitudeDelta },
  distance: number,
  eta: string
}
```

---

## Key Calculations

### Haversine Distance Formula
```
Used in: TrackingScreen.tsx

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * PI / 180;
  const dLon = (lon2 - lon1) * PI / 180;
  const a = sin(dLat/2)² + cos(lat1*PI/180) * cos(lat2*PI/180) * sin(dLon/2)²;
  const c = 2 * atan2(√a, √(1-a));
  return R * c;
};

Example:
├─ User: 14.5310°N, 121.0215°E
├─ Responder: 14.5500°N, 121.0200°E
└─ Distance: ~2.1 km
```

### ETA Calculation
```
Used in: TrackingScreen.tsx

const avgSpeed = 40; // km/h (urban traffic)
const etaMinutes = Math.round((distance / avgSpeed) * 60);

Example:
├─ Distance: 6.82 km
├─ Speed: 40 km/h
└─ ETA: ~10 minutes
```

---

This architecture ensures:
✅ Responsive UI
✅ Reliable data flow
✅ Proper error handling
✅ Offline fallbacks
✅ Clear separation of concerns

