async function test() {
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
    console.log('Login successful. Token:', token.substring(0, 20) + '...');

    // 2. Fetch swaps
    console.log('Fetching swaps for staff1...');
    const swapsRes = await fetch(`${baseURL}/swaps/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!swapsRes.ok) {
        const error = await swapsRes.json();
        throw new Error(`Fetch failed: ${JSON.stringify(error)}`);
    }

    const swaps = await swapsRes.json();
    console.log('Swaps fetched successfully!');
    console.log('Number of swaps:', swaps.length);
    if (swaps.length > 0) {
        console.log('First swap requester:', swaps[0].requester.user.name);
        console.log('Verification PASSED');
    } else {
        console.log('Verification FAILED: No swaps found');
    }
  } catch (error) {
    console.error('Verification FAILED:', error.message);
  }
}

test();
