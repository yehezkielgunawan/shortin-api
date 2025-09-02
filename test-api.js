const BASE_URL = "http://localhost:8787";

async function testAPI() {
	console.log("🧪 Testing Shortin API...\n");

	try {
		// Test 1: GET / (Welcome endpoint)
		console.log("1. Testing welcome endpoint...");
		const welcomeResponse = await fetch(`${BASE_URL}/`);
		const welcomeText = await welcomeResponse.text();
		console.log(`   Status: ${welcomeResponse.status}`);
		console.log(`   Response: ${welcomeText}`);
		console.log(`   ✅ ${welcomeResponse.ok ? "PASS" : "FAIL"}\n`);

		// Test 2: POST /shorten (Create short URL)
		console.log("2. Testing create short URL...");
		const createResponse = await fetch(`${BASE_URL}/shorten`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url: "https://www.example.com/test-url",
			}),
		});

		const createResult = await createResponse.json();
		console.log(`   Status: ${createResponse.status}`);
		console.log(`   Response:`, createResult);
		console.log(`   ✅ ${createResponse.ok ? "PASS" : "FAIL"}\n`);

		if (createResponse.ok && createResult.shortCode) {
			const shortCode = createResult.shortCode;

			// Test 3: GET /:shortCode (Retrieve URL)
			console.log("3. Testing retrieve short URL...");
			const retrieveResponse = await fetch(`${BASE_URL}/${shortCode}`);
			const retrieveResult = await retrieveResponse.json();
			console.log(`   Status: ${retrieveResponse.status}`);
			console.log(`   Response:`, retrieveResult);
			console.log(`   ✅ ${retrieveResponse.ok ? "PASS" : "FAIL"}\n`);

			// Test 4: GET /shorten/:shortCode/stats (Get stats)
			console.log("4. Testing get stats...");
			const statsResponse = await fetch(
				`${BASE_URL}/shorten/${shortCode}/stats`,
			);
			const statsResult = await statsResponse.json();
			console.log(`   Status: ${statsResponse.status}`);
			console.log(`   Response:`, statsResult);
			console.log(`   ✅ ${statsResponse.ok ? "PASS" : "FAIL"}\n`);

			// Test 5: PUT /shorten/:shortCode (Update URL)
			console.log("5. Testing update short URL...");
			const updateResponse = await fetch(`${BASE_URL}/shorten/${shortCode}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					url: "https://www.example.com/updated-url",
				}),
			});
			const updateResult = await updateResponse.json();
			console.log(`   Status: ${updateResponse.status}`);
			console.log(`   Response:`, updateResult);
			console.log(`   ✅ ${updateResponse.ok ? "PASS" : "FAIL"}\n`);

			// Test 6: DELETE /shorten/:shortCode (Delete URL)
			console.log("6. Testing delete short URL...");
			const deleteResponse = await fetch(`${BASE_URL}/shorten/${shortCode}`, {
				method: "DELETE",
			});
			const deleteResult = await deleteResponse.json();
			console.log(`   Status: ${deleteResponse.status}`);
			console.log(`   Response:`, deleteResult);
			console.log(`   ✅ ${deleteResponse.ok ? "PASS" : "FAIL"}\n`);
		}

		// Test 7: Error handling - Missing URL
		console.log("7. Testing error handling (missing URL)...");
		const errorResponse = await fetch(`${BASE_URL}/shorten`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({}),
		});
		const errorResult = await errorResponse.json();
		console.log(`   Status: ${errorResponse.status}`);
		console.log(`   Response:`, errorResult);
		console.log(`   ✅ ${errorResponse.status === 400 ? "PASS" : "FAIL"}\n`);

		// Test 8: 404 handling
		console.log("8. Testing 404 handling...");
		const notFoundResponse = await fetch(`${BASE_URL}/nonexistent-code`);
		const notFoundResult = await notFoundResponse.json();
		console.log(`   Status: ${notFoundResponse.status}`);
		console.log(`   Response:`, notFoundResult);
		console.log(`   ✅ ${notFoundResponse.status === 404 ? "PASS" : "FAIL"}\n`);
	} catch (error) {
		console.error("❌ Test failed:", error);
	}

	console.log("🏁 Test completed!");
}

// Run tests
testAPI();
