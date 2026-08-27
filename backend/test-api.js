const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    if (res.statusCode === 200) {
      console.log('✅ Backend server is running!');
      testIncidentCreation();
    } else {
      console.log('❌ Backend server responded but with error status');
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Cannot connect to backend: ${e.message}`);
  console.log('Make sure backend is running with: npm start');
  process.exit(1);
});

req.end();

function testIncidentCreation() {
  console.log('\n--- Testing incident creation ---');
  
  const data = JSON.stringify({
    lat: 14.5547,
    lng: 121.0244,
    user_phone_number: '+1234567890',
    location_address: 'Test Location',
    video_url: 'mock://video'
  });

  const options2 = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/report-incident',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req2 = http.request(options2, (res) => {
    console.log(`Status: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:', responseData);
      if (res.statusCode === 200) {
        console.log('✅ Incident creation API works!');
      }
    });
  });

  req2.on('error', (e) => {
    console.error(`❌ API request failed: ${e.message}`);
  });

  req2.write(data);
  req2.end();
}
