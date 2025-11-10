const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

const BASE_URL = 'http://localhost:4000/send';

async function testFormDataParsing() {
  console.log('🧪 Testing form data parsing with simple request...');
  
  try {
    const form = new FormData();
    
    // Add only text fields first
    form.append('operationName', 'Test Operation');
    form.append('caption', 'Test Caption');
    form.append('department', 'Department 1');
    
    console.log('Sending simple form data request...');
    const response = await axios.post(`${BASE_URL}/test-form-data`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE' // Replace with actual token
      }
    });
    
    console.log('✅ Form data parsing test passed:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Form data parsing test failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

async function testBulkDocumentRoute() {
  console.log('🧪 Testing bulk document route...');
  
  try {
    const form = new FormData();
    
    // Add CSV file
    form.append('csvFile', fs.createReadStream('./examples/sample-contacts.csv'), {
      filename: 'sample-contacts.csv',
      contentType: 'text/csv'
    });
    
    // Add document file
    const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n174\n%%EOF');
    form.append('documentFile', dummyPdf, {
      filename: 'test-document.pdf',
      contentType: 'application/pdf'
    });
    
    // Add form fields
    form.append('operationName', 'Test Bulk Document');
    form.append('caption', 'Test document caption');
    form.append('department', 'Department 1');
    
    console.log('Sending bulk document request...');
    const response = await axios.post(`${BASE_URL}/csv-bulk-document`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE' // Replace with actual token
      }
    });
    
    console.log('✅ Bulk document route test passed:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Bulk document route test failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting simple tests...\n');
  
  const results = await Promise.all([
    testFormDataParsing(),
    testBulkDocumentRoute()
  ]);
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testFormDataParsing, testBulkDocumentRoute, runTests };






