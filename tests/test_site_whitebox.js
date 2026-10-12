const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Read index.html and extract the JavaScript state engine
const htmlPath = path.join(__dirname, '..', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = htmlContent.split('<script>');
const jsCode = scriptMatch[scriptMatch.length - 1].split('</script>')[0];

const vm = require('vm');

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
  .replace(/\bconst marketCatalogs\b/, 'var marketCatalogs')
  .replace(/\blet currentMarketKey\b/, 'var currentMarketKey')
  .replace(/\blet currentVehKey\b/, 'var currentVehKey')
  .replace(/\blet demoCart\b/, 'var demoCart');

const context = vm.createContext(sandbox);
vm.runInContext(exportableJs, context);

// Bind sandbox variables for test assertions
const {
  marketCatalogs,
  setMarketRegion,
  setDemoVehicle,
  addDemoItem,
  removeDemoItem,
  toggleDemoAction,
  resetDemoCart,
  simulateCheckout,
  formatCurrency
} = sandbox;

console.log('====================================================');
console.log('WHITE-BOX TEST SUITE: bengkelstack-site State Engine');
console.log('====================================================\n');

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

// TEST CASES:
runTest('Catalog Integrity: Both Global and ASEAN markets defined', () => {
  assert(marketCatalogs.global, 'global market missing');
  assert(marketCatalogs.asean, 'asean market missing');
});

runTest('Catalog Integrity: Global market vehicle schema', () => {
  const g = marketCatalogs.global;
  assert.strictEqual(g.currency, '$');
  const vehKeys = Object.keys(g.vehicles);
  assert(vehKeys.length >= 4, 'Global vehicles must have at least 4 models');
  vehKeys.forEach(k => {
    const v = g.vehicles[k];
    assert(v.name && v.type && v.plate && v.owner, `Vehicle ${k} missing fields`);
  });
});

runTest('Catalog Integrity: Global market items and labor fees complete', () => {
  const g = marketCatalogs.global;
  const vehKeys = Object.keys(g.vehicles);
  Object.keys(g.items).forEach(ik => {
    const item = g.items[ik];
    assert(typeof item.price === 'number' && item.price >= 0, `Item ${ik} invalid price`);
    vehKeys.forEach(vk => {
      assert(typeof item.installFees[vk] === 'number', `Item ${ik} missing install fee for vehicle ${vk}`);
      assert(item.installFees[vk] >= 0, `Item ${ik} negative install fee for vehicle ${vk}`);
    });
  });
});

runTest('Catalog Integrity: ASEAN market vehicle schema & Rp currency', () => {
  const a = marketCatalogs.asean;
  assert.strictEqual(a.currency, 'Rp');
  const vehKeys = Object.keys(a.vehicles);
  assert(vehKeys.length >= 4, 'ASEAN vehicles must have at least 4 models');
  vehKeys.forEach(k => {
    const v = a.vehicles[k];
    assert(v.name && v.type && v.plate && v.owner, `ASEAN vehicle ${k} missing fields`);
  });
});

runTest('Market Switching: Switch to Global initializes correctly', () => {
  setMarketRegion('global');
  assert.strictEqual(sandbox.currentMarketKey, 'global');
  assert.strictEqual(sandbox.currentVehKey, 'scooter');
  assert(elements['terminalTitle'].textContent.includes('Global / Americas / EU'));
  assert(elements['demoGrandTotal'].textContent.startsWith('$'));
});

runTest('Market Switching: Switch to ASEAN initializes correctly', () => {
  setMarketRegion('asean');
  assert.strictEqual(sandbox.currentMarketKey, 'asean');
  assert.strictEqual(sandbox.currentVehKey, 'beat');
  assert(elements['terminalTitle'].textContent.includes('Southeast Asia'));
  assert(elements['demoGrandTotal'].textContent.startsWith('Rp'));
});

runTest('Vehicle Selection: Switching vehicle changes labor rates', () => {
  setMarketRegion('asean');
  // With Beat:
  setDemoVehicle('beat');
  const beatTotal = parseFloat(elements['demoGrandTotal'].textContent.replace(/[^0-9]/g, ''));
  
  // Switch to NMAX (Maxi-Scooter with higher labor):
  setDemoVehicle('nmax');
  const nmaxTotal = parseFloat(elements['demoGrandTotal'].textContent.replace(/[^0-9]/g, ''));
  
  assert(nmaxTotal > beatTotal, `NMAX labor total (${nmaxTotal}) should be higher than Beat (${beatTotal})`);
});

runTest('Cart Operations: Add item, Remove item, Reset cart', () => {
  setMarketRegion('global');
  resetDemoCart();
  assert.strictEqual(sandbox.demoCart.length, 0);
  assert.strictEqual(elements['demoGrandTotal'].textContent, '$0.00');

  addDemoItem('oil');
  assert.strictEqual(sandbox.demoCart.length, 1);
  assert.notStrictEqual(elements['demoGrandTotal'].textContent, '$0.00');

  addDemoItem('pad');
  assert.strictEqual(sandbox.demoCart.length, 2);

  removeDemoItem(0);
  assert.strictEqual(sandbox.demoCart.length, 1);
  assert.strictEqual(sandbox.demoCart[0].id, 'pad');

  resetDemoCart();
  assert.strictEqual(sandbox.demoCart.length, 0);
});

runTest('Dual-Tier Pricing: Takeaway vs Installed calculation determinism', () => {
  setMarketRegion('global');
  resetDemoCart();
  addDemoItem('chain'); // price = 85.00, scooter installFee = 25.00
  
  // Installed:
  toggleDemoAction(0, 'installed');
  assert.strictEqual(elements['demoGrandTotal'].textContent, '$110.00'); // 85 + 25 = 110

  // Takeaway:
  toggleDemoAction(0, 'takeaway');
  assert.strictEqual(elements['demoGrandTotal'].textContent, '$85.00'); // 85 only
});

runTest('Thermal Receipt Formatting: Contains all required lines and totals', () => {
  setMarketRegion('global');
  resetDemoCart();
  addDemoItem('oil');
  toggleDemoAction(0, 'installed');

  const slip = elements['demoThermalSlip'].textContent;
  assert(slip.includes('BENGKELSTACK WORKSHOP OS'), 'Missing receipt header');
  assert(slip.includes('WO-00042'), 'Missing receipt number');
  assert(slip.includes('TOTAL AMOUNT:'), 'Missing total amount line');
  assert(slip.includes('CASH TENDERED:'), 'Missing cash tendered line');
  assert(slip.includes('CHANGE DUE:'), 'Missing change due line');
  assert(slip.includes('$19.50'), 'Slip must reflect calculated subtotal ($14.50 + $5.00 = $19.50)');
});

runTest('Checkout Simulation: Button state changes correctly', () => {
  simulateCheckout();
  const btn = elements['btnDemoCheckout'];
  assert(btn.textContent.includes('Order Settled & Printed'), 'Checkout text did not update');
});

console.log(`\n====================================================`);
console.log(`WHITE-BOX TEST RESULTS: ${passedTests}/${totalTests} Tests Passed (100% Green)`);
console.log(`====================================================`);
