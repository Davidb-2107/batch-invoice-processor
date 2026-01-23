/**
 * Swiss QR Code Parser
 * 
 * AUTO-GENERATED - DO NOT EDIT DIRECTLY
 * Source: QR-reader/client/src/lib/qr-scanner.ts
 * Synced by GitHub Action
 * 
 * Last sync: 2026-01-10T09:13:20.092Z
 */

/**
 * Parse Swiss QR bill format (SPC)
 * Specification: https://www.paymentstandards.ch/dam/downloads/ig-qr-bill-en.pdf
 */
function parseQRData(rawData) {
  console.log('Parsing QR data:', rawData.substring(0, 100) + '...');
  
  try {
    // Try to parse as JSON first
    const jsonData = JSON.parse(rawData);
    console.log('Successfully parsed as JSON');
    return jsonData;
  } catch {
    // If not JSON, try to parse as structured data
    const data = {};
    
    // Check for Swiss QR payment format (SPC)
    if (rawData.startsWith('SPC')) {
      console.log('Detected Swiss QR payment format (SPC)');
      const lines = rawData.split(/\r?\n/);

      if (lines.length > 3) {
        const result = { rawText: rawData };

        // Line 0: SPC identifier
        // Line 1: Version (e.g., "0200")
        if (lines[1]) result.version = lines[1];

        // Line 2: Coding type (1 = UTF-8)
        // Line 3: IBAN
        if (lines[3] && lines[3].match(/^[A-Z]{2}\d+/)) {
          result.iban = lines[3];
          result.accountNumber = lines[3]; // Also map to account number
        }

        // Lines 4-11: Creditor information
        const creditorAddressType = lines[4]; // S = structured, K = combined
        result.creditorAddressType = creditorAddressType;

        if (lines[5] && lines[5].trim()) {
          result.companyName = lines[5].trim();
          result.vendorName = lines[5].trim(); // Alias for compatibility
        }

        if (creditorAddressType === 'S') {
          // Structured address
          if (lines[6]) result.creditorStreet = lines[6];
          if (lines[7]) result.creditorBuildingNumber = lines[7];
          if (lines[8]) result.creditorPostalCode = lines[8];
          if (lines[9]) result.creditorCity = lines[9];
          if (lines[10]) result.creditorCountry = lines[10];
        } else if (creditorAddressType === 'K') {
          // Combined address
          if (lines[6]) result.creditorAddressLine1 = lines[6];
          if (lines[7]) result.creditorAddressLine2 = lines[7];
          if (lines[8]) result.creditorPostalCode = lines[8];
          if (lines[9]) result.creditorCity = lines[9];
          if (lines[10]) result.creditorCountry = lines[10];
        }

        // Build full address for display
        const addressParts = [];
        if (result.creditorStreet || result.creditorAddressLine1) {
          addressParts.push(result.creditorStreet || result.creditorAddressLine1);
        }
        if (result.creditorBuildingNumber || result.creditorAddressLine2) {
          addressParts.push(result.creditorBuildingNumber || result.creditorAddressLine2);
        }
        if (result.creditorPostalCode || result.creditorCity) {
          const cityLine = [result.creditorPostalCode, result.creditorCity].filter(Boolean).join(' ');
          if (cityLine) addressParts.push(cityLine);
        }
        if (result.creditorCountry) addressParts.push(result.creditorCountry);
        if (addressParts.length > 0) {
          result.vendorAddress = addressParts.join(', ');
        }

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
          result.amount = lines[18];
          result.totalAmount = lines[18]; // Alias
        }

        // Line 19: Currency
        if (lines[19]) {
          result.currency = lines[19];
        }

        // Lines 20-26: Ultimate debtor (payer) information
        const debtorAddressType = lines[20];
        if (debtorAddressType && debtorAddressType.trim()) {
          result.debtorAddressType = debtorAddressType;
          if (lines[21]) result.debtorName = lines[21];

          if (debtorAddressType === 'S') {
            if (lines[22]) result.debtorStreet = lines[22];
            if (lines[23]) result.debtorBuildingNumber = lines[23];
            if (lines[24]) result.debtorPostalCode = lines[24];
            if (lines[25]) result.debtorCity = lines[25];
            if (lines[26]) result.debtorCountry = lines[26];
          } else if (debtorAddressType === 'K') {
            if (lines[22]) result.debtorAddressLine1 = lines[22];
            if (lines[23]) result.debtorAddressLine2 = lines[23];
            if (lines[24]) result.debtorPostalCode = lines[24];
            if (lines[25]) result.debtorCity = lines[25];
            if (lines[26]) result.debtorCountry = lines[26];
          }

          // Build full debtor address
          const debtorAddressParts = [];
          if (result.debtorStreet || result.debtorAddressLine1) {
            debtorAddressParts.push(result.debtorStreet || result.debtorAddressLine1);
          }
          if (result.debtorBuildingNumber || result.debtorAddressLine2) {
            debtorAddressParts.push(result.debtorBuildingNumber || result.debtorAddressLine2);
          }
          if (result.debtorPostalCode || result.debtorCity) {
            const cityLine = [result.debtorPostalCode, result.debtorCity].filter(Boolean).join(' ');
            if (cityLine) debtorAddressParts.push(cityLine);
          }
          if (result.debtorCountry) debtorAddressParts.push(result.debtorCountry);
          if (debtorAddressParts.length > 0) {
            result.debtorAddress = debtorAddressParts.join(', ');
          }
        }

        // Line 27: Reference type (QRR, SCOR, NON)
        const refType = lines[27];
        if (refType) {
          result.referenceType = refType;

          // Line 28: Reference number
          if (refType !== 'NON' && lines[28]) {
            result.reference = lines[28];
            result.paymentReference = lines[28]; // Alias
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
          result.message = lines[29]; // Alias
        }

        // Line 30: Trailer (EPD = End Payment Data)
        // Line 31+: Billing information (optional structured data)
        if (lines[31] && lines[31].trim()) {
          result.billingInformation = lines[31];

          // Parse billing information if structured
          // Format: //[key]/[value]
          const billingParts = lines[31].split('//');
          billingParts.forEach(part => {
            if (part.includes('/')) {
              const [key, value] = part.split('/');
              if (key && value) {
                // Common billing fields
                if (key.toLowerCase().includes('invoice')) {
                  result.invoiceNumber = value;
                } else if (key.toLowerCase().includes('date')) {
                  result.invoiceDate = value;
                } else if (key.toLowerCase().includes('vat') || key.toLowerCase().includes('tax')) {
                  result.vatNumber = value;
                }
              }
            }
          });
        }

        // Alternative parameters (AV1, AV2) - lines 32, 33
        if (lines[32] && lines[32].trim()) {
          result.alternativeScheme1 = lines[32];
        }
        if (lines[33] && lines[33].trim()) {
          result.alternativeScheme2 = lines[33];
        }

        console.log('Parsed Swiss QR format (complete):', result);
        return result;
      }
    }
    
    // Try to parse as key-value pairs
    const lines = rawData.split(/[\n\r|;]/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Try different separators
      for (const separator of [':', '=', '\t']) {
        if (trimmed.includes(separator)) {
          const [key, ...valueParts] = trimmed.split(separator);
          const value = valueParts.join(separator).trim();
          if (key && value) {
            data[key.trim()] = value;
            break;
          }
        }
      }
    }
    
    // Try to parse URL-encoded data
    if (Object.keys(data).length === 0 && rawData.includes('=') && rawData.includes('&')) {
      try {
        const urlParams = new URLSearchParams(rawData);
        urlParams.forEach((value, key) => {
          data[key] = value;
        });
      } catch (e) {
        // Silent fail
      }
    }
    
    // If still no structured data found, return raw text with pattern extraction
    if (Object.keys(data).length === 0) {
      return { 
        rawText: rawData,
        // Try to extract common patterns
        ...(rawData.match(/\d{4}-\d{2}-\d{2}/) && { date: rawData.match(/\d{4}-\d{2}-\d{2}/)?.[0] }),
        ...(rawData.match(/[\d,]+\.?\d*/) && { amount: rawData.match(/[\d,]+\.?\d*/)?.[0] }),
        ...(rawData.match(/\b[A-Z]{2}\d+\b/g) && { invoice: rawData.match(/\b[A-Z]{2}\d+\b/g)?.[0] })
      };
    }
    
    return data;
  }
}

