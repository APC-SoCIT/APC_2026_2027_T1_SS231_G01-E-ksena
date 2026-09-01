# E-ksena Mobile App Setup Guide

This guide explains how to pull the code from GitHub and successfully build the Android application on a new device or for a new team member.

> [!IMPORTANT]
> **Mapbox Secret Key Requirement**
> For security reasons, the Mapbox Secret API token was removed from GitHub. If you try to build the app immediately after cloning, **it will fail** because the Mapbox SDK requires this secret token to download. Follow Step 3 carefully!

## Prerequisites
Before starting, ensure the new computer has the following installed:
- [Node.js](https://nodejs.org/)
- [Android Studio](https://developer.android.com/studio) (with Android SDK installed)
- Expo CLI (
pm install -g expo-cli)

---

## Step 1: Clone the Repository
Open a terminal and clone the repository to a short path on your computer (e.g., D:\eksena or C:\eksena).
> [!WARNING]
> **Avoid long folder paths!** Do not clone into deep folders like Desktop/Projects/School/Mobile-App/.... The C++ build system for React Native will crash if the path length exceeds Windows limits.

`ash
git clone https://github.com/APC-SoCIT/APC_2026_2027_T1_SS231_G01-E-ksena.git
cd APC_2026_2027_T1_SS231_G01-E-ksena
git checkout Mobile-App-w/-WebRTC
`

## Step 2: Install Dependencies
Navigate into the rontend folder and install all the Node modules:
`ash
cd frontend
npm install --legacy-peer-deps
`

## Step 3: Add the Mapbox Secret Token (CRITICAL)
Because we hid the secret token from GitHub, you must manually recreate the gradle.properties file on the new machine.

1. Inside the rontend/android folder, create a new file named exactly gradle.properties.
2. Open that file in your text editor and paste the following exactly:

`properties
MAPBOX_DOWNLOADS_TOKEN=sk.eyJ1IjoicGV0ZXItMTExMSIsImEiOiJjbXNydnBlaTAwMW16MnpzY2s2Y2FsNGtlIn0.Lx_sg_vcr9_PfoHMiiN18g
`

3. Save the file. (This file is already listed in .gitignore so it will never be uploaded to GitHub).

## Step 4: Run the Backend Server
The mobile app needs the backend server running to handle incidents and WebRTC signaling.
Open a **new, separate terminal window**:
`ash
cd backend
npm install
node server.js
`

## Step 5: Build and Run the Android App
Go back to your rontend terminal. 
Make sure your Android Emulator is running (or a physical Android phone is plugged in with USB Debugging enabled).

Run the native Android build:
`ash
npx expo run:android
`

> [!NOTE]
> The first time you run this command on a new computer, it will take **10 to 20 minutes** to download all Android dependencies and compile the C++ code for WebRTC and Mapbox. Let it finish completely.

Once it says **BUILD SUCCESSFUL**, the app will automatically open on the emulator!