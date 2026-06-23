// ══════════════════════════════════════════════════════════
//  NexGenHost — Smoke & Resilience Test Script
//  Can be run against local or production APIs:
//  Usage: API_URL=https://your-api.onrender.com node scripts/smoke-test.js
// ══════════════════════════════════════════════════════════

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function runTests() {
  console.log(`\n🚀 Starting NexGenHost Smoke & Stress Test against: ${API_URL}`);
  console.log(`══════════════════════════════════════════════════════════`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // Helper for timing
  const timeCall = async (fn) => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  };

  // ────────────────────────────────────────────────────────
  // Test 1: Health & Uptime Endpoint
  // ────────────────────────────────────────────────────────
  try {
    const { result, duration } = await timeCall(() => fetch(`${API_URL}/health`));
    assert(result.status === 200, 'Health check returned 200 OK');
    
    const body = await result.json();
    assert(body.status === 'ok' && body.service === 'nexgenhost-api', 'Health check body structure is correct');
    console.log(`ℹ️ [Info] Health response time: ${duration.toFixed(2)}ms`);
  } catch (err) {
    assert(false, `Health check failed: ${err.message}`);
  }

  // ────────────────────────────────────────────────────────
  // Test 2: Protected Routes (Security Boundaries)
  // ────────────────────────────────────────────────────────
  try {
    const resNoAuth = await fetch(`${API_URL}/projects`);
    assert(resNoAuth.status === 401, 'Protected route (/projects) rejects request without Authorization header');

    const resBadAuth = await fetch(`${API_URL}/projects`, {
      headers: { 'Authorization': 'Bearer invalid_garbage_token_string' }
    });
    assert(resBadAuth.status === 401, 'Protected route rejects malformed/invalid JWT token');
  } catch (err) {
    assert(false, `Security boundaries test failed: ${err.message}`);
  }

  // ────────────────────────────────────────────────────────
  // Test 3: Input Validation & Boundary Conditions (Worst Cases)
  // ────────────────────────────────────────────────────────
  try {
    // Missing fields
    const resBadInput1 = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Short' }) // missing email & password
    });
    assert(resBadInput1.status === 400, 'Auth registration rejects payloads with missing required parameters');

    // Invalid formats (short password, invalid email)
    const resBadInput2 = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Harz',
        email: 'invalid-email-format',
        password: '123'
      })
    });
    assert(resBadInput2.status === 400, 'Auth registration rejects invalid email and short password inputs');
  } catch (err) {
    assert(false, `Input validation test failed: ${err.message}`);
  }

  // ────────────────────────────────────────────────────────
  // Test 4: End-to-End Auth & Performance Flow
  // ────────────────────────────────────────────────────────
  let authToken = null;
  const tempEmail = `smoke_${Math.floor(Math.random() * 1000000)}@nexgenhost.com`;
  const tempPassword = 'strong_password_12345';

  try {
    // 4.1 Register user
    const resReg = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Tester',
        email: tempEmail,
        password: tempPassword
      })
    });
    assert(resReg.status === 201, 'Can successfully register a new user account');
    
    const regData = await resReg.json();
    assert(regData.token && regData.user, 'Registration returns valid user data and JWT token');
    authToken = regData.token;

    // 4.2 Login user
    const resLog = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: tempEmail,
        password: tempPassword
      })
    });
    assert(resLog.status === 200, 'Can successfully authenticate (login) with the newly created account');

    // 4.3 Get current user profile (/auth/me)
    const resMe = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert(resMe.status === 200, 'Authenticated user can fetch their profile endpoint (/auth/me)');
    const meData = await resMe.json();
    assert(meData.user.email === tempEmail, 'User profile returned matches the registered email address');
  } catch (err) {
    assert(false, `Auth flow test failed: ${err.message}`);
  }

  // ────────────────────────────────────────────────────────
  // Test 5: Concurrency & Stress Load Verification
  // ────────────────────────────────────────────────────────
  if (authToken) {
    console.log(`\n⏳ Running Concurrency Test (5 parallel requests to /auth/me)...`);
    try {
      const startLoad = performance.now();
      
      const requests = Array.from({ length: 5 }).map(() =>
        fetch(`${API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      );
      
      const responses = await Promise.all(requests);
      const totalLoadTime = performance.now() - startLoad;
      
      const allOk = responses.every(res => res.status === 200);
      assert(allOk, 'All 5 concurrent requests returned successfully (200 OK)');
      console.log(`ℹ️ [Info] Concurrency total execution time: ${totalLoadTime.toFixed(2)}ms (Avg: ${(totalLoadTime / 5).toFixed(2)}ms per call)`);
    } catch (err) {
      assert(false, `Concurrency test failed: ${err.message}`);
    }
  }

  // ────────────────────────────────────────────────────────
  // Test 6: Database Resilience (Orphan/Non-existent Resource)
  // ────────────────────────────────────────────────────────
  if (authToken) {
    try {
      // Querying a deployment using a non-existent UUID format/value
      const resBadDep = await fetch(`${API_URL}/deployments/cm00000000000000000000000`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      // Should handle gracefully (404) rather than throwing an unhandled database exception (500)
      assert(resBadDep.status === 404, 'Querying non-existent deployment returns 404 instead of a database crash (500)');
    } catch (err) {
      assert(false, `Resilience test failed: ${err.message}`);
    }
  }

  // ────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`📊 Smoke Test Summary:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(`🎉 All tests passed successfully!`);
    process.exit(0);
  }
}

runTests();
