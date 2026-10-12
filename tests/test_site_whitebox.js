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
console.log('WHITE-BOX TEST SUITE: Native Multi-Lingual Country Matrix');
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
const requiredI18nKeys = [
  'step1', 'step2', 'cartTitle', 'itemCountSuffix', 'takeaway', 'installed',
  'partLabel', 'laborLabel', 'grandTotal', 'resetBtn', 'checkoutBtn',
  'checkoutDone', 'thermalTitle', 'emptyCart', 'receiptNo', 'dateTime',
  'plateNo', 'customer', 'paymentMethod', 'itemActionHeader', 'subtotalHeader',
  'totalAmount', 'cashTendered', 'changeDue', 'thankYou'
];

// TEST CASES:
runTest('Country Matrix: All 8 target countries defined', () => {
  expectedCountries.forEach(code => {
    assert(countryCatalogs[code], `Country ${code} is missing from countryCatalogs`);
  });
});

runTest('i18n Completeness: All 8 countries have full translation dictionary', () => {
  expectedCountries.forEach(code => {
    const c = countryCatalogs[code];
    assert(c.i18n, `Country ${code} missing i18n object`);
    requiredI18nKeys.forEach(k => {
      assert(c.i18n[k], `Country ${code} missing i18n key '${k}'`);
    });
  });
});

runTest('UI Localization Mutation: Switch to Vietnam (Tiếng Việt)', () => {
  setCountryMarket('VN');
  assert.strictEqual(sandbox.currentCountryKey, 'VN');
  assert.strictEqual(elements['lblStep1'].textContent, '1. Chọn dòng xe máy của khách hàng');
  assert.strictEqual(elements['lblStep2'].textContent, '2. Thêm nhanh phụ tùng & tiền công');
  assert.strictEqual(elements['lblCartTitle'].textContent, 'Giỏ hàng lệnh sửa chữa (LSC)');
  assert.strictEqual(elements['lblGrandTotal'].textContent, 'Tổng thanh toán chuẩn xác');
  assert.strictEqual(elements['btnResetCart'].textContent, 'Xóa giỏ');
  assert.strictEqual(elements['btnDemoCheckout'].textContent, 'Thanh toán & In hóa đơn');
});

runTest('UI Localization Mutation: Switch to Thailand (ภาษาไทย)', () => {
  setCountryMarket('TH');
  assert.strictEqual(sandbox.currentCountryKey, 'TH');
  assert.strictEqual(elements['lblStep1'].textContent, '1. เลือกรุ่นรถจักรยานยนต์ของลูกค้า');
  assert.strictEqual(elements['lblGrandTotal'].textContent, 'ยอดรวมสุทธิที่คำนวณได้');
  assert.strictEqual(elements['btnDemoCheckout'].textContent, 'ชำระเงินและพิมพ์ใบเสร็จ');
});

runTest('UI Localization Mutation: Switch to Indonesia (Bahasa Indonesia)', () => {
  setCountryMarket('ID');
  assert.strictEqual(sandbox.currentCountryKey, 'ID');
  assert.strictEqual(elements['lblStep1'].textContent, '1. Pilih Kategori Kendaraan Pelanggan');
  assert.strictEqual(elements['lblCartTitle'].textContent, 'Keranjang Surat Perintah Kerja (SPK)');
  assert.strictEqual(elements['btnResetCart'].textContent, 'Kosongkan');
});

runTest('UI Localization Mutation: Switch to US (American English)', () => {
  setCountryMarket('US');
  assert.strictEqual(sandbox.currentCountryKey, 'US');
  assert.strictEqual(elements['lblStep1'].textContent, '1. Select Customer Vehicle Category');
  assert.strictEqual(elements['lblCartTitle'].textContent, 'Active Work Order Cart');
  assert.strictEqual(elements['btnResetCart'].textContent, 'Reset');
});

runTest('Thermal Receipt Localization: Country-specific receipt headers & labels in 40 columns', () => {
  // Test across all 8 countries that receipts generate with strict <= 40 chars per line
  expectedCountries.forEach(code => {
    setCountryMarket(code);
    const slip = elements['demoThermalSlip'].textContent;
    assert(slip.includes('WO-00042'), `Missing receipt number in ${code}`);
    const lines = slip.split('\n');
    lines.forEach((line, i) => {
      assert(line.length <= 40, `Country ${code} Line ${i + 1} exceeds 40 characters: [${line}] (${line.length} chars)`);
    });
  });
});

runTest('Checkout Simulation: Localized completion badge on button', () => {
  setCountryMarket('VN');
  simulateCheckout();
  assert.strictEqual(elements['btnDemoCheckout'].textContent, '✓ Đã thanh toán & In phiếu!');

  setCountryMarket('ID');
  simulateCheckout();
  assert.strictEqual(elements['btnDemoCheckout'].textContent, '✓ Transaksi Selesai & Dicetak!');
});

console.log(`\n================================================================`);
console.log(`WHITE-BOX RESULTS: ${passedTests}/${totalTests} Tests Passed (100% Green)`);
console.log(`================================================================`);
