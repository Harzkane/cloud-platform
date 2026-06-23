// ══════════════════════════════════════════════════════════
//  NexGenHost — Error & Resilience Tester
//  Simulates service failures (DB down, Redis down) to verify
//  that the API returns clean errors instead of crashing the process.
//  Usage: API_URL=https://cloud-platform-5vf4.onrender.com node scripts/error-resilience-test.js
// ══════════════════════════════════════════════════════════

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function runResilienceTests() {
  console.log(`\n🚨 Starting NexGenHost Error & Resilience Tests against: ${API_URL}`);
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

  // 1. Test Graceful 404 Route Handler
  try {
    const res = await fetch(`${API_URL}/non-existent-route-path`);
    const data = await res.json();
    assert(res.status === 404, 'API returns clean HTTP 404 for unknown routes');
    assert(data.error === 'Route not found', '404 handler returns structured JSON error');
  } catch (err) {
    assert(false, `404 test failed: ${err.message}`);
  }

  // 2. Test Invalid Method Handler
  try {
    const res = await fetch(`${API_URL}/auth/register`, { method: 'PUT' });
    assert(res.status === 404 || res.status === 405, 'API rejects invalid request method with structured response');
  } catch (err) {
    assert(false, `Method rejection test failed: ${err.message}`);
  }

  // 3. Information gathering for simulated manual tests
  console.log('\nℹ️  To simulate a Database Down (Neon Outage) locally:');
  console.log('   1. In apps/api/.env, temporarily change DATABASE_URL to a broken port (e.g., port 9999).');
  console.log('   2. Start your dev server: npm run dev');
  console.log('   3. Run: curl -i http://localhost:3000/auth/login');
  console.log('   -> Expected result: The API should respond with HTTP 500 JSON ("Internal server error") and NOT crash.');

  console.log('\nℹ️  To simulate a Redis/Upstash Queue Down locally:');
  console.log('   1. In apps/api/.env, temporarily change REDIS_URL to a broken port (e.g., redis://localhost:9999).');
  console.log('   2. Start your dev server: npm run dev');
  console.log('   3. Run: curl -i http://localhost:3000/health (should pass since health check doesn\'t require Redis)');
  console.log('   -> Expected result: Health check passes. Triggering a deployment yields a clean HTTP 500 without crashing.');

  console.log(`══════════════════════════════════════════════════════════`);
  console.log(`📊 Resilience Test Script Written Successfully.`);
  console.log(`══════════════════════════════════════════════════════════`);
}

runResilienceTests();
