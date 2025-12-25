/**
 * Test script for PDF import endpoints
 *
 * Usage:
 *   npx ts-node scripts/test-pdf-import.ts <path-to-pdf> <jwt-token>
 *
 * Example:
 *   npx ts-node scripts/test-pdf-import.ts ./my-statement.pdf eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */
import * as fs from 'fs';
import * as https from 'https';

const API_BASE = 'https://localhost:4000/api/v1';

async function makeRequest({
  endpoint,
  token,
  body,
}: {
  endpoint: string;
  token: string;
  body: object;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);

    const url = new URL(`${API_BASE}${endpoint}`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: `Bearer ${token}`,
      },
      // Skip SSL verification for localhost
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch {
          resolve(responseData);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx ts-node scripts/test-pdf-import.ts <path-to-pdf> <jwt-token>');
    console.log('');
    console.log('To get your JWT token:');
    console.log('1. Open your app in the browser');
    console.log('2. Open DevTools -> Application -> Local Storage');
    console.log('3. Find the token value');
    process.exit(1);
  }

  const [pdfPath, token] = args;

  // Check if file exists
  if (!fs.existsSync(pdfPath!)) {
    console.error(`Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  // Read and encode PDF
  console.log(`Reading PDF: ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath!);
  const pdfBase64 = pdfBuffer.toString('base64');
  console.log(`PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`Base64 size: ${(pdfBase64.length / 1024).toFixed(2)} KB`);
  console.log('');

  // Test estimate-cost endpoint
  console.log('=== Testing /import/pdf/estimate-cost ===');
  try {
    const estimateResult = await makeRequest({
      endpoint: '/import/pdf/estimate-cost',
      token: token!,
      body: { pdfBase64 },
    });
    console.log('Response:');
    console.log(JSON.stringify(estimateResult, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  console.log('');

  // Ask user if they want to proceed with extraction
  console.log('=== Testing /import/pdf/extract ===');
  console.log('This will call the AI API and may incur costs.');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Proceed with extraction? (y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        console.log('Extracting transactions (this may take a moment)...');
        const extractResult = await makeRequest({
          endpoint: '/import/pdf/extract',
          token: token!,
          body: { pdfBase64 },
        });
        console.log('Response:');
        console.log(JSON.stringify(extractResult, null, 2));
      } catch (error) {
        console.error('Error:', error);
      }
    } else {
      console.log('Skipped extraction.');
    }
    rl.close();
  });
}

main();
