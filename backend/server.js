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
// CORS configuration - allow all origins for development
app.use(cors({
  origin: '*', // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
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

const getOrCreateReporterUser = async (phoneNumber) => {
  const normalizedPhone = phoneNumber?.trim();

  if (!normalizedPhone) {
    throw new Error('user_phone_number is required');
  }

  const { data: existingUser, error: selectError } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_phone_number', normalizedPhone)
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') {
    throw selectError;
  }

  if (existingUser?.user_id) {
    return existingUser.user_id;
  }

  const { data: createdUser, error: insertError } = await supabase
    .from('users')
    .insert({
      user_phone_number: normalizedPhone,
      full_name: null,
      email: null
    })
    .select('user_id')
    .single();

  if (insertError) {
    throw insertError;
  }

  return createdUser.user_id;
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
    const { video_url, lat, lng, user_phone_number, location_address, user_id } = req.body;

    // Validate required fields
    if (!lat || !lng || !user_phone_number) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: lat, lng, user_phone_number'
      });
    }

    console.log(`[REPORT] New incident reported by ${user_phone_number} at ${lat}, ${lng}`);

    const reporterUserId = user_id || await getOrCreateReporterUser(user_phone_number);

    // Create incident record with the reporter user reference
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert({
        user_id: reporterUserId,
        user_phone_number: user_phone_number,
        incident_location_lat: lat,
        incident_location_lng: lng,
        location_address: location_address || null,
        video_url: video_url || 'mock://video' // Mock URL, no actual storage needed for now
      })
      .select()
      .single();

    if (incidentError) {
      console.error('[ERROR] Failed to create incident:', incidentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create incident record'
      });
    }

    console.log(`[REPORT] Incident created: ${incident.incident_id}`);

    // Run AI analysis + dispatch synchronously so that when the client
    // fetches /api/incident/:id a few seconds later, the dispatch row
    // already exists and can be returned in the response.
    try {
      // Mock AI: randomly select emergency type
      const emergencyTypes = ['fire', 'medical', 'police'];
      const detectedService = emergencyTypes[Math.floor(Math.random() * emergencyTypes.length)];

      console.log(`[AI] Detected emergency type: ${detectedService} for incident ${incident.incident_id}`);

      const { error: aiError } = await supabase.from('ai_analysis').insert({
        incident_id: incident.incident_id,
        detected_service_type: detectedService,
        confidence_score: 0.9
      });

      if (aiError) {
        console.error('[ERROR] Failed to insert AI analysis row:', aiError);
      }

      // Find responders for the detected service type
      const { data: responders, error: responderError } = await supabase
        .from('responders')
        .select('responder_id, responder_phone_number, name, service_type, is_active')
        .eq('service_type', detectedService)
        .eq('is_active', true);

      console.log(`[DEBUG] Looking for ${detectedService} responders, found:`, responders);

      if (responderError) {
        console.error('[ERROR] Failed to query responders:', responderError);
      } else if (!responders || responders.length === 0) {
        console.error(`[WARNING] No active responders found for service type: ${detectedService}`);
      } else {
        // Randomly select an available responder
        const randomIndex = Math.floor(Math.random() * responders.length);
        const assignedResponder = responders[randomIndex];

        console.log(
          `[ASSIGN] Randomly selected responder ${assignedResponder.responder_phone_number} (${assignedResponder.name}) from ${responders.length} available responders for incident ${incident.incident_id}`
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
          const { error: reportError } = await supabase
            .from('reports')
            .insert({
              user_id: reporterUserId,
              incident_id: incident.incident_id,
              content: location_address || 'Emergency Report',
              classified_as: detectedService,
              report_location_lat: lat,
              report_location_lng: lng,
              video_path: video_url || 'mock://video',
              bucket_id: 'incident-videos',
              is_processed: true,
              status: 'pending',
              responder_username: assignedResponder.name || assignedResponder.responder_phone_number
            });

          if (reportError) {
            console.error('[ERROR] Failed to sync to reports table:', reportError);
          } else {
            console.log(`[SUCCESS] Synced incident ${incident.incident_id} to legacy reports table`);
          }
        } catch (err) {
          console.error('[ERROR] Exception syncing to reports table:', err);
        }
        // -----------------------------------------------------------

      }
    } catch (error) {
      console.error('[ERROR] Error in AI analysis/assignment:', error);
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

    if (dispatchRow && dispatchRow.responder_id) {
      console.log(`[DEBUG] Fetching responder info for dispatch responder_id: ${dispatchRow.responder_id}`);
      const { data: responder, error: responderError } = await supabase
        .from('responders')
        .select('responder_id, name, responder_phone_number, responder_location_lat, responder_location_lng, station_address, service_type')
        .eq('responder_id', dispatchRow.responder_id)
        .single();

      if (!responderError && responder) {
        console.log(`[DEBUG] Responder data retrieved:`, responder);

        responderPhoneNumber = responder.responder_phone_number;

        // Set dispatcher info
        assignedDispatcher = {
          id: responder.responder_phone_number,
          name: responder.name || `${responder.service_type} Responder`,
          phone: responder.responder_phone_number,
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

    res.json({
      success: true,
      incident: {
        id: incident.incident_id,
        user_phone_number: incident.user_phone_number,
        responder_phone_number: responderPhoneNumber,
        // service_type is derived from AI analysis / responder, not stored directly on the incident row
        service_type: null,
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
// ENDPOINT 3: Update Responder Location (OPTIONAL)
// ============================================
// Only needed if you have a responder app sending real-time GPS updates
// Skip this endpoint if you're using simulated routes or static route calculation
app.post('/api/responder-location', async (req, res) => {
  try {
    const { responder_phone_number, incident_id, lat, lng } = req.body;

    if (!responder_phone_number || !incident_id || !lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: responder_phone_number, incident_id, lat, lng'
      });
    }

    // Note: This requires responder_locations table in Supabase
    // If you don't have this table, comment out this endpoint
    const { error } = await supabase
      .from('responder_locations')
      .upsert({
        responder_phone_number: responder_phone_number,
        incident_id: incident_id,
        current_lat: lat,
        current_lng: lng,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'responder_phone_number,incident_id'
      });

    if (error) {
      console.error('[ERROR] Failed to update responder location:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update responder location. Make sure responder_locations table exists.'
      });
    }

    res.json({
      success: true,
      message: 'Responder location updated'
    });

  } catch (error) {
    console.error('[ERROR] Error in /api/responder-location:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// ENDPOINT 4: Get Responder Location (OPTIONAL)
// ============================================
// Only needed if you're using responder_locations table for real-time tracking
app.get('/api/incident/:incidentId/responder-location', async (req, res) => {
  try {
    const { incidentId } = req.params;

    // Get incident to find responder phone number
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .select('responder_phone_number')
      .eq('id', incidentId)
      .single();

    if (incidentError || !incident || !incident.responder_phone_number) {
      return res.json({
        success: true,
        responder_location: null,
        message: 'No responder assigned yet'
      });
    }

    // Get responder's current location
    // Note: This requires responder_locations table in Supabase
    const { data: location, error: locationError } = await supabase
      .from('responder_locations')
      .select('current_lat, current_lng, updated_at')
      .eq('incident_id', incidentId)
      .eq('responder_phone_number', incident.responder_phone_number)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (locationError || !location) {
      return res.json({
        success: true,
        responder_location: null,
        message: 'Responder location not available'
      });
    }

    res.json({
      success: true,
      responder_location: {
        latitude: parseFloat(location.current_lat),
        longitude: parseFloat(location.current_lng),
        updated_at: location.updated_at
      },
      responder_phone_number: incident.responder_phone_number
    });

  } catch (error) {
    console.error('[ERROR] Error in /api/incident/:incidentId/responder-location:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
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

