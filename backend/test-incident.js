require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('Environment variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'SET' : 'NOT SET');
console.log('');

(async () => {
  try {
    // Test creating an incident
    console.log('Attempting to create incident...');
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        user_phone_number: '+1234567890',
        location_lat: 14.5547,
        location_lng: 121.0244,
        location_address: 'Test Location',
        video_url: 'mock://video',
        status: 'pending',
        service_type: null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ ERROR creating incident:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ SUCCESS! Incident created:', data);
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
})();
