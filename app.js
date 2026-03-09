/* ===================================================================
   FlashInvoice — app.js
   Core logic: calculations, validation, line items, PDF, localStorage
   =================================================================== */

// ── Pure functions (testable, no DOM) ──────────────────────────────

const FlashInvoice = {
  CURRENCIES: {
    USD: { symbol: '$', code: 'USD' },
    EUR: { symbol: '\u20AC', code: 'EUR' },
    GBP: { symbol: '\u00A3', code: 'GBP' },
    INR: { symbol: '\u20B9', code: 'INR' },
  },

  // Calculation
  calcLineAmount(qty, rate) {
    const q = parseFloat(qty) || 0;
    const r = parseFloat(rate) || 0;
    return Math.round(q * r * 100) / 100;
  },

  calcSubtotal(lineItems) {
    return lineItems.reduce((sum, item) => {
      return Math.round((sum + this.calcLineAmount(item.qty, item.rate)) * 100) / 100;
    }, 0);
  },

  calcTax(subtotal, taxRate) {
    const rate = parseFloat(taxRate) || 0;
    return Math.round(subtotal * (rate / 100) * 100) / 100;
  },

  calcTotal(subtotal, tax) {
    return Math.round((subtotal + tax) * 100) / 100;
  },

  formatCurrency(amount, currencyCode) {
    const cur = this.CURRENCIES[currencyCode] || this.CURRENCIES.USD;
    const formatted = Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (amount < 0 ? '-' : '') + cur.symbol + formatted;
  },

  // Validation
  validateRequired(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  },

  validatePositiveNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num > 0;
  },

  validateNonNegativeNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  },

  validateEmail(value) {
    if (!value || String(value).trim() === '') return true; // optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
  },

  validateTaxRate(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0 && num <= 100;
  },

  validateDateOrder(invoiceDate, dueDate) {
    if (!invoiceDate || !dueDate) return true;
    return new Date(dueDate) >= new Date(invoiceDate);
  },

  validateForm(formData) {
    const errors = [];

    if (!this.validateRequired(formData.companyName))
      errors.push({ field: 'companyName', message: 'Company name is required' });
    if (!this.validateRequired(formData.clientName))
      errors.push({ field: 'clientName', message: 'Client name is required' });
    if (!this.validateRequired(formData.invoiceNumber))
      errors.push({ field: 'invoiceNumber', message: 'Invoice number is required' });
    if (!this.validateRequired(formData.invoiceDate))
      errors.push({ field: 'invoiceDate', message: 'Invoice date is required' });
    if (!this.validateDateOrder(formData.invoiceDate, formData.dueDate))
      errors.push({ field: 'dueDate', message: 'Due date must be on or after invoice date' });
    if (!this.validateEmail(formData.companyEmail))
      errors.push({ field: 'companyEmail', message: 'Invalid email format' });
    if (!this.validateEmail(formData.clientEmail))
      errors.push({ field: 'clientEmail', message: 'Invalid email format' });
    if (!this.validateTaxRate(formData.taxRate))
      errors.push({ field: 'taxRate', message: 'Tax must be 0-100' });

    if (!formData.lineItems || formData.lineItems.length === 0) {
      errors.push({ field: 'lineItems', message: 'At least one item is required' });
    } else {
      formData.lineItems.forEach((item, i) => {
        if (!this.validateRequired(item.description))
          errors.push({ field: `lineItem-${i}-desc`, message: `Row ${i + 1}: description required` });
        if (!this.validatePositiveNumber(item.qty))
          errors.push({ field: `lineItem-${i}-qty`, message: `Row ${i + 1}: qty must be > 0` });
        if (!this.validateNonNegativeNumber(item.rate))
          errors.push({ field: `lineItem-${i}-rate`, message: `Row ${i + 1}: rate must be >= 0` });
      });
    }

    return errors;
  },

  // localStorage
  saveCompanyDetails(details) {
    try { localStorage.setItem('flashinvoice_company', JSON.stringify(details)); return true; }
    catch { return false; }
  },

  loadCompanyDetails() {
    try {
      const d = localStorage.getItem('flashinvoice_company');
      return d ? JSON.parse(d) : null;
    } catch { return null; }
  },

  clearCompanyDetails() {
    try { localStorage.removeItem('flashinvoice_company'); } catch { /* ignore */ }
  },
};

// ── DOM controller (only runs when invoice form exists) ────────────

