/**
 * Swiss Payment Code (SPC) Parser
 * Parses QR-bill data according to Swiss Payment Standards
 */

export function parseSwissQR(rawData) {
  if (!rawData || typeof rawData !== 'string') {
    return null;
  }

  const lines = rawData.split('\n');
  
  // Check if it's a Swiss QR code (starts with SPC)
  if (lines[0] !== 'SPC') {
    // Try to parse as generic QR data
    return parseGenericQR(rawData);
  }

  try {
    const data = {
      // Header
      qrType: lines[0],           // SPC
      version: lines[1],          // 0200
      coding: lines[2],           // 1 = UTF-8
      
      // Creditor (Beneficiary) Account
      iban: lines[3],
      
      // Creditor (Beneficiary)
      creditorType: lines[4],     // S or K
      creditorName: lines[5],
      creditorStreet: lines[6],
      creditorBuilding: lines[7],
      creditorPostalCode: lines[8],
      creditorCity: lines[9],
      creditorCountry: lines[10],
      
      // Ultimate Creditor (usually empty)
      ultimateCreditorType: lines[11],
      ultimateCreditorName: lines[12],
      ultimateCreditorStreet: lines[13],
      ultimateCreditorBuilding: lines[14],
      ultimateCreditorPostalCode: lines[15],
      ultimateCreditorCity: lines[16],
      ultimateCreditorCountry: lines[17],
      
      // Payment Amount
      amount: lines[18] ? parseFloat(lines[18]) : null,
      currency: lines[19] || 'CHF',
      
      // Ultimate Debtor (Payer)
      debtorType: lines[20],
      debtorName: lines[21],
      debtorStreet: lines[22],
      debtorBuilding: lines[23],
      debtorPostalCode: lines[24],
      debtorCity: lines[25],
      debtorCountry: lines[26],
      
      // Payment Reference
      referenceType: lines[27],   // QRR, SCOR, or NON
      reference: lines[28],
      
      // Additional Information
      message: lines[29],
      trailer: lines[30],         // EPD
      
      // Alternative procedures (if present)
      alternativeProcedure1: lines[31],
      alternativeProcedure2: lines[32]
    };

    // Build formatted address strings
    data.creditorAddress = formatAddress(
      data.creditorStreet,
      data.creditorBuilding,
      data.creditorPostalCode,
      data.creditorCity
    );
    
    data.debtorAddress = formatAddress(
      data.debtorStreet,
      data.debtorBuilding,
      data.debtorPostalCode,
      data.debtorCity
    );

    // Clean up payment reference
    data.paymentReference = formatReference(data.referenceType, data.reference);

    return data;
  } catch (error) {
    console.error('Error parsing Swiss QR code:', error);
    return null;
  }
}

function formatAddress(street, building, postalCode, city) {
  const parts = [];
  if (street) {
    parts.push(building ? `${street} ${building}` : street);
  }
  if (postalCode || city) {
    parts.push(`${postalCode || ''} ${city || ''}`.trim());
  }
  return parts.join(', ');
}

function formatReference(type, reference) {
  if (!reference) return '';
  
  // Format QR reference (26 digits + check digit)
  if (type === 'QRR' && reference.length === 27) {
    return reference.replace(/(\d{2})(\d{5})(\d{5})(\d{5})(\d{5})(\d{5})/, '$1 $2 $3 $4 $5 $6');
  }
  
  return reference;
}

function parseGenericQR(rawData) {
  // Try to extract common payment info from non-standard QR codes
  const data = {
    rawData: rawData,
    qrType: 'GENERIC'
  };

  // Try to find IBAN
  const ibanMatch = rawData.match(/CH[0-9]{2}[\s]?([0-9]{4}[\s]?){4}[0-9]/i);
  if (ibanMatch) {
    data.iban = ibanMatch[0].replace(/\s/g, '');
  }

  // Try to find amount
  const amountMatch = rawData.match(/(?:CHF|EUR)[\s]?([0-9]+[.,][0-9]{2})/i);
  if (amountMatch) {
    data.amount = parseFloat(amountMatch[1].replace(',', '.'));
    data.currency = rawData.includes('EUR') ? 'EUR' : 'CHF';
  }

  return data;
}

export function extractInvoiceData(qrData, ocrText = '') {
  if (!qrData) return null;

  return {
    // From QR code
    vendorName: qrData.creditorName || '',
    vendorAddress: qrData.creditorAddress || '',
    vendorIBAN: qrData.iban || '',
    
    debtorName: qrData.debtorName || '',
    debtorAddress: qrData.debtorAddress || '',
    
    amount: qrData.amount || 0,
    currency: qrData.currency || 'CHF',
    
    paymentReference: qrData.paymentReference || qrData.reference || '',
    referenceType: qrData.referenceType || '',
    message: qrData.message || '',
    
    // Extracted from OCR (to be filled by n8n workflow)
    vendorInvoiceNo: '',
    invoiceDate: '',
    description: qrData.message || '',
    
    // For BC mapping
    vendorNo: '',
    glAccount: '',
    dimension1: '',
    dimension2: ''
  };
}