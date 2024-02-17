import axios from 'axios';
import * as diff from 'diff';
import readline from 'readline';

// Function to get user input
async function getInput(prompt, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (input) => {
      rl.close();
      resolve(input.trim() === '' ? defaultValue : input);
    });
  });
}

// Function to perform HTTP GET request
const fetchEndpoint = async (url) => {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    process.exit(1);
  }
};

// Function to display the diff between two objects, data1 and data2
// omit lines that are the same
const displayDiff = (data1, data2) => {
  const differences = diff.diffJson(data1, data2);
  let lineNumber = 1;
  differences.forEach((part) => {
    const lines = part.value.split('\n');
    lines.forEach((line, index) => {
      if (line) {
        if (part.added) {
          console.log('\x1b[32m%s\x1b[0m', `${lineNumber + index}: ${line}`);
        } else if (part.removed) {
          console.log('\x1b[31m%s\x1b[0m', `${lineNumber + index}: ${line}`);
        }
      }
    });
    lineNumber += lines.length;
  });
};

const testEndpoints = {
  'tokens': ['http://localhost:5101/nft-indexer/v1/tokens/?contractId=26178469', 'https://arc72-idx.voirewards.com/nft-indexer/v1/tokens/?contractId=26178469'],
  'collections': ['http://localhost:5101/nft-indexer/v1/collections/?contractId=26178469', 'https://arc72-idx.voirewards.com/nft-indexer/v1/collections/?contractId=26178469'],
  'transfers': ['http://localhost:5101/nft-indexer/v1/transfers/?contractId=26178469', 'https://arc72-idx.voirewards.com/nft-indexer/v1/transfers/?contractId=26178469']
};

const main = async () => {
  console.log('Welcome to the NFT Indexer Diff Tool!');

  console.log('-------------------------------------');
  console.log('a) Run all tests');
  console.log('b) Run specific test');
  console.log('c) Exit');
  console.log('-------------------------------------');
  const choice = await getInput('Enter your choice: ');
  
  if (choice === 'c') {
    console.log('Exiting...');
    process.exit(0);
  }
  else if (choice === 'a') {
    console.log('Running all tests...');
    
    for (const [testName, endpoints] of Object.entries(testEndpoints)) {
      console.log(`Running test: ${testName}`);
      const data1 = await fetchEndpoint(endpoints[0]);
      const data2 = await fetchEndpoint(endpoints[1]);
      displayDiff(data1, data2);
    }

  }
  else if (choice == 'b') {
    console.log('Running specific test...');

    // select a test from numbered list
    console.log('Available tests:');
    for (const [i, testName] of Object.keys(testEndpoints).entries()) {
      console.log(`${i + 1}) ${testName}`);
    }

    const testIndex = await getInput('Enter the test number: ');
    const testName = Object.keys(testEndpoints)[testIndex - 1];
    const endpoints = testEndpoints[testName];

    console.log(`Running test: ${testName}`);
    const data1 = await fetchEndpoint(endpoints[0]);
    const data2 = await fetchEndpoint(endpoints[1]);
    displayDiff(data1, data2);
  }
};

main();

