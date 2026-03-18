const axios = require('axios');

async function testCompliance() {
  const baseUrl = 'http://localhost:3000/api';
  
  try {
    // 1. Login as admin (Assuming admin@example.com / password exists or we can use an existing user)
    // For this test, I'll try to find a user or just hit it if I have a token.
    // Since I don't have a token, I'll just check if the endpoint exists and returns 401/403 if no auth.
    // But to truly verify, I need a token.
    
    // Suggesting the user to test it via their UI or providing a curl command.
    console.log("To verify the endpoint, run:");
    console.log("curl -X GET \"http://localhost:3000/api/analytics/compliance?locationId=YOUR_LOCATION_ID&start=2026-03-01&end=2026-03-31\" -H \"Authorization: Bearer YOUR_TOKEN\"");
  } catch (error) {
    console.error(error.message);
  }
}

testCompliance();
