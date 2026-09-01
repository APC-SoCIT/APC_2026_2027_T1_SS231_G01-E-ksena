const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkResponders() {
  const { data, error } = await supabase
    .from('responders')
    .select('responder_phone_number, name, location_lat, location_lng, service_type, is_active');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Responders:');
    data.forEach(r =>
      console.log(
        `${r.responder_phone_number}: ${r.name} - ${r.service_type} - active:${r.is_active} - lat:${r.responder_location_lat}, lng:${r.responder_location_lng}`
      )
    );
  }
  process.exit(0);
}

checkResponders();