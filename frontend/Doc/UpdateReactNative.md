
---

# 📱 React Native App Maintenance Guide

This document outlines the standard procedures for keeping the application's dependencies up-to-date and ensuring the environment is secure.

## 🛠 Maintenance Procedures

### 1. Update Dependencies

Keeping packages current ensures access to the latest features and bug fixes while resolving many deprecation warnings.

* **Minor & Patch Updates:** Run the following to update all packages within the semver ranges defined in `package.json`:
```
npm update

```


* **Expo-Specific Syncing:**
If using Expo, use the official tool to align package versions with your current SDK and fix common compatibility issues:
```
npx expo install --fix

```


* **Verification:**
Always verify the build after updating:
```
npx expo-doctor

//then you can start
npm start

```


*Check the terminal and mobile bundler for any regression errors or "Peer Dependency" warnings.*

---

### 2. Security Audits & Vulnerability Patching

Regularly audit the dependency tree to protect the application from known security vulnerabilities.

* **Scan for Issues:**
Generate a detailed report of current vulnerabilities:
```
npm audit

```


* **Automatic Patching:**
Apply safe, non-breaking security patches:
```
npm audit fix

```


* **Manual Resolution:**
If `npm audit` reports vulnerabilities that require a major version bump, update the specific package manually. For example:
```
# Example: updating expo-router to the latest version
npm install expo-router@latest

```



---

## 📋 Checklist for Updates

* [ ] Run `npm update` and `npx expo install --fix`.
* [ ] Run `npm audit fix` to clear security flags.
* [ ] Clear metro cache if UI issues persist (`npx expo start -c`).
* [ ] Test core features on an emulator or physical device.
* [ ] Commit `package.json` and `package-lock.json` changes.

---

