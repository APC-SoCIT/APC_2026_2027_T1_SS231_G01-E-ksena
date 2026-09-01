/**
 * Test Script: Verify Supabase Connection and Emergency Responders
 * Run: node test-connection.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('🔍 E-KSENA Backend Connection Test\n');
console.log('═══════════════════════════════════════════════════════════');

// Step 1: Check environment variables
console.log('\n📋 STEP 1: Checking Environment Variables...');
console.log('─────────────────────────────────────────────────────────');

if (!process.env.SUPABASE_URL) {
  console.error('❌ SUPABASE_URL is not set in .env file');
  console.log('\n💡 FIX: Create a .env file in the backend folder with:');
  console.log('   SUPABASE_URL=https://your-project-id.supabase.co');
  console.log('   SUPABASE_SERVICE_KEY=your-service-role-key-here\n');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY is not set in .env file');
  console.log('\n💡 FIX: Add SUPABASE_SERVICE_KEY to your .env file\n');
  process.exit(1);
}

console.log('✅ SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('✅ SUPABASE_SERVICE_KEY:', '***' + process.env.SUPABASE_SERVICE_KEY.slice(-8));

// Step 2: Test Supabase connection
console.log('\n📡 STEP 2: Testing Supabase Connection...');
console.log('─────────────────────────────────────────────────────────');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testConnection() {
  try {
    // Test connection by checking auth
    const { data, error } = await supabase.auth.getSession();
    
    if (error && error.message !== 'Auth session missing!') {
      console.error('❌ Supabase connection failed:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Supabase connection successful!');
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }
}

// Step 3: Check incidents table
async function checkIncidentsTable() {
  console.log('\n📊 STEP 3: Checking Incidents Table...');
  console.log('─────────────────────────────────────────────────────────');
  
  const { data, error, count } = await supabase
    .from('incidents')
    .select('*', { count: 'exact' })
    .limit(5);
  
  if (error) {
    console.error('❌ Error accessing incidents table:', error.message);
    console.log('\n💡 FIX: Make sure the "incidents" table exists in Supabase');
    console.log('   Required columns: id, user_phone_number, location_lat, location_lng,');
    console.log('   location_address, video_url, service_type, status, responder_phone_number,');
    console.log('   created_at, assigned_at, detected_at\n');
    return false;
  }
  
  console.log('✅ Incidents table accessible');
  console.log(`   Total incidents: ${count || 0}`);
  
  if (data && data.length > 0) {
    console.log('   Recent incidents:');
    data.forEach((inc, i) => {
      console.log(`   ${i + 1}. ID: ${inc.id.slice(0, 8)}... Status: ${inc.status} Type: ${inc.service_type || 'pending'}`);
    });
  }
  
  return true;
}

// Step 4: Check emergency_responders table
async function checkRespondersTable() {
  console.log('\n👨‍🚒 STEP 4: Checking Emergency Responders Table...');
  console.log('─────────────────────────────────────────────────────────');
  
  const { data, error } = await supabase
    .from('emergency_responders')
    .select('*')
    .eq('is_active', true);
  
  if (error) {
    console.error('❌ Error accessing emergency_responders table:', error.message);
    console.log('\n💡 FIX: Make sure the "emergency_responders" table exists in Supabase');
    console.log('   Required columns: id, name, phone_number, service_type, location_lat,');
    console.log('   location_lng, station_address, is_active, created_at\n');
    return false;
  }
  
  console.log('✅ Emergency responders table accessible');
  
  if (!data || data.length === 0) {
    console.error('❌ NO ACTIVE RESPONDERS FOUND!');
    console.log('\n💡 FIX: Add emergency responders to your database:');
    console.log('   Example SQL:');
    console.log('   INSERT INTO emergency_responders');
    console.log('   (name, phone_number, service_type, location_lat, location_lng, station_address, is_active)');
    console.log('   VALUES');
    console.log("   ('Fire Station #1', '+639171234567', 'fire', 14.5547, 121.0244, '123 Main St', true),");
    console.log("   ('Medical Unit #1', '+639181234567', 'medical', 14.5567, 121.0264, '456 Health Ave', true),");
    console.log("   ('Police Station #1', '+639191234567', 'police', 14.5587, 121.0284, '789 Safety Blvd', true);\n");
    return false;
  }
  
  console.log(`   Total active responders: ${data.length}`);
  
  // Group by service type
  const byType = {
    fire: data.filter(r => r.service_type === 'fire'),
    medical: data.filter(r => r.service_type === 'medical'),
    police: data.filter(r => r.service_type === 'police'),
  };
  
  console.log(`   🔥 Fire: ${byType.fire.length} responders`);
  byType.fire.forEach(r => {
    console.log(`      - ${r.name} (${r.phone_number}) at ${r.location_lat}, ${r.location_lng}`);
  });
  
  console.log(`   🏥 Medical: ${byType.medical.length} responders`);
  byType.medical.forEach(r => {
    console.log(`      - ${r.name} (${r.phone_number}) at ${r.location_lat}, ${r.location_lng}`);
  });
  
  console.log(`   🚓 Police: ${byType.police.length} responders`);
  byType.police.forEach(r => {
    console.log(`      - ${r.name} (${r.phone_number}) at ${r.location_lat}, ${r.location_lng}`);
  });
  
  // Check for missing types
  const missingTypes = [];
  if (byType.fire.length === 0) missingTypes.push('fire');
  if (byType.medical.length === 0) missingTypes.push('medical');
  if (byType.police.length === 0) missingTypes.push('police');
  
  if (missingTypes.length > 0) {
    console.warn(`\n⚠️  WARNING: No responders for: ${missingTypes.join(', ')}`);
    console.log('   Add responders for these types to ensure full coverage\n');
  }
  
  return true;
}

// Step 5: Test creating a sample incident
async function testIncidentCreation() {
  console.log('\n🧪 STEP 5: Testing Incident Creation...');
  console.log('─────────────────────────────────────────────────────────');
  
  const testIncident = {
    user_phone_number: '+639999999999',
    location_lat: 14.5547,
    location_lng: 121.0244,
    location_address: 'Test Location, Manila',
    video_url: 'test://video',
    status: 'pending',
    service_type: null,
  };
  
  const { data, error } = await supabase
    .from('incidents')
    .insert(testIncident)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Failed to create test incident:', error.message);
    return false;
  }
  
  console.log('✅ Test incident created successfully!');
  console.log(`   Incident ID: ${data.id}`);
  
  // Clean up: delete test incident
  await supabase
    .from('incidents')
    .delete()
    .eq('id', data.id);
  
  console.log('✅ Test incident cleaned up');
  
  return true;
}

// Run all tests
async function runAllTests() {
  try {
    await testConnection();
    
    const incidentsOk = await checkIncidentsTable();
    const respondersOk = await checkRespondersTable();
    
    if (incidentsOk && respondersOk) {
      await testIncidentCreation();
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS COMPLETED!');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    if (!respondersOk) {
      console.log('⚠️  CRITICAL: Add emergency responders before testing the app!\n');
      process.exit(1);
    }
    
    console.log('✅ Your backend is ready to receive incident reports!\n');
    console.log('Next steps:');
    console.log('1. Make sure backend is running: npm start');
    console.log('2. Check mobile app API URL configuration');
    console.log('3. Test video report from mobile app\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runAllTests();

