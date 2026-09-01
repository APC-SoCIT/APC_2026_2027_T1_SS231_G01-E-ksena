# Node Modules Reinstall and Debug Guide

This guide provides instructions on how to reinstall `node_modules` for both the Node.js backend and the React Native app in the E-ksena Mobile project. It also includes debugging tips for common issues.

## Prerequisites

- Ensure Node.js is installed on your system. You can download it from [nodejs.org](https://nodejs.org/).
- For the React Native app, ensure you have the necessary dependencies for React Native development, such as Android Studio or Xcode, depending on your target platform.

## Backend (Node.js)

### Reinstalling node_modules

1. Navigate to the backend directory:
   ```
   cd APC_2025_2026_T1_SS231_G06-Eksena-Mobile-app/Mobile-App/backend
   ```

2. Remove any existing node_modules directory (if present):
   ```
   rm -rf node_modules
   ```

3. Clear npm cache (optional but recommended):
   ```
   npm cache clean --force
   ```

4. Install dependencies using npm:
   ```
   npm install
   ```

### Debugging

- **Common Issues:**
  - **Permission Errors:** Run the commands with `sudo` if on Linux/Mac, or as Administrator on Windows.
  - **Network Issues:** Ensure you have a stable internet connection. If behind a proxy, configure npm proxy settings.
  - **Package Lock Issues:** If `package-lock.json` is corrupted, delete it and run `npm install` again.

- **Debugging Steps:**
  1. Check Node.js and npm versions:
     ```
     node --version
     npm --version
     ```
  2. Run npm audit to check for vulnerabilities:
     ```
     npm audit
     ```
  3. Verify package.json integrity:
     - Open `package.json` and ensure all dependencies are correctly listed.
  4. Run npm install with verbose output:
     ```
     npm install --verbose
     ```
  5. If issues persist, try using Yarn as an alternative:
     ```
     yarn install
     ```

## React Native App

### Reinstalling node_modules

1. Navigate to the React Native app directory:
   ```
   cd APC_2025_2026_T1_SS231_G06-Eksena-Mobile-app/Mobile-App/E-ksena_Mobile_1st
   ```

2. Remove any existing node_modules directory (if present):
   ```
   rm -rf node_modules
   ```

3. Clear npm cache (optional but recommended):
   ```
   npm cache clean --force
   ```

4. Install dependencies using npm:
   ```
   npm install
   ```

5. For Expo projects, also install Expo CLI if not already installed:
   ```
   npm install -g @expo/cli
   ```

### Debugging

- **Common Issues:**
  - **Expo Issues:** Ensure Expo CLI is up to date. Run `expo --version` to check.
  - **Platform-Specific Errors:** For Android, ensure Android SDK is properly configured. For iOS, ensure Xcode is installed and configured.
  - **Dependency Conflicts:** Check for conflicting versions in package.json.

- **Debugging Steps:**
  1. Check Node.js, npm, and Expo versions:
     ```
     node --version
     npm --version
     expo --version
     ```
  2. Verify app.json and package.json:
     - Ensure the Expo SDK version matches the installed dependencies.
  3. Run npm install with verbose output:
     ```
     npm install --verbose
     ```
  4. Clear Expo cache:
     ```
     expo r -c
     ```
  5. If using Yarn, try:
     ```
     yarn install
     ```
  6. For build issues, run:
     ```
     expo install --fix
     ```

## General Tips

- Always commit your package-lock.json or yarn.lock to version control to ensure consistent installs across environments.
- If reinstalling doesn't resolve issues, consider deleting node_modules, package-lock.json, and reinstalling.
- For persistent issues, check the project's README.md or documentation for specific setup instructions.
- Join relevant communities (e.g., Stack Overflow, Expo forums) for additional support.

If you encounter specific errors, provide the error messages for more targeted assistance.