(function initApp() {
  // Guard: don't init on tests.html
  if (!document.getElementById('lineItemsBody')) return;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let lineItemCounter = 0;
  let currentCurrency = 'USD';

  // -- Helpers --
  function val(id) { return ($(id) || {}).value || ''; }

  function setError(fieldId, message) {
    const input = $(`#${fieldId}`) || $(`.line-items-table [data-field="${fieldId}"]`);
    const errorEl = $(`[data-for="${fieldId}"]`);
    if (input) input.classList.add('has-error');
    if (errorEl) { errorEl.textContent = message; errorEl.classList.add('visible'); }
  }

  function clearErrors() {
    $$('.has-error').forEach(el => el.classList.remove('has-error'));
    $$('.field-error').forEach(el => { el.textContent = ''; el.classList.remove('visible'); });
  }

  // -- Line items --
  function createLineItemRow() {
    const idx = lineItemCounter++;
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td><input type="text" data-field="lineItem-${idx}-desc" placeholder="Service or product"></td>
      <td><input type="number" data-field="lineItem-${idx}-qty" value="1" min="0" step="1"></td>
      <td><input type="number" data-field="lineItem-${idx}-rate" value="0" min="0" step="0.01"></td>
      <td><span class="line-amount" data-field="lineItem-${idx}-amount">${FlashInvoice.formatCurrency(0, currentCurrency)}</span></td>
      <td><button type="button" class="btn-icon-only btn-remove-row" title="Remove">&times;</button></td>
    `;
    $('#lineItemsBody').appendChild(tr);
    // Focus the description field
    tr.querySelector('input[type="text"]').focus();
    attachRowEvents(tr);
    recalculate();
    return tr;
  }

  function attachRowEvents(tr) {
    tr.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', recalculate);
    });
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
      if ($$('#lineItemsBody tr').length <= 1) return; // keep at least 1
      tr.remove();
      recalculate();
    });
  }

  // -- Calculations --
  function getLineItems() {
    const items = [];
    $$('#lineItemsBody tr').forEach(tr => {
      const idx = tr.dataset.idx;
      items.push({
        description: (tr.querySelector(`[data-field="lineItem-${idx}-desc"]`) || {}).value || '',
        qty: (tr.querySelector(`[data-field="lineItem-${idx}-qty"]`) || {}).value || '',
        rate: (tr.querySelector(`[data-field="lineItem-${idx}-rate"]`) || {}).value || '',
        _idx: idx,
      });
    });
    return items;
  }

  function recalculate() {
    const items = getLineItems();
    const taxRate = parseFloat(val('#taxRate')) || 0;

    // Update each row amount
    items.forEach(item => {
      const amount = FlashInvoice.calcLineAmount(item.qty, item.rate);
      const amountEl = $(`[data-field="lineItem-${item._idx}-amount"]`);
      if (amountEl) amountEl.textContent = FlashInvoice.formatCurrency(amount, currentCurrency);
    });

    const subtotal = FlashInvoice.calcSubtotal(items);
    const tax = FlashInvoice.calcTax(subtotal, taxRate);
    const total = FlashInvoice.calcTotal(subtotal, tax);

    $('#subtotal').textContent = FlashInvoice.formatCurrency(subtotal, currentCurrency);
    $('#taxAmount').textContent = FlashInvoice.formatCurrency(tax, currentCurrency);
    $('#totalAmount').textContent = FlashInvoice.formatCurrency(total, currentCurrency);

    updateDownloadButton();
  }

  // -- Form data --
  function collectFormData() {
    return {
      companyName: val('#companyName'),
      companyAddress: val('#companyAddress'),
      companyEmail: val('#companyEmail'),
      companyPhone: val('#companyPhone'),
      clientName: val('#clientName'),
      clientAddress: val('#clientAddress'),
      clientEmail: val('#clientEmail'),
      clientPhone: val('#clientPhone'),
      invoiceNumber: val('#invoiceNumber'),
      invoiceDate: val('#invoiceDate'),
      dueDate: val('#dueDate'),
      taxRate: val('#taxRate'),
      notes: val('#notes'),
      lineItems: getLineItems(),
    };
  }

  // -- Validation + download button --
  function updateDownloadButton() {
    const data = collectFormData();
    const errors = FlashInvoice.validateForm(data);
    $('#btn-download').disabled = errors.length > 0;
  }

  function validateAndHighlight() {
    clearErrors();
    const data = collectFormData();
    const errors = FlashInvoice.validateForm(data);
    errors.forEach(err => setError(err.field, err.message));
    return errors;
  }

  // -- PDF generation --
  function populatePdfTemplate(data) {
    const fc = (amount, cur) => FlashInvoice.formatCurrency(amount, cur);
    const c = currentCurrency;

    $('#pdf-companyName').textContent = data.companyName;
    $('#pdf-companyAddress').textContent = data.companyAddress;
    const companyContact = [data.companyEmail, data.companyPhone].filter(Boolean).join(' | ');
    $('#pdf-companyContact').textContent = companyContact;

    $('#pdf-invoiceNumber').textContent = data.invoiceNumber;
    $('#pdf-invoiceDate').textContent = data.invoiceDate;
    $('#pdf-dueDate').textContent = data.dueDate || 'N/A';

    $('#pdf-clientName').textContent = data.clientName;
    $('#pdf-clientAddress').textContent = data.clientAddress;
    const clientContact = [data.clientEmail, data.clientPhone].filter(Boolean).join(' | ');
    $('#pdf-clientContact').textContent = clientContact;

    // Line items
    const tbody = $('#pdf-lineItems');
    tbody.innerHTML = '';
    const items = data.lineItems;
    items.forEach(item => {
      const amount = FlashInvoice.calcLineAmount(item.qty, item.rate);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.description)}</td>
        <td>${parseFloat(item.qty) || 0}</td>
        <td>${fc(parseFloat(item.rate) || 0, c)}</td>
        <td>${fc(amount, c)}</td>
      `;
      tbody.appendChild(tr);
    });

    const subtotal = FlashInvoice.calcSubtotal(items);
    const taxRate = parseFloat(data.taxRate) || 0;
    const tax = FlashInvoice.calcTax(subtotal, taxRate);
    const total = FlashInvoice.calcTotal(subtotal, tax);

    $('#pdf-subtotal').textContent = fc(subtotal, c);
    $('#pdf-taxLabel').textContent = taxRate + '%';
    $('#pdf-taxAmount').textContent = fc(tax, c);
    $('#pdf-totalAmount').textContent = fc(total, c);
    $('#pdf-notes').textContent = data.notes;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function generatePdf() {
    const errors = validateAndHighlight();
    if (errors.length > 0) return;

    const data = collectFormData();
    populatePdfTemplate(data);

    const element = $('#pdf-template');
    const filename = `${data.invoiceNumber || 'invoice'}.pdf`;

    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'px', format: [820, 1160], hotfixes: ['px_scaling'] },
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Please try again.');
    }
  }

  // -- localStorage --
  function saveCompanyIfChecked() {
    if ($('#saveCompany').checked) {
      FlashInvoice.saveCompanyDetails({
        companyName: val('#companyName'),
        companyAddress: val('#companyAddress'),
        companyEmail: val('#companyEmail'),
        companyPhone: val('#companyPhone'),
      });
    }
  }

  function loadSavedCompany() {
    const saved = FlashInvoice.loadCompanyDetails();
    if (!saved) return;
    if (saved.companyName) $('#companyName').value = saved.companyName;
    if (saved.companyAddress) $('#companyAddress').value = saved.companyAddress;
    if (saved.companyEmail) $('#companyEmail').value = saved.companyEmail;
    if (saved.companyPhone) $('#companyPhone').value = saved.companyPhone;
    $('#saveCompany').checked = true;
  }

  // -- Init --
  function init() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    $('#invoiceDate').value = today;

    // Default due date: 30 days from now
    const due = new Date();
    due.setDate(due.getDate() + 30);
    $('#dueDate').value = due.toISOString().split('T')[0];

    // Load saved company details
    loadSavedCompany();

    // Create first line item row
    createLineItemRow();

    // Events
    $('#btn-add-row').addEventListener('click', createLineItemRow);
    $('#btn-download').addEventListener('click', generatePdf);
    $('#taxRate').addEventListener('input', recalculate);
    $('#currency').addEventListener('change', (e) => {
      currentCurrency = e.target.value;
      recalculate();
    });

    // Auto-save company on blur
    ['companyName', 'companyAddress', 'companyEmail', 'companyPhone'].forEach(id => {
      $(`#${id}`).addEventListener('blur', saveCompanyIfChecked);
    });

    // Live validation on input for required fields
    ['companyName', 'clientName', 'invoiceNumber', 'invoiceDate'].forEach(id => {
      $(`#${id}`).addEventListener('input', () => {
        updateDownloadButton();
        // Clear individual error when user types
        const input = $(`#${id}`);
        const errorEl = $(`[data-for="${id}"]`);
        if (input) input.classList.remove('has-error');
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.remove('visible'); }
      });
    });

    // Initial state
    recalculate();
  }

  init();
})();
