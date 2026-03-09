/* ===================================================================
   FlashInvoice — Test Suite
   Zero-dependency test runner. Open tests.html in a browser.
   =================================================================== */

(function () {
  const results = [];
  let currentSuite = '';

  function suite(name) { currentSuite = name; }

  function test(name, fn) {
    try {
      fn();
      results.push({ suite: currentSuite, name, passed: true });
    } catch (e) {
      results.push({ suite: currentSuite, name, passed: false, error: e.message });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  function assertEqual(actual, expected, label) {
    if (actual !== expected)
      throw new Error(`${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  function assertClose(actual, expected, tolerance, label) {
    if (Math.abs(actual - expected) > tolerance)
      throw new Error(`${label || 'assertClose'}: expected ~${expected}, got ${actual} (tolerance ${tolerance})`);
  }

  const FI = FlashInvoice;

  // ═══════════════════════════════════════════════════════════════════
  // CALCULATION TESTS
  // ═══════════════════════════════════════════════════════════════════

  suite('Calculation: calcLineAmount');

  test('basic multiplication', () => {
    assertEqual(FI.calcLineAmount(2, 50), 100);
  });

  test('decimal precision', () => {
    assertEqual(FI.calcLineAmount(3, 19.99), 59.97);
  });

  test('zero quantity', () => {
    assertEqual(FI.calcLineAmount(0, 100), 0);
  });

  test('zero rate', () => {
    assertEqual(FI.calcLineAmount(5, 0), 0);
  });

  test('handles string inputs', () => {
    assertEqual(FI.calcLineAmount('3', '25'), 75);
  });

  test('handles empty/NaN inputs', () => {
    assertEqual(FI.calcLineAmount('', 50), 0);
    assertEqual(FI.calcLineAmount(2, ''), 0);
    assertEqual(FI.calcLineAmount('abc', 10), 0);
  });

  test('no floating point drift (0.1 * 0.2)', () => {
    // 0.1 * 0.2 = 0.02 (not 0.020000000000000004)
    assertEqual(FI.calcLineAmount(0.1, 0.2), 0.02);
  });

  test('large numbers', () => {
    assertEqual(FI.calcLineAmount(1000, 9999.99), 9999990);
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Calculation: calcSubtotal');

  test('sums multiple items', () => {
    const items = [
      { qty: 2, rate: 50 },
      { qty: 1, rate: 100 },
      { qty: 3, rate: 33.33 },
    ];
    assertEqual(FI.calcSubtotal(items), 299.99);
  });

  test('empty array returns 0', () => {
    assertEqual(FI.calcSubtotal([]), 0);
  });

  test('single item', () => {
    assertEqual(FI.calcSubtotal([{ qty: 1, rate: 250 }]), 250);
  });

  test('handles NaN in items gracefully', () => {
    const items = [{ qty: 2, rate: 50 }, { qty: 'bad', rate: 100 }];
    assertEqual(FI.calcSubtotal(items), 100);
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Calculation: calcTax');

  test('10% tax', () => {
    assertEqual(FI.calcTax(1000, 10), 100);
  });

  test('0% tax', () => {
    assertEqual(FI.calcTax(500, 0), 0);
  });

  test('fractional tax rate', () => {
    assertEqual(FI.calcTax(200, 7.5), 15);
  });

  test('handles NaN rate', () => {
    assertEqual(FI.calcTax(100, 'abc'), 0);
  });

  test('rounds to 2 decimals', () => {
    // 333 * 0.07 = 23.31
    assertEqual(FI.calcTax(333, 7), 23.31);
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Calculation: calcTotal');

  test('basic addition', () => {
    assertEqual(FI.calcTotal(1000, 100), 1100);
  });

  test('zero tax', () => {
    assertEqual(FI.calcTotal(500, 0), 500);
  });

  test('rounds correctly', () => {
    assertEqual(FI.calcTotal(99.99, 7.50), 107.49);
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Calculation: formatCurrency');

  test('USD formatting', () => {
    assertEqual(FI.formatCurrency(1234.56, 'USD'), '$1,234.56');
  });

  test('EUR formatting', () => {
    assertEqual(FI.formatCurrency(999, 'EUR'), '\u20AC999.00');
  });

  test('GBP formatting', () => {
    assertEqual(FI.formatCurrency(50.5, 'GBP'), '\u00A350.50');
  });

  test('INR formatting', () => {
    assertEqual(FI.formatCurrency(0, 'INR'), '\u20B90.00');
  });

  test('unknown currency defaults to $', () => {
    assertEqual(FI.formatCurrency(10, 'XYZ'), '$10.00');
  });

  test('large number with commas', () => {
    assertEqual(FI.formatCurrency(1000000, 'USD'), '$1,000,000.00');
  });

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════

  suite('Validation: validateRequired');

  test('non-empty string passes', () => {
    assert(FI.validateRequired('hello'));
  });

  test('empty string fails', () => {
    assert(!FI.validateRequired(''));
  });

  test('whitespace-only fails', () => {
    assert(!FI.validateRequired('   '));
  });

  test('null fails', () => {
    assert(!FI.validateRequired(null));
  });

  test('undefined fails', () => {
    assert(!FI.validateRequired(undefined));
  });

  test('number 0 passes (truthy check)', () => {
    assert(FI.validateRequired(0));
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Validation: validatePositiveNumber');

  test('positive number passes', () => {
    assert(FI.validatePositiveNumber(5));
  });

  test('zero fails', () => {
    assert(!FI.validatePositiveNumber(0));
  });

  test('negative fails', () => {
    assert(!FI.validatePositiveNumber(-1));
  });

  test('string number passes', () => {
    assert(FI.validatePositiveNumber('3.5'));
  });

  test('non-numeric fails', () => {
    assert(!FI.validatePositiveNumber('abc'));
  });

  test('empty string fails', () => {
    assert(!FI.validatePositiveNumber(''));
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Validation: validateNonNegativeNumber');

  test('zero passes', () => {
    assert(FI.validateNonNegativeNumber(0));
  });

  test('positive passes', () => {
    assert(FI.validateNonNegativeNumber(10));
  });

  test('negative fails', () => {
    assert(!FI.validateNonNegativeNumber(-0.01));
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Validation: validateEmail');

  test('valid email passes', () => {
    assert(FI.validateEmail('test@example.com'));
  });

  test('empty string passes (optional)', () => {
    assert(FI.validateEmail(''));
  });

  test('null passes (optional)', () => {
    assert(FI.validateEmail(null));
  });

  test('missing @ fails', () => {
    assert(!FI.validateEmail('testexample.com'));
  });

  test('missing domain fails', () => {
    assert(!FI.validateEmail('test@'));
  });

  test('spaces fail', () => {
    assert(!FI.validateEmail('test @example.com'));
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Validation: validateTaxRate');

  test('0 passes', () => {
    assert(FI.validateTaxRate(0));
  });

  test('100 passes', () => {
    assert(FI.validateTaxRate(100));
  });

  test('50.5 passes', () => {
    assert(FI.validateTaxRate(50.5));
  });

  test('-1 fails', () => {
    assert(!FI.validateTaxRate(-1));
  });

  test('101 fails', () => {
    assert(!FI.validateTaxRate(101));
  });

  test('NaN fails', () => {
    assert(!FI.validateTaxRate('abc'));
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Validation: validateDateOrder');

  test('due date after invoice date passes', () => {
    assert(FI.validateDateOrder('2026-01-01', '2026-01-31'));
  });

  test('same date passes', () => {
    assert(FI.validateDateOrder('2026-03-01', '2026-03-01'));
  });

  test('due date before invoice date fails', () => {
    assert(!FI.validateDateOrder('2026-06-15', '2026-06-01'));
  });

  test('empty due date passes (optional)', () => {
    assert(FI.validateDateOrder('2026-01-01', ''));
  });

  test('both empty passes', () => {
    assert(FI.validateDateOrder('', ''));
  });

  // ─────────────────────────────────────────────────────────────────

  suite('Validation: validateForm (integration)');

  function validForm(overrides) {
    return Object.assign({
      companyName: 'Acme Corp',
      companyEmail: 'a@b.com',
      clientName: 'Client Inc',
      clientEmail: 'c@d.com',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      taxRate: '10',
      lineItems: [{ description: 'Web design', qty: '1', rate: '2500' }],
    }, overrides);
  }

  test('valid form returns no errors', () => {
    const errors = FI.validateForm(validForm());
    assertEqual(errors.length, 0, 'error count');
  });

  test('missing company name returns error', () => {
    const errors = FI.validateForm(validForm({ companyName: '' }));
    assert(errors.length > 0);
    assert(errors.some(e => e.field === 'companyName'));
  });

  test('missing client name returns error', () => {
    const errors = FI.validateForm(validForm({ clientName: '' }));
    assert(errors.some(e => e.field === 'clientName'));
  });

  test('missing invoice number returns error', () => {
    const errors = FI.validateForm(validForm({ invoiceNumber: '' }));
    assert(errors.some(e => e.field === 'invoiceNumber'));
  });

  test('missing invoice date returns error', () => {
    const errors = FI.validateForm(validForm({ invoiceDate: '' }));
    assert(errors.some(e => e.field === 'invoiceDate'));
  });

  test('invalid company email returns error', () => {
    const errors = FI.validateForm(validForm({ companyEmail: 'bad-email' }));
    assert(errors.some(e => e.field === 'companyEmail'));
  });

  test('due date before invoice date returns error', () => {
    const errors = FI.validateForm(validForm({ invoiceDate: '2026-06-15', dueDate: '2026-06-01' }));
    assert(errors.some(e => e.field === 'dueDate'));
  });

  test('tax rate 150 returns error', () => {
    const errors = FI.validateForm(validForm({ taxRate: '150' }));
    assert(errors.some(e => e.field === 'taxRate'));
  });

  test('empty line items returns error', () => {
    const errors = FI.validateForm(validForm({ lineItems: [] }));
    assert(errors.some(e => e.field === 'lineItems'));
  });

  test('line item with empty description returns error', () => {
    const errors = FI.validateForm(validForm({
      lineItems: [{ description: '', qty: '1', rate: '100' }],
    }));
    assert(errors.some(e => e.field.includes('desc')));
  });

  test('line item with zero qty returns error', () => {
    const errors = FI.validateForm(validForm({
      lineItems: [{ description: 'Test', qty: '0', rate: '100' }],
    }));
    assert(errors.some(e => e.field.includes('qty')));
  });

  test('line item with negative rate returns error', () => {
    const errors = FI.validateForm(validForm({
      lineItems: [{ description: 'Test', qty: '1', rate: '-5' }],
    }));
    assert(errors.some(e => e.field.includes('rate')));
  });

  test('multiple errors reported simultaneously', () => {
    const errors = FI.validateForm({
      companyName: '',
      clientName: '',
      invoiceNumber: '',
      invoiceDate: '',
      companyEmail: 'bad',
      clientEmail: 'bad',
      taxRate: '-5',
      lineItems: [],
    });
    assert(errors.length >= 7, `Expected >= 7 errors, got ${errors.length}`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // LOCALSTORAGE TESTS
  // ═══════════════════════════════════════════════════════════════════

  suite('localStorage');

  test('save and load round-trips', () => {
    const data = { companyName: 'Test Co', companyAddress: '123 St', companyEmail: 'a@b.com', companyPhone: '555' };
    FI.saveCompanyDetails(data);
    const loaded = FI.loadCompanyDetails();
    assertEqual(loaded.companyName, 'Test Co');
    assertEqual(loaded.companyAddress, '123 St');
    assertEqual(loaded.companyEmail, 'a@b.com');
    FI.clearCompanyDetails(); // cleanup
  });

  test('loadCompanyDetails returns null when empty', () => {
    FI.clearCompanyDetails();
    const loaded = FI.loadCompanyDetails();
    assertEqual(loaded, null);
  });

  test('handles corrupt localStorage gracefully', () => {
    localStorage.setItem('flashinvoice_company', 'not-json{{{');
    const loaded = FI.loadCompanyDetails();
    assertEqual(loaded, null);
    FI.clearCompanyDetails();
  });

  // ═══════════════════════════════════════════════════════════════════
  // END-TO-END CALCULATION TESTS
  // ═══════════════════════════════════════════════════════════════════

  suite('End-to-end calculation');

  test('full invoice calculation', () => {
    const items = [
      { qty: 1, rate: 2500 },
      { qty: 2, rate: 150 },
      { qty: 5, rate: 75 },
    ];
    const subtotal = FI.calcSubtotal(items);     // 2500 + 300 + 375 = 3175
    const tax = FI.calcTax(subtotal, 10);          // 317.50
    const total = FI.calcTotal(subtotal, tax);     // 3492.50

    assertEqual(subtotal, 3175);
    assertEqual(tax, 317.5);
    assertEqual(total, 3492.5);
  });

  test('invoice with 0% tax', () => {
    const items = [{ qty: 3, rate: 99.99 }];
    const subtotal = FI.calcSubtotal(items);       // 299.97
    const tax = FI.calcTax(subtotal, 0);
    const total = FI.calcTotal(subtotal, tax);

    assertEqual(subtotal, 299.97);
    assertEqual(tax, 0);
    assertEqual(total, 299.97);
  });

  test('single penny item', () => {
    const items = [{ qty: 1, rate: 0.01 }];
    const subtotal = FI.calcSubtotal(items);
    assertEqual(subtotal, 0.01);
    assertEqual(FI.calcTotal(subtotal, FI.calcTax(subtotal, 10)), 0.01); // tax rounds to 0
  });

  // ═══════════════════════════════════════════════════════════════════
  // RENDER RESULTS
  // ═══════════════════════════════════════════════════════════════════

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  const summaryEl = document.getElementById('summary');
  summaryEl.className = `summary ${failed === 0 ? 'pass' : 'fail'}`;
  summaryEl.textContent = failed === 0
    ? `ALL ${total} TESTS PASSED`
    : `${failed} FAILED, ${passed} passed out of ${total} tests`;

  const resultsEl = document.getElementById('results');
  let lastSuite = '';

  results.forEach(r => {
    if (r.suite !== lastSuite) {
      lastSuite = r.suite;
      const div = document.createElement('div');
      div.className = 'suite';
      div.innerHTML = `<div class="suite-name">${r.suite}</div>`;
      resultsEl.appendChild(div);
    }
    const suiteEl = resultsEl.lastElementChild;
    const testDiv = document.createElement('div');
    testDiv.className = `test ${r.passed ? 'pass' : 'fail'}`;
    testDiv.innerHTML = `<span class="label">${r.name}</span>${r.error ? `<span class="error">${r.error}</span>` : ''}`;
    suiteEl.appendChild(testDiv);
  });

  // Also log to console for CI/automation
  console.log(`\n=== FlashInvoice Tests: ${passed}/${total} passed ===`);
  if (failed > 0) {
    results.filter(r => !r.passed).forEach(r => {
      console.error(`FAIL: [${r.suite}] ${r.name} — ${r.error}`);
    });
  }
})();
