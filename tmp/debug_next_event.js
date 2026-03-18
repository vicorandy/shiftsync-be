async function debugNextEvent() {
  const baseURL = 'http://localhost:5000/api';
  
  try {
    // 1. Login
    console.log('Logging in as staff1@shiftsync.com...');
    const loginRes = await fetch(`${baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff1@shiftsync.com',
        password: 'password123'
      })
    });
    
    if (!loginRes.ok) {
        const error = await loginRes.json();
        throw new Error(`Login failed: ${JSON.stringify(error)}`);
    }

    const { token } = await loginRes.json();
    console.log('Login successful.');

    // 2. Fetch shifts/me
    console.log('Fetching /api/shifts/me for staff1...');
    const shiftsRes = await fetch(`${baseURL}/shifts/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!shiftsRes.ok) {
        const error = await shiftsRes.json();
        throw new Error(`Fetch failed: ${JSON.stringify(error)}`);
    }

    const shifts = await shiftsRes.json();
    console.log('Shifts fetched successfully!');
    console.log('Number of shifts:', shifts.length);
    console.log('Shifts:', JSON.stringify(shifts, null, 2));
    
  } catch (error) {
    console.error('Debug FAILED:', error.message);
  }
}

debugNextEvent();