/**
 * Parse Swico billing information format
 * Format: //S1/10/invoiceNo/11/date/20/customerRef/30/vatNo/32/vatDetails/40/conditions
 */
function parseSwicoFormat(billingInfo) {
  const result = {};
  
  if (!billingInfo || !billingInfo.startsWith('//S1/')) {
    return result;
  }
  
  // Remove //S1/ prefix and split by /
  const data = billingInfo.substring(5);
  const parts = data.split('/');
  
  // Parse code/value pairs
  for (let i = 0; i < parts.length - 1; i += 2) {
    const code = parts[i];
    const value = parts[i + 1];
    
    if (!code || !value) continue;
    
    switch (code) {
      case '10':
        result.invoiceNumber = value;
        break;
      case '11':
        result.invoiceDate = formatSwicoDate(value);
        break;
      case '20':
        result.customerReference = value;
        break;
      case '30':
        result.vatNumber = value;
        break;
      case '31':
        result.vatDate = formatSwicoDate(value);
        break;
      case '32':
        result.vatDetails = parseVatDetails(value);
        break;
      case '40':
        result.paymentConditions = value;
        break;
      default:
        // Unknown Swico code - ignore silently
        break;
    }
  }
  
  return result;
}

/**
 * Format Swico date from YYMMDD to YYYY-MM-DD
 */
