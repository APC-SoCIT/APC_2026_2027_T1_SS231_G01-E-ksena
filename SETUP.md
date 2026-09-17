# E-KSENA Local Setup Guide (QA & Security Testing)

This guide provides step-by-step instructions for the QA and Security team to run the full E-KSENA stack locally. The stack consists of three parts:
1. **React Native Mobile App (Frontend)**
2. **Node.js Express API (Backend)**
3. **Python AI Video Classification (Microservice)**

---

## Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js** (v18+ recommended)
- **Python** (v3.9 - v3.11 recommended)
- **Git**
- **Android Studio** (for testing the mobile app on an emulator) or physical device with Expo Go.

---

## 1. Backend Setup (Node.js)

The backend acts as a bridge between the mobile app, Supabase, and the AI microservice.

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd eksena/backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables. Create a `.env` file in the `backend` directory:
   ```env
   PORT=3000
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   ```
4. Start the server:
   ```bash
   node server.js
   ```
   *The server should now be running on `http://localhost:3000`.*

---

## 2. AI Microservice Setup (Python)

The AI microservice receives videos from the Supabase bucket and runs a custom PyTorch Neural Network to classify the emergency.

1. Open a **new** terminal and navigate to the backend directory:
   ```bash
   cd eksena/backend
   ```
2. **Crucial:** You must obtain the `emergency_ai3.pth` model weights file from the development team and place it directly inside the `eksena/backend/` folder.
3. Install the required Python packages. 
   *(Note: Specific versions of numpy and opencv are required to prevent PyTorch compatibility crashes on Windows).*
   ```bash
   pip install flask requests torch torchvision "numpy<2" "opencv-python<4.10"
   ```
4. Start the AI service:
   ```bash
   python ai_service.py
   ```
   *You should see a message saying `✅ Custom PyTorch Model loaded successfully!`*

---

## 3. Frontend Setup (React Native / Expo)

The frontend is a React Native mobile application. 

1. Open a **new** terminal and navigate to the frontend directory:
   ```bash
   cd eksena/frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables. Create a `.env` file in the `frontend` directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # Change 192.168.x.x to the IPv4 address of the computer running your Node.js backend
   EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:3000/api
   ```
4. Start the app:
   ```bash
   npx expo start
   ```
   *Press `a` to run on an Android emulator, or scan the QR code using the Expo Go app on a physical device.*

---

## Security & QA Testing Notes

### Auth Bypass for Testing
For rapid QA testing without hitting Supabase SMS/Email rate limits, a hardcoded development bypass is active on the `LoginScreen`. 
- **Email:** `test@test.com`
- **OTP:** `000000`

### Video Classification Flow
To test the AI video classification:
1. Log in to the mobile app.
2. Tap the **Video Emergency** button.
3. A 5-second video will be recorded automatically.
4. The app will upload the `.mp4` to the Supabase `incident-videos` bucket and pass the public URL to the Node backend.
5. The Node backend passes the URL to the Python AI service.
6. The Python service downloads the video locally, extracts 16 frames, runs them through the PyTorch model, and returns a classification (Fire, Police, or Medical) with a confidence score.

### Network Requirements
If you are testing on a physical device, ensure the device and the host machine running the backend/AI servers are on the **same Wi-Fi network**, and that your firewall allows inbound connections on ports `3000` and `5000`.
