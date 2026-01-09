/**
 * Swiss Payment Code (SPC) Parser - Enhanced Version
 * Based on working QR-reader implementation
 * Parses QR-bill data according to Swiss Payment Standards
 * 
 * Key improvements:
 * - Handles both address types: S (structured) and K (combined)
 * - Properly builds full addresses from parts
 * - Extracts all available fields including billing info
 */

export function parseSwissQR(rawData) {
  if (!rawData || typeof rawData !== 'string') {
    return null;
  }

  console.log('Parsing QR data:', rawData.substring(0, 100) + '...');
  
  // Check for Swiss QR payment format (SPC)
  if (!rawData.startsWith('SPC')) {
    console.log('Not a Swiss QR code, trying generic parser');
    return parseGenericQR(rawData);
  }

  console.log('Detected Swiss QR payment format (SPC)');
  const lines = rawData.split(/\r?\n/);

  if (lines.length < 20) {
    console.error('Invalid SPC format: insufficient lines');
    return null;
  }

  try {
    const result = {
      // Header
      qrType: lines[0],           // SPC
      version: lines[1],          // 0200
      coding: lines[2],           // 1 = UTF-8
      rawText: rawData
    };

    // Line 3: IBAN
    if (lines[3] && lines[3].match(/^[A-Z]{2}\d+/)) {
      result.iban = lines[3];
      result.accountNumber = lines[3];
    }

    // Lines 4-10: Creditor (Beneficiary) information
    const creditorAddressType = lines[4]; // S = structured, K = combined
    result.creditorAddressType = creditorAddressType;

    if (lines[5] && lines[5].trim()) {
      result.creditorName = lines[5].trim();
      result.companyName = lines[5].trim();
      result.vendorName = lines[5].trim();
    }

    // Parse creditor address based on type
    if (creditorAddressType === 'S') {
      // Structured address
      if (lines[6]) result.creditorStreet = lines[6];
      if (lines[7]) result.creditorBuildingNumber = lines[7];
      if (lines[8]) result.creditorPostalCode = lines[8];
      if (lines[9]) result.creditorCity = lines[9];
      if (lines[10]) result.creditorCountry = lines[10];
    } else if (creditorAddressType === 'K') {
      // Combined address (address in 2 lines)
      if (lines[6]) result.creditorAddressLine1 = lines[6];
      if (lines[7]) result.creditorAddressLine2 = lines[7];
      // Lines 8-9 may be empty for K type, but we try anyway
      if (lines[8]) result.creditorPostalCode = lines[8];
      if (lines[9]) result.creditorCity = lines[9];
      if (lines[10]) result.creditorCountry = lines[10];
    }

    // Build full creditor address for display
    result.creditorAddress = buildAddress(
      result.creditorStreet || result.creditorAddressLine1,
      result.creditorBuildingNumber || result.creditorAddressLine2,
      result.creditorPostalCode,
      result.creditorCity,
      result.creditorCountry
    );
    result.vendorAddress = result.creditorAddress;

    // Lines 11-17: Ultimate creditor (optional - usually empty)
    const ultimateCreditorType = lines[11];
    if (ultimateCreditorType && ultimateCreditorType.trim()) {
      result.ultimateCreditorAddressType = ultimateCreditorType;
      if (lines[12]) result.ultimateCreditorName = lines[12];
      if (ultimateCreditorType === 'S') {
        if (lines[13]) result.ultimateCreditorStreet = lines[13];
        if (lines[14]) result.ultimateCreditorBuildingNumber = lines[14];
        if (lines[15]) result.ultimateCreditorPostalCode = lines[15];
        if (lines[16]) result.ultimateCreditorCity = lines[16];
        if (lines[17]) result.ultimateCreditorCountry = lines[17];
      } else if (ultimateCreditorType === 'K') {
        if (lines[13]) result.ultimateCreditorAddressLine1 = lines[13];
        if (lines[14]) result.ultimateCreditorAddressLine2 = lines[14];
        if (lines[15]) result.ultimateCreditorPostalCode = lines[15];
        if (lines[16]) result.ultimateCreditorCity = lines[16];
        if (lines[17]) result.ultimateCreditorCountry = lines[17];
      }
    }

    // Line 18: Amount
    if (lines[18] && lines[18].match(/^\d+\.?\d*$/)) {
      result.amount = parseFloat(lines[18]);
      result.totalAmount = lines[18];
    }

    // Line 19: Currency
    result.currency = lines[19] || 'CHF';

    // Lines 20-26: Ultimate debtor (payer) information
    const debtorAddressType = lines[20];
    if (debtorAddressType && debtorAddressType.trim()) {
      result.debtorAddressType = debtorAddressType;
      if (lines[21]) result.debtorName = lines[21];

      if (debtorAddressType === 'S') {
        // Structured address
        if (lines[22]) result.debtorStreet = lines[22];
        if (lines[23]) result.debtorBuildingNumber = lines[23];
        if (lines[24]) result.debtorPostalCode = lines[24];
        if (lines[25]) result.debtorCity = lines[25];
        if (lines[26]) result.debtorCountry = lines[26];
      } else if (debtorAddressType === 'K') {
        // Combined address
        if (lines[22]) result.debtorAddressLine1 = lines[22];
        if (lines[23]) result.debtorAddressLine2 = lines[23];
        if (lines[24]) result.debtorPostalCode = lines[24];
        if (lines[25]) result.debtorCity = lines[25];
        if (lines[26]) result.debtorCountry = lines[26];
      }

      // Build full debtor address
      result.debtorAddress = buildAddress(
        result.debtorStreet || result.debtorAddressLine1,
        result.debtorBuildingNumber || result.debtorAddressLine2,
        result.debtorPostalCode,
        result.debtorCity,
        result.debtorCountry
      );
    }

    // Line 27: Reference type (QRR, SCOR, NON)
    const refType = lines[27];
    if (refType) {
      result.referenceType = refType;

      // Line 28: Reference number
      if (refType !== 'NON' && lines[28]) {
        result.reference = lines[28];
        result.paymentReference = formatReference(refType, lines[28]);
        if (refType === 'QRR') {
          result.qrReference = lines[28];
        } else if (refType === 'SCOR') {
          result.creditorReference = lines[28];
        }
      }
    }

    // Line 29: Unstructured message (additional information)
    if (lines[29] && lines[29].trim()) {
      result.additionalInformation = lines[29];
      result.message = lines[29];
    }

    // Line 30: Trailer (EPD = End Payment Data)
    if (lines[30]) {
      result.trailer = lines[30];
    }

    // Line 31+: Billing information (optional structured data)
    if (lines[31] && lines[31].trim()) {
      result.billingInformation = lines[31];
      parseBillingInfo(lines[31], result);
    }

    // Alternative parameters (AV1, AV2) - lines 32, 33
    if (lines[32] && lines[32].trim()) {
      result.alternativeScheme1 = lines[32];
    }
    if (lines[33] && lines[33].trim()) {
      result.alternativeScheme2 = lines[33];
    }

    console.log('Parsed Swiss QR format (complete):', {
      vendorName: result.vendorName,
      vendorAddress: result.vendorAddress,
      iban: result.iban,
      debtorName: result.debtorName,
      amount: result.amount,
      currency: result.currency,
      referenceType: result.referenceType,
      paymentReference: result.paymentReference
    });

    return result;

  } catch (error) {
    console.error('Error parsing Swiss QR code:', error);
    return null;
  }
}

