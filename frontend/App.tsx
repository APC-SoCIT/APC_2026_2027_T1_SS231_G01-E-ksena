import React from 'react';
import App from './src/App';

/**
 * Root component
 *
 * For local development, the backend API base URL is configured via:
 * - Expo config `extra.API_BASE_URL` in `app.json`, or
 * - `EXPO_PUBLIC_API_BASE_URL` env var.
 *
 * The `ReportService` reads those values directly, so we keep this file
 * simple and avoid hard‑coding any IPs or paths here.
 */
const Root = () => {
  return <App />;
};

export default Root;

