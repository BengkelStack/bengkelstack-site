const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Read index.html and extract the JavaScript state engine
const htmlPath = path.join(__dirname, '..', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = htmlContent.split('<script>');
const jsCode = scriptMatch[scriptMatch.length - 1].split('</script>')[0];

// 2. Set up mock DOM environment and context
const elements = {};
function mockElement(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      className: '',
      textContent: '',
      innerHTML: '',
      style: {}
    };
  }
  return elements[id];
}

const sandbox = {
  document: {
    getElementById: (id) => mockElement(id)
  },
  console: console,
  setTimeout: setTimeout,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Object: Object,
  Array: Array,
  parseFloat: parseFloat,
  parseInt: parseInt
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// Transform top-level const/let to var for sandbox export in Node VM
const exportableJs = jsCode
  .replace(/\bconst countryCatalogs\b/, 'var countryCatalogs')
  .replace(/\blet currentCountryKey\b/, 'var currentCountryKey')
  .replace(/\blet currentVehKey\b/, 'var currentVehKey')
  .replace(/\blet demoCart\b/, 'var demoCart');

const context = vm.createContext(sandbox);
vm.runInContext(exportableJs, context);

// Bind sandbox variables for test assertions
const {
  countryCatalogs,
  setCountryMarket,
  setDemoVehicle,
  addDemoItem,
  removeDemoItem,
  toggleDemoAction,
  resetDemoCart,
  simulateCheckout,
  formatCurrency
} = sandbox;

console.log('================================================================');
console.log('WHITE-BOX TEST SUITE: 8-Country Fleet & Localization Matrix');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${testName}: ${err.message}`);
    throw err;
  }
}

const expectedCountries = ['ID', 'VN', 'TH', 'PH', 'MY', 'IN', 'US', 'GB'];

// TEST CASES:
runTest('Country Matrix: All 8 target countries defined', () => {
  expectedCountries.forEach(code => {
    assert(countryCatalogs[code], `Country ${code} is missing from countryCatalogs`);
  });
});

runTest('Country Matrix: Vehicle fleet schemas & license plate formatting across all countries', () => {
  expectedCountries.forEach(code => {
    const c = countryCatalogs[code];
    assert(c.name && c.flag && c.currency && c.currencyCode, `Country ${code} missing metadata`);
    const vehKeys = Object.keys(c.vehicles);
    assert(vehKeys.length >= 4, `Country ${code} must have at least 4 models`);
    vehKeys.forEach(vk => {
      const v = c.vehicles[vk];
      assert(v.name && v.type && v.plate && v.owner, `Vehicle ${vk} in ${code} missing fields`);
    });
  });
});

runTest('Country Matrix: Labor fee completeness for every item/vehicle pair', () => {
  expectedCountries.forEach(code => {
    const c = countryCatalogs[code];
    const vehKeys = Object.keys(c.vehicles);
    Object.keys(c.items).forEach(ik => {
      const item = c.items[ik];
      assert(typeof item.price === 'number' && item.price >= 0, `Item ${ik} in ${code} invalid price`);
      vehKeys.forEach(vk => {
        assert(typeof item.installFees[vk] === 'number', `Item ${ik} missing install fee for vehicle ${vk} in ${code}`);
        assert(item.installFees[vk] >= 0, `Item ${ik} negative install fee for vehicle ${vk} in ${code}`);
      });
    });
  });
});

runTest('Localization Switching: Switch to Vietnam (VN - ₫ VND)', () => {
  setCountryMarket('VN');
  assert.strictEqual(sandbox.currentCountryKey, 'VN');
  assert.strictEqual(countryCatalogs.VN.currency, '₫');
  assert(elements['terminalTitle'].textContent.includes('Vietnam'));
  assert(elements['demoGrandTotal'].textContent.includes('₫'));
});

runTest('Localization Switching: Switch to United States (US - $ USD)', () => {
  setCountryMarket('US');
  assert.strictEqual(sandbox.currentCountryKey, 'US');
  assert.strictEqual(countryCatalogs.US.currency, '$');
  assert(elements['terminalTitle'].textContent.includes('United States'));
  assert(elements['demoGrandTotal'].textContent.startsWith('$'));
});

runTest('Localization Switching: Switch to United Kingdom (GB - £ GBP)', () => {
  setCountryMarket('GB');
  assert.strictEqual(sandbox.currentCountryKey, 'GB');
  assert.strictEqual(countryCatalogs.GB.currency, '£');
  assert(elements['terminalTitle'].textContent.includes('United Kingdom'));
  assert(elements['demoGrandTotal'].textContent.startsWith('£'));
});

runTest('Vehicle Selection: Switching to high-displacement cruiser charges higher labor in US', () => {
  setCountryMarket('US');
  setDemoVehicle('ninja');
  const ninjaTotal = parseFloat(elements['demoGrandTotal'].textContent.replace(/[^0-9.]/g, ''));

  setDemoVehicle('harley');
  const harleyTotal = parseFloat(elements['demoGrandTotal'].textContent.replace(/[^0-9.]/g, ''));

  assert(harleyTotal > ninjaTotal, `Harley labor (${harleyTotal}) must be higher than Ninja 400 (${ninjaTotal})`);
});

runTest('Dual-Tier Pricing: Takeaway vs Installed calculation determinism across currencies', () => {
  setCountryMarket('GB');
  resetDemoCart();
  addDemoItem('chain'); // price = 115.00, PCX installFee = 30.00

  toggleDemoAction(0, 'installed');
  assert.strictEqual(elements['demoGrandTotal'].textContent, '£145.00'); // 115 + 30 = 145

  toggleDemoAction(0, 'takeaway');
  assert.strictEqual(elements['demoGrandTotal'].textContent, '£115.00'); // 115 only
});

runTest('Thermal Receipt Formatting: 40-column padLine strict bounds and country headers', () => {
  setCountryMarket('US');
  const slip = elements['demoThermalSlip'].textContent;
  const lines = slip.split('\n');
  lines.forEach((line, i) => {
    assert(line.length <= 40, `Line ${i + 1} exceeds 40 characters: [${line}] (${line.length} chars)`);
  });
  assert(slip.includes('AUSTIN MOTO GARAGE'), 'Missing US workshop name on receipt');
  assert(slip.includes('WO-00042'), 'Missing receipt number');
  assert(slip.includes('TOTAL AMOUNT:'), 'Missing total amount line');
});

runTest('Checkout Simulation: Button state changes correctly', () => {
  simulateCheckout();
  const btn = elements['btnDemoCheckout'];
  assert(btn.textContent.includes('Order Settled & Printed'), 'Checkout text did not update');
});

console.log(`\n================================================================`);
console.log(`WHITE-BOX RESULTS: ${passedTests}/${totalTests} Tests Passed (100% Green)`);
console.log(`================================================================`);