/**
 * Build a formatted address string from parts
 */
function buildAddress(streetOrLine1, buildingOrLine2, postalCode, city, country) {
  const parts = [];
  
  if (streetOrLine1) {
    if (buildingOrLine2 && !buildingOrLine2.match(/^\d{4,5}\s/)) {
      // Building number or second line (not postal code)
      parts.push(`${streetOrLine1} ${buildingOrLine2}`.trim());
    } else {
      parts.push(streetOrLine1);
      if (buildingOrLine2) parts.push(buildingOrLine2);
    }
  } else if (buildingOrLine2) {
    parts.push(buildingOrLine2);
  }
  
  if (postalCode || city) {
    const cityLine = [postalCode, city].filter(Boolean).join(' ');
    if (cityLine) parts.push(cityLine);
  }
  
  if (country && country !== 'CH') {
    parts.push(country);
  }
  
  return parts.join(', ');
}

/**
 * Format reference number based on type
 */
function formatReference(type, reference) {
  if (!reference) return '';
  
  // Format QR reference (26 digits + check digit = 27 total)
  if (type === 'QRR' && reference.length === 27) {
    // Format: XX XXXXX XXXXX XXXXX XXXXX XXXXX X
    return reference.replace(/(\d{2})(\d{5})(\d{5})(\d{5})(\d{5})(\d{5})/, '$1 $2 $3 $4 $5 $6');
  }
  
  // SCOR references can have various formats
  if (type === 'SCOR') {
    return reference;
  }
  
  return reference;
}

