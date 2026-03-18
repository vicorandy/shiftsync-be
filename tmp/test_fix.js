const axios = require('axios');

async function testFix() {
  const url = 'http://localhost:8000/api/auth/register';
  
  console.log('--- Testing with NO body ---');
  try {
    const res = await axios.post(url, {}, { headers: { 'Content-Type': 'application/json' } });
    console.log('Status:', res.status);
    console.log('Data:', res.data);
  } catch (error) {
    console.log('Status:', error.response?.status);
    console.log('Data:', error.response?.data);
  }

  console.log('\n--- Testing with valid JSON body ---');
  try {
    const res = await axios.post(url, {
      email: `test_${Date.now()}@example.com`,
      password: 'password123',
      name: 'Test User',
      role: 'ADMIN'
    }, { headers: { 'Content-Type': 'application/json' } });
    console.log('Status:', res.status);
    console.log('Data:', res.data);
  } catch (error) {
    console.log('Status:', error.response?.status);
    console.log('Data:', error.response?.data);
  }
}

testFix();