function formatSwicoDate(dateStr) {
  if (!dateStr || dateStr.length !== 6) return dateStr;
  
  const yy = dateStr.substring(0, 2);
  const mm = dateStr.substring(2, 4);
  const dd = dateStr.substring(4, 6);
  
  // Assume 20xx for years
  const year = parseInt(yy) > 50 ? '19' + yy : '20' + yy;
  
  return year + '-' + mm + '-' + dd;
}

/**
 * Parse VAT details from Swico format
 * Format: "rate:amount;rate:amount"
 */
function parseVatDetails(vatStr) {
  if (!vatStr) return [];
  
  return vatStr.split(';').map(part => {
    const [rate, amount] = part.split(':');
    return {
      rate: parseFloat(rate) || 0,
      amount: parseFloat(amount) || 0
    };
  }).filter(v => v.rate > 0 || v.amount > 0);
}

/**
 * Main function to parse Swiss QR code and extract invoice data
 */
export function parseSwissQR(rawData) {
  return parseQRData(rawData);
}

/**
 * Extract structured invoice data from parsed QR code
 */
export function extractInvoiceData(parsedData) {
  if (!parsedData) return null;
  
  // Parse Swico billing information if present
  let swicoData = {};
  if (parsedData.billingInformation) {
    swicoData = parseSwicoFormat(parsedData.billingInformation);
  }
  
  return {
    // Vendor/Creditor information
    vendorName: parsedData.vendorName || parsedData.companyName || '',
    vendorAddress: parsedData.vendorAddress || '',
    creditorPostalCode: parsedData.creditorPostalCode || '',
    creditorCity: parsedData.creditorCity || '',
    creditorCountry: parsedData.creditorCountry || '',
    
    // Payment information
    iban: parsedData.iban || parsedData.accountNumber || '',
    amount: parsedData.amount || parsedData.totalAmount || '',
    currency: parsedData.currency || 'CHF',
    
    // Reference information
    referenceType: parsedData.referenceType || '',
    reference: parsedData.reference || parsedData.paymentReference || '',
    qrReference: parsedData.qrReference || '',
    
    // Debtor information
    debtorName: parsedData.debtorName || '',
    debtorAddress: parsedData.debtorAddress || '',
    debtorPostalCode: parsedData.debtorPostalCode || '',
    debtorCity: parsedData.debtorCity || '',
    debtorCountry: parsedData.debtorCountry || '',
    
    // Additional information
    message: parsedData.message || parsedData.additionalInformation || '',
    billingInformation: parsedData.billingInformation || '',
    
    // Swico parsed fields
    invoiceNumber: swicoData.invoiceNumber || parsedData.invoiceNumber || '',
    invoiceDate: swicoData.invoiceDate || parsedData.invoiceDate || '',
    customerReference: swicoData.customerReference || '',
    vatNumber: swicoData.vatNumber || parsedData.vatNumber || '',
    vatDetails: swicoData.vatDetails || [],
    paymentConditions: swicoData.paymentConditions || '',
    
    // Metadata
    qrCodeVersion: parsedData.version || '',
    rawText: parsedData.rawText || ''
  };
}