/**
 * Parse billing information from structured format
 */
function parseBillingInfo(billingStr, result) {
  if (!billingStr) return;
  
  // Format: //[key]/[value]
  const parts = billingStr.split('//');
  parts.forEach(part => {
    if (part.includes('/')) {
      const [key, ...valueParts] = part.split('/');
      const value = valueParts.join('/');
      if (key && value) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('invoice') || keyLower.includes('facture')) {
          result.invoiceNumber = value;
        } else if (keyLower.includes('date')) {
          result.invoiceDate = value;
        } else if (keyLower.includes('vat') || keyLower.includes('tax') || keyLower.includes('tva')) {
          result.vatNumber = value;
        } else if (keyLower.includes('order') || keyLower.includes('commande')) {
          result.orderNumber = value;
        }
      }
    }
  });
}

/**
 * Parse generic (non-Swiss) QR codes
 */
function parseGenericQR(rawData) {
  const data = {
    rawData: rawData,
    qrType: 'GENERIC'
  };

  // Try to find IBAN (Swiss format)
  const ibanMatch = rawData.match(/CH[\s]?[0-9]{2}[\s]?([0-9]{4}[\s]?){4}[0-9]/i);
  if (ibanMatch) {
    data.iban = ibanMatch[0].replace(/\s/g, '');
  }

  // Try to find amount
  const amountMatch = rawData.match(/(?:CHF|EUR)[\s]?([0-9]+[.,][0-9]{2})/i);
  if (amountMatch) {
    data.amount = parseFloat(amountMatch[1].replace(',', '.'));
    data.currency = rawData.includes('EUR') ? 'EUR' : 'CHF';
  }

  // Try to extract common patterns
  const dateMatch = rawData.match(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/);
  if (dateMatch) {
    data.invoiceDate = dateMatch[0];
  }

  return data;
}

/**
 * Extract invoice data in a format suitable for the webhook
 */
export function extractInvoiceData(qrData, ocrText = '') {
  if (!qrData) {
    return {
      vendorName: '',
      vendorAddress: '',
      vendorIBAN: '',
      debtorName: '',
      debtorAddress: '',
      amount: 0,
      currency: 'CHF',
      paymentReference: '',
      referenceType: '',
      message: '',
      vendorInvoiceNo: '',
      invoiceDate: '',
      description: '',
      vendorNo: '',
      glAccount: '',
      dimension1: '',
      dimension2: ''
    };
  }

  return {
    // From QR code - Vendor/Creditor info
    vendorName: qrData.vendorName || qrData.creditorName || '',
    vendorAddress: qrData.vendorAddress || qrData.creditorAddress || '',
    vendorIBAN: qrData.iban || '',
    
    // Debtor/Payer info
    debtorName: qrData.debtorName || '',
    debtorAddress: qrData.debtorAddress || '',
    
    // Payment details
    amount: qrData.amount || 0,
    currency: qrData.currency || 'CHF',
    
    // Reference
    paymentReference: qrData.paymentReference || qrData.reference || '',
    referenceType: qrData.referenceType || '',
    message: qrData.message || qrData.additionalInformation || '',
    
    // Invoice details (may come from OCR or billing info)
    vendorInvoiceNo: qrData.invoiceNumber || '',
    invoiceDate: qrData.invoiceDate || '',
    description: qrData.message || qrData.additionalInformation || '',
    
    // For BC mapping (filled by n8n workflow)
    vendorNo: '',
    glAccount: '',
    dimension1: '',
    dimension2: ''
  };
}
