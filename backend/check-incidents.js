require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('📋 Recent incidents in database:');
    console.log('');
    if (data.length === 0) {
      console.log('  (No incidents found)');
    } else {
      data.forEach((inc, i) => {
        console.log(`${i + 1}. ID: ${String(inc.incident_id).slice(0, 8)}...`);
        console.log(`   User: ${inc.user_phone_number}`);
        console.log(`   Created: ${new Date(inc.created_at).toLocaleString()}`);
        console.log('');
      });
    }
  }
  process.exit(0);
})();
