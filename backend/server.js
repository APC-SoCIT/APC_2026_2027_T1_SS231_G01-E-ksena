/**
 * E-KSENA Backend Server
 * Node.js Express server for emergency incident reporting and responder management
 * 
 * Endpoints:
 * - POST /api/report-incident - Citizen reports emergency
 * - GET /api/incident/:incidentId - Get incident details
 * - POST /api/responder-location - Update responder location (OPTIONAL)
 * - GET /api/incident/:incidentId/responder-location - Get responder location (OPTIONAL)
 * - GET /health - Health check
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8081', 'http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.includes('vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      process.env.NODE_ENV === 'development'
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const getOrCreateReporterUser = async (phoneNumber, candidateUserId) => {
  const normalizedPhone = phoneNumber?.trim();

  // 1. Check if candidateUserId is already a valid user_id in the users table
  if (candidateUserId) {
    const { data: userById } = await supabase
      .from('users')
      .select('user_id, user_phone_number')
      .eq('user_id', candidateUserId)
      .maybeSingle();

    if (userById?.user_id) {
      return {
        userId: userById.user_id,
        phone: userById.user_phone_number || normalizedPhone || 'unknown'
      };
    }

    // 2. Check if candidateUserId is an auth_user_id (Supabase Auth UID)
    const { data: userByAuthId } = await supabase
      .from('users')
      .select('user_id, user_phone_number')
      .eq('auth_user_id', candidateUserId)
      .maybeSingle();

    if (userByAuthId?.user_id) {
      return {
        userId: userByAuthId.user_id,
        phone: userByAuthId.user_phone_number || normalizedPhone || 'unknown'
      };
    }
  }

  // 3. Look up by normalized phone number
  if (normalizedPhone && normalizedPhone !== 'unknown') {
    const { data: existingUser } = await supabase
      .from('users')
      .select('user_id, user_phone_number')
      .eq('user_phone_number', normalizedPhone)
      .maybeSingle();

    if (existingUser?.user_id) {
      return {
        userId: existingUser.user_id,
        phone: existingUser.user_phone_number
      };
    }
  }

  // 4. Fallback: query default 'unknown' reporter user
  const { data: defaultUser } = await supabase
    .from('users')
    .select('user_id, user_phone_number')
    .eq('user_phone_number', 'unknown')
    .maybeSingle();

  if (defaultUser?.user_id) {
    return {
      userId: defaultUser.user_id,
      phone: defaultUser.user_phone_number || normalizedPhone || 'unknown'
    };
  }

  // 5. If not found, create new reporter row
  const { data: createdUser, error: insertError } = await supabase
    .from('users')
    .insert({
      user_phone_number: normalizedPhone || 'unknown',
      auth_user_id: candidateUserId || null,
      full_name: null,
      email: null
    })
    .select('user_id, user_phone_number')
    .single();

  if (insertError) {
    // If insert failed due to concurrent race, fetch whatever is there
    const { data: raceUser } = await supabase.from('users').select('user_id, user_phone_number').limit(1).single();
    if (raceUser?.user_id) {
      return {
        userId: raceUser.user_id,
        phone: raceUser.user_phone_number || normalizedPhone || 'unknown'
      };
    }
    throw insertError;
  }

  return {
    userId: createdUser.user_id,
    phone: createdUser.user_phone_number || normalizedPhone || 'unknown'
  };
};

// ============================================
// Authentication & Role Middleware
// ============================================
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  // Accept an API secret for service-to-service calls or Supabase JWT for users
  if (token === process.env.API_SECRET_KEY) {
    req.user = { role: 'service_account' };
    return next();
  }

  // Verify Supabase JWT
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }

  req.user = user;
  next();
};

const requireResponderRole = (req, res, next) => {
  // In a full implementation, you would check req.user against a roles table or custom claims.
  // For now, this is a placeholder to demonstrate RBAC enforcement.
  if (req.user && req.user.role === 'service_account') {
    return next(); // service accounts bypass role checks
  }

  // TODO: Add actual check if user is a responder
  console.log(`[AUTH] Checking responder role for user ${req.user?.id}`);

  // We'll let it pass for now so we don't break existing flows, but log it
  next();
};

// ============================================
// Health Check Endpoint
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'E-KSENA Backend API'
  });
});

// ============================================
// ENDPOINT 1: Report Emergency Incident
// ============================================
app.post('/api/report-incident', async (req, res) => {
  try {
    const { video_url, lat, lng, user_phone_number, location_address, user_id, service_type } = req.body;

    // Validate required fields
    if (!lat || !lng || !user_phone_number) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: lat, lng, user_phone_number'
      });
    }

    console.log(`[REPORT] New incident reported by ${user_phone_number} at ${lat}, ${lng} (service: ${service_type || 'auto'})`);

    const reporterUser = await getOrCreateReporterUser(user_phone_number, user_id);
    const reporterUserId = reporterUser.userId;
    const finalReporterPhone = (user_phone_number && user_phone_number !== 'unknown' && user_phone_number !== '+639123456789')
      ? user_phone_number
      : (reporterUser.phone || user_phone_number);

    // Resolve location_address: if null/empty, reverse geocode or use GPS coordinate string fallback
    let resolvedAddress = location_address && String(location_address).trim() ? String(location_address).trim() : null;

    if (!resolvedAddress && lat && lng) {
      const mapboxToken = process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoicGV0ZXItMTExMSIsImEiOiJjbXBlOGx0bW4wMXl1MnBxejEyaWJ0ZmZhIn0.njE1TKxllt2JYRt2RmqfnA';
      try {
        const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1`;
        const geoResp = await fetch(geoUrl);
        if (geoResp.ok) {
          const geoData = await geoResp.json();
          if (geoData.features && geoData.features.length > 0 && geoData.features[0].place_name) {
            resolvedAddress = geoData.features[0].place_name;
            console.log(`[GEOCODE] Reverse geocoded (${lat}, ${lng}) -> ${resolvedAddress}`);
          }
        }
      } catch (geoErr) {
        console.warn('[GEOCODE] Reverse geocoding failed:', geoErr.message);
      }

      // Hard fallback if geocoding failed or returned empty: format coordinate string so location_address is NEVER NULL
      if (!resolvedAddress) {
        resolvedAddress = `Lat: ${parseFloat(lat).toFixed(6)}, Lng: ${parseFloat(lng).toFixed(6)}`;
      }
    } else if (!resolvedAddress) {
      resolvedAddress = 'Coordinates unavailable';
    }

    // Create incident record with the reporter user reference
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert({
        user_id: reporterUserId,
        user_phone_number: finalReporterPhone,
        incident_location_lat: lat,
        incident_location_lng: lng,
        location_address: resolvedAddress,
        video_url: video_url || 'mock://video' // Mock URL, no actual storage needed for now
      })
      .select()
      .single();

    if (incidentError) {
      console.error('[ERROR] Failed to create incident:', incidentError);
      return res.status(500).json({
        success: false,
        error: incidentError.message || 'Failed to create incident record'
      });
    }

    console.log(`[REPORT] Incident created: ${incident.incident_id}`);

    // If citizen explicitly selected service type (fire/police/medical), use it directly
    const validManualService = ['medical', 'police', 'fire'].includes(String(service_type).toLowerCase())
      ? String(service_type).toLowerCase()
      : null;

    let detectedService = validManualService || 'medical';
    let confidence = validManualService ? 1.0 : 0.85;

    // Call Python AI Microservice only if no manual service type was specified and video is provided
    if (!validManualService) {
      try {
        console.log(`[AI] Sending video to AI Microservice for incident ${incident.incident_id}...`);
        const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5000';
        const aiResponse = await fetch(`${aiUrl}/analyze-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: video_url })
        });

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          if (aiResult.success) {
            detectedService = aiResult.detected_service_type;
            confidence = aiResult.confidence_score;
            console.log(`[AI] AI classified video as: ${detectedService} (Confidence: ${confidence})`);
          } else {
            console.log(`[AI] AI Service returned error: ${aiResult.error}. Using fallback.`);
          }
        } else {
          console.log(`[AI] AI Service unreachable (Status: ${aiResponse.status}). Using fallback classification.`);
        }
      } catch (aiMicroErr) {
        console.warn('[AI] Error in microservice pipeline:', aiMicroErr);
      }
    }

    const { error: aiError } = await supabase.from('ai_analysis').insert({
      incident_id: incident.incident_id,
      detected_service_type: detectedService,
      confidence_score: confidence
    });

    if (aiError) {
      console.error('[ERROR] Failed to insert AI analysis row:', aiError);
    }

      // Find responders for the detected service type with their station coordinates
      // Try case-insensitive matching and handle is_active (true or true-like)
      let { data: responders, error: responderError } = await supabase
        .from('responders')
        .select('responder_id, responder_phone_number, name, service_type, is_active, responder_location_lat, responder_location_lng')
        .ilike('service_type', `%${detectedService}%`)
        .eq('is_active', true);

      // Fallback 1: check if is_active is null or not strictly boolean in database
      if (!responders || responders.length === 0) {
        const { data: fallbackServiceResponders } = await supabase
          .from('responders')
          .select('responder_id, responder_phone_number, name, service_type, is_active, responder_location_lat, responder_location_lng')
          .ilike('service_type', `%${detectedService}%`);

        if (fallbackServiceResponders && fallbackServiceResponders.length > 0) {
          responders = fallbackServiceResponders.filter(r => r.is_active !== false);
        }
      }

      // Fallback 2: If still 0, pick any available active responder regardless of service_type
      if (!responders || responders.length === 0) {
        console.warn(`[WARNING] No active ${detectedService} responders found. Falling back to any active responder...`);
        const { data: anyResponders } = await supabase
          .from('responders')
          .select('responder_id, responder_phone_number, name, service_type, is_active, responder_location_lat, responder_location_lng')
          .eq('is_active', true);

        if (anyResponders && anyResponders.length > 0) {
          responders = anyResponders;
        } else {
          const { data: allResponders } = await supabase
            .from('responders')
            .select('responder_id, responder_phone_number, name, service_type, is_active, responder_location_lat, responder_location_lng')
            .limit(5);
          responders = allResponders || [];
        }
      }

      console.log(`[DEBUG] Responders available for assignment:`, responders?.length);

      if (!responders || responders.length === 0) {
        console.error(`[CRITICAL] No responders found in responders table at all!`);
      } else {
        // Traffic-Aware Optimal Dispatch Selection (Fastest Arrival Time)
        let assignedResponder = responders[0];
        const mapboxToken = process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoicGV0ZXItMTExMSIsImEiOiJjbXBlOGx0bW4wMXl1MnBxejEyaWJ0ZmZhIn0.njE1TKxllt2JYRt2RmqfnA';

        try {
          if (responders.length > 1 && lat && lng && mapboxToken) {
            console.log(`[DISPATCH] Calculating live road traffic ETA for ${responders.length} candidates...`);

            // Check traffic-based driving duration for each candidate station
            const candidatesWithETA = await Promise.all(
              responders.map(async (cand) => {
                const candLat = cand.responder_location_lat ? parseFloat(cand.responder_location_lat) : null;
                const candLng = cand.responder_location_lng ? parseFloat(cand.responder_location_lng) : null;

                if (!candLat || !candLng) {
                  return { responder: cand, durationSec: 999999 };
                }

                try {
                  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${candLng},${candLat};${lng},${lat}?access_token=${mapboxToken}&overview=false`;
                  const resp = await fetch(url);
                  const data = await resp.json();

                  if (data.code === 'Ok' && data.routes && data.routes[0]) {
                    const durationSec = data.routes[0].duration; // live traffic duration in seconds
                    console.log(`[DISPATCH] Candidate ${cand.name} (${cand.responder_id}) -> ETA: ${(durationSec / 60).toFixed(1)} mins`);
                    return { responder: cand, durationSec };
                  }
                } catch (candErr) {
                  console.warn(`[DISPATCH] Failed ETA check for ${cand.name}:`, candErr.message);
                }

                // Fallback Euclidean calculation if traffic API is temporarily unreachable
                const dLat = candLat - lat;
                const dLng = candLng - lng;
                const distApprox = Math.sqrt(dLat * dLat + dLng * dLng);
                return { responder: cand, durationSec: distApprox * 100000 };
              })
            );

            // Sort by lowest duration (fastest arrival time taking traffic into account)
            candidatesWithETA.sort((a, b) => a.durationSec - b.durationSec);
            assignedResponder = candidatesWithETA[0].responder;
            console.log(
              `[DISPATCH] 🏆 Optimal responder selected: ${assignedResponder.name} with fastest ETA: ${(candidatesWithETA[0].durationSec / 60).toFixed(1)} mins`
            );
          } else {
            // If only 1 responder or no coordinates, assign directly
            assignedResponder = responders[0];
          }
        } catch (optimalErr) {
          console.warn('[DISPATCH] Error during traffic ETA evaluation, falling back to first available:', optimalErr);
          assignedResponder = responders[0];
        }

        console.log(
          `[ASSIGN] Selected responder ${assignedResponder.responder_phone_number} (${assignedResponder.name}) for incident ${incident.incident_id}`
        );

        // Create a dispatch row (post‑AI "dispatch" record)
        const { error: dispatchError } = await supabase
          .from('dispatch')
          .insert({
            incident_id: incident.incident_id,
            responder_id: assignedResponder.responder_id,
            status: 'dispatched'
          });

        if (dispatchError) {
          console.error('[ERROR] Failed to create dispatch record:', dispatchError);
        } else {
          console.log(
            `[SUCCESS] Responder ${assignedResponder.responder_phone_number} dispatched for incident ${incident.incident_id}`
          );
        }

        // --- NEW: Sync to legacy 'reports' table for the Web App ---
        try {
          const reportPayload = {
            user_id: reporterUserId,
            incident_id: incident.incident_id,
            content: resolvedAddress || 'Emergency Report',
            classified_as: detectedService,
            report_location_lat: lat,
            report_location_lng: lng,
            video_path: video_url || 'mock://video',
            bucket_id: 'incident-videos',
            is_processed: true,
            status: 'pending',
            responder_username: assignedResponder.name || assignedResponder.responder_phone_number
          };

          const { data: existingReport } = await supabase
            .from('reports')
            .select('report_id')
            .eq('incident_id', incident.incident_id)
            .maybeSingle();

          if (existingReport?.report_id) {
            const { error: updateError } = await supabase
              .from('reports')
              .update(reportPayload)
              .eq('report_id', existingReport.report_id);

            if (updateError) {
              console.warn('[WARNING] Failed to update existing reports record:', updateError.message);
            } else {
              console.log(`[SUCCESS] Updated existing reports record ${existingReport.report_id} for incident ${incident.incident_id}`);
            }
          } else {
            const { error: reportError } = await supabase
              .from('reports')
              .insert(reportPayload);

            if (reportError) {
              if (reportError.code === '23505') {
                console.log(`[INFO] Report row already created for incident ${incident.incident_id} (duplicate prevented).`);
              } else {
                console.error('[ERROR] Failed to sync to reports table:', reportError);
              }
            } else {
              console.log(`[SUCCESS] Synced incident ${incident.incident_id} to legacy reports table`);
            }
          }
        } catch (err) {
          console.error('[ERROR] Exception syncing to reports table:', err);
        }
        // -----------------------------------------------------------

      }

    // Return incident payload once AI + dispatch work is queued/complete
    res.json({
      success: true,
      message: 'Emergency report received. AI analysis in progress...',
      incident_id: incident.incident_id
    });

  } catch (error) {
    console.error('[ERROR] Error in /api/report-incident:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// ENDPOINT 2: Get Incident Details
// ============================================
app.get('/api/incident/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;

    const { data: incident, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('incident_id', incidentId)
      .single();

    if (error || !incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found'
      });
    }

    // Load latest dispatch record for this incident (if any)
    const { data: dispatchRow, error: dispatchError } = await supabase
      .from('dispatch')
      .select('*')
      .eq('incident_id', incident.incident_id)
      .order('dispatched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dispatchError && dispatchError.code !== 'PGRST116') {
      console.log('[DEBUG] Dispatch lookup error:', dispatchError);
    }

    // If we have a dispatch, fetch responder info and build dispatcher/base
    let responderBase = null;
    let assignedDispatcher = null;
    let responderPhoneNumber = null;
    let responder = null;

    if (dispatchRow && dispatchRow.responder_id) {
      console.log(`[DEBUG] Fetching responder info for dispatch responder_id: ${dispatchRow.responder_id}`);
      const { data: responderData, error: responderError } = await supabase
        .from('responders')
        .select('responder_id, name, responder_phone_number, responder_location_lat, responder_location_lng, station_address, service_type')
        .eq('responder_id', dispatchRow.responder_id)
        .single();
      responder = responderData;

      if (!responderError && responder) {
        console.log(`[DEBUG] Responder data retrieved:`, responder);

        responderPhoneNumber = responder.responder_phone_number;

        // Set dispatcher info
        assignedDispatcher = {
          id: responder.responder_id,
          name: responder.name || `${responder.service_type} Responder`,
          phone: responder.responder_phone_number || '',
        };
        console.log(`[DEBUG] Assigned dispatcher:`, assignedDispatcher);

        // Set responder base location
        if (responder.responder_location_lat && responder.responder_location_lng) {
          responderBase = {
            name: responder.name || `${responder.service_type} Station`,
            latitude: parseFloat(responder.responder_location_lat),
            longitude: parseFloat(responder.responder_location_lng),
            address: responder.station_address || null,
          };
          console.log(`[DEBUG] Responder base found:`, responderBase);
        } else {
          console.log(`[DEBUG] Responder missing coordinates - using default offset`);
          responderBase = {
            name: responder.name || 'Responder Location',
            latitude: parseFloat(incident.incident_location_lat) + 0.005,
            longitude: parseFloat(incident.incident_location_lng) - 0.005,
            address: null,
          };
        }
      } else {
        console.log(`[DEBUG] Responder not found or error:`, responderError);
      }
    } else {
      console.log(`[DEBUG] No dispatch record found for incident ${incident.incident_id} yet`);
    }

    // Fetch AI analysis for this incident to get detected service type
    const { data: aiRow } = await supabase
      .from('ai_analysis')
      .select('detected_service_type, service_type, confidence_score')
      .eq('incident_id', incident.incident_id)
      .order('analysis_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const detectedServiceType = aiRow?.detected_service_type || aiRow?.service_type || (assignedDispatcher ? responder?.service_type : null) || 'general';

    res.json({
      success: true,
      incident: {
        id: incident.incident_id,
        user_phone_number: incident.user_phone_number,
        responder_phone_number: responderPhoneNumber,
        service_type: detectedServiceType,
        confidence_score: aiRow?.confidence_score || null,
        location: {
          latitude: parseFloat(incident.incident_location_lat),
          longitude: parseFloat(incident.incident_location_lng),
          address: incident.location_address
        },
        // Use dispatch status if we have a dispatch record; otherwise undefined
        status: dispatchRow?.status || null,
        created_at: incident.created_at,
        assigned_at: dispatchRow?.assigned_at || dispatchRow?.dispatched_at || null,
        assigned_dispatcher: assignedDispatcher,
        responder_base: responderBase,
      }
    });

  } catch (error) {
    console.error('[ERROR] Error in /api/incident/:incidentId:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// ============================================
// Helper: Normalize Philippine phone numbers to E.164 (+639XXXXXXXXX)
const normalizePhilippinePhone = (rawPhone) => {
  if (!rawPhone) return null;
  let cleaned = String(rawPhone).trim().replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    return '+63' + cleaned.slice(1);
  }
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    return '+63' + cleaned;
  }
  if (cleaned.startsWith('639') && cleaned.length === 12) {
    return '+' + cleaned;
  }
  if (cleaned.startsWith('+639')) {
    return cleaned;
  }
  return cleaned;
};

// ============================================
// ENDPOINT: Send SMS via UniSMS (Web App / Dispatcher)
// ============================================
app.post('/api/sms/send', requireAuth, async (req, res) => {
  // 1. Authorization check: only active responders, admins, or service accounts may send SMS
  const userId = req.user?.id;
  const isServiceAccount = req.user?.role === 'service_account';

  if (!isServiceAccount) {
    const [responderRes, adminRes] = await Promise.all([
      supabase.from('responders').select('responder_id').eq('auth_user_id', userId).eq('is_active', true).maybeSingle(),
      supabase.from('admins').select('auth_user_id').eq('auth_user_id', userId).maybeSingle()
    ]);

    const isAuthorized = Boolean(responderRes?.data || adminRes?.data);
    if (!isAuthorized) {
      console.warn(`[SMS] ⛔ Unauthorized send attempt by user ${userId} (not an active responder/admin)`);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only active responders or dispatchers may send SMS messages'
      });
    }
  }

  const { messageId } = req.body;

  // 2. Strict Requirement: messageId is required
  if (!messageId) {
    return res.status(400).json({ success: false, error: 'messageId is required' });
  }

  let phoneNumber = null;
  let message = null;

  // Verify row exists and is direction = 'outbound' and status = 'queued'
  try {
    const { data: dbMsg, error: dbMsgError } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();

    if (!dbMsg) {
      return res.status(404).json({
        success: false,
        error: `Message with id ${messageId} not found in sms_messages`
      });
    }

    // Ensure it is outbound and queued so old or already-sent messages cannot be resent
    if (dbMsg.direction !== 'outbound' || dbMsg.status !== 'queued') {
      console.warn(`[SMS] ⛔ Message ${messageId} cannot be sent: direction='${dbMsg.direction}', status='${dbMsg.status}' (must be direction='outbound' and status='queued')`);
      return res.status(400).json({
        success: false,
        error: `Message cannot be resent. Current status: '${dbMsg.status}', direction: '${dbMsg.direction}'. Only queued outbound messages can be sent.`
      });
    }

    // Read exclusively from the database row (no client fallback)
    phoneNumber = dbMsg.phone || dbMsg.recipient_phone || dbMsg.recipient;
    message = dbMsg.body || dbMsg.content || dbMsg.message;
  } catch (fetchErr) {
    console.error('[SMS] Exception querying sms_messages by messageId:', fetchErr);
    return res.status(500).json({
      success: false,
      error: 'Database error validating messageId'
    });
  }

  phoneNumber = normalizePhilippinePhone(phoneNumber);

  if (!phoneNumber || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: phoneNumber, message'
    });
  }

  const apiKey = process.env.UNISMS_API_KEY;
  if (!apiKey) {
    console.error('[SMS] UNISMS_API_KEY is not configured in backend environment');
    if (messageId) {
      await supabase
        .from('sms_messages')
        .update({ status: 'failed', error: 'UNISMS_API_KEY is not configured on server' })
        .eq('id', messageId);
    }
    return res.status(500).json({
      success: false,
      error: 'UniSMS service is not configured on the server'
    });
  }

  try {
    console.log(`[SMS] Sending UniSMS to ${phoneNumber} (messageId: ${messageId || 'none'})...`);

    const authHeader = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
    const virtualNumber = process.env.UNISMS_VIRTUAL_NUMBER;

    let unismsResponse;
    if (virtualNumber) {
      // 2-way SMS with virtual number
      console.log(`[SMS] Using Virtual Number route: ${virtualNumber}`);
      unismsResponse = await fetch('https://unismsapi.com/api/virtual_numbers/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          from: virtualNumber,
          to: phoneNumber,
          content: message
        })
      });
    } else {
      // Alphanumeric / standard sender_id route
      const senderId = process.env.UNISMS_SENDER_ID || 'Unisoft';
      unismsResponse = await fetch('https://unismsapi.com/api/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          recipient: phoneNumber,
          content: message,
          sender_id: senderId
        })
      });
    }

    const unismsResult = await unismsResponse.json();
    console.log('[SMS] UniSMS response status:', unismsResponse.status, 'body:', unismsResult);

    const isSuccess = unismsResponse.ok && (unismsResult.success !== false && !unismsResult.error);
    const referenceId = unismsResult.id || unismsResult.data?.id || unismsResult.message_id || unismsResult.reference_id || `sms-${Date.now()}`;
    const errorMsg = isSuccess ? null : (unismsResult.message || unismsResult.error || `HTTP ${unismsResponse.status} error`);

    // Update sms_messages row if messageId was provided
    if (messageId) {
      try {
        const updatePayload = isSuccess
          ? { status: 'sent', provider_message_id: String(referenceId) }
          : { status: 'failed', error: String(errorMsg) };

        const { error: updateError } = await supabase
          .from('sms_messages')
          .update(updatePayload)
          .eq('id', messageId);

        if (updateError) {
          console.error('[SMS] Failed to update sms_messages row:', updateError);
        } else {
          console.log(`[SMS] Updated sms_messages row ${messageId} -> ${isSuccess ? 'sent' : 'failed'}`);
        }
      } catch (dbErr) {
        console.error('[SMS] DB exception updating sms_messages:', dbErr);
      }
    }

    if (isSuccess) {
      return res.json({
        success: true,
        referenceId: String(referenceId)
      });
    } else {
      return res.status(unismsResponse.status >= 400 ? unismsResponse.status : 500).json({
        success: false,
        referenceId: null,
        error: errorMsg
      });
    }

  } catch (error) {
    console.error('[SMS] Exception dispatching UniSMS:', error);

    if (messageId) {
      try {
        await supabase
          .from('sms_messages')
          .update({ status: 'failed', error: error.message })
          .eq('id', messageId);
      } catch (dbErr) {
        console.error('[SMS] DB exception on failure update:', dbErr);
      }
    }

    return res.status(500).json({
      success: false,
      referenceId: null,
      error: error.message || 'Internal server error while sending SMS'
    });
  }
});

// ============================================
// ENDPOINT: UniSMS Inbound Webhook
// ============================================
app.post('/api/sms/webhook', async (req, res) => {
  try {
    // 1. Strict Webhook Secret Verification: reject if secret is not configured or mismatch
    const expectedSecret = process.env.UNISMS_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.warn('[SMS WEBHOOK] ⛔ Rejected: UNISMS_WEBHOOK_SECRET is not configured on the server');
      return res.status(401).json({ success: false, error: 'Webhook secret is not configured on server' });
    }

    const incomingSecret =
      req.headers['webhook-secret-key'] ||
      req.headers['x-webhook-secret'] ||
      req.headers['x-api-key'];

    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.warn('[SMS WEBHOOK] ⛔ Unauthorized webhook request: Invalid or missing webhook-secret-key header');
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid webhook secret' });
    }

    const payload = req.body || {};
    console.log('[SMS WEBHOOK] Inbound event received for messageId:', payload.message?.id || payload.id || 'N/A');

    // Support nested payload format (payload.message.*) for txt.received, as well as top-level fields
    const rawPhone =
      payload.message?.from ||
      payload.message?.sender ||
      payload.from ||
      payload.sender ||
      payload.phone ||
      payload.data?.phone ||
      payload.data?.from;

    const body =
      payload.message?.content ||
      payload.message?.text ||
      payload.message?.body ||
      payload.content ||
      payload.text ||
      payload.body ||
      payload.data?.content ||
      payload.data?.text;

    const providerMessageId =
      payload.message?.id ||
      payload.message?.message_id ||
      payload.id ||
      payload.message_id ||
      payload.data?.id;

    const phone = normalizePhilippinePhone(rawPhone);

    if (phone && body) {
      const { error: insertError } = await supabase
        .from('sms_messages')
        .insert({
          phone: phone,
          body: body,
          direction: 'inbound',
          status: 'received',
          provider_message_id: providerMessageId ? String(providerMessageId) : null
        });

      if (insertError) {
        console.error('[SMS WEBHOOK] Failed to insert inbound message into sms_messages:', insertError);
      } else {
        console.log(`[SMS WEBHOOK] ✅ Successfully recorded inbound SMS from ${phone}`);
      }
    } else {
      console.warn('[SMS WEBHOOK] ⚠️ Skipping webhook insert: missing phone or body', { rawPhone, phone, hasBody: !!body });
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('[SMS WEBHOOK] Error processing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINT: Citizen In-App SMS Reply (Option 2 Fallback)
// ============================================
app.post('/api/chat/reply', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    const trimmedMessage = message.trim();
    const authUser = req.user;

    // 1. Resolve citizen phone number securely
    let citizenPhone = authUser?.phone || authUser?.user_metadata?.phone;

    if (!citizenPhone && authUser?.id) {
      // Lookup in users table: authUser.id is the Supabase Auth UID (auth_user_id)
      const { data: dbUser } = await supabase
        .from('users')
        .select('user_phone_number')
        .or(`auth_user_id.eq.${authUser.id},user_id.eq.${authUser.id}${authUser.email ? `,email.eq.${authUser.email}` : ''}`)
        .maybeSingle();

      if (dbUser?.user_phone_number && dbUser.user_phone_number !== 'unknown') {
        citizenPhone = dbUser.user_phone_number;
      }
    }

    const normalizedPhone = normalizePhilippinePhone(citizenPhone) || (citizenPhone && citizenPhone !== 'unknown' ? citizenPhone : null);
    if (!normalizedPhone) {
      console.warn('[CHAT REPLY] ⚠️ User has no valid phone registered:', authUser?.id, authUser?.email);
      return res.status(400).json({
        success: false,
        error: 'Unable to send reply: Citizen does not have a registered phone number.'
      });
    }

    // 2. Insert into sms_messages with direction = 'inbound', status = 'received'
    const { data: insertedMsg, error: insertError } = await supabase
      .from('sms_messages')
      .insert({
        phone: normalizedPhone,
        body: trimmedMessage,
        direction: 'inbound',
        status: 'received',
        provider_message_id: `app-reply-${Date.now()}`
      })
      .select('id, phone, body, created_at')
      .single();

    if (insertError) {
      console.error('[CHAT REPLY] Failed to insert inbound message:', insertError);
      return res.status(500).json({ success: false, error: 'Database insert failed' });
    }

    console.log(`[CHAT REPLY] ✅ Inbound message recorded from ${normalizedPhone}: "${trimmedMessage.slice(0, 30)}..."`);
    return res.json({
      success: true,
      data: insertedMsg
    });
  } catch (err) {
    console.error('[CHAT REPLY] Exception in /api/chat/reply:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 E-KSENA Backend Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🌐 Network access: http://0.0.0.0:${PORT}/api (accessible from other devices on the network)`);
});

