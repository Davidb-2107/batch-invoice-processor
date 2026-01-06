import * as pdfjsLib from 'pdfjs-dist';
import QrScanner from 'qr-scanner';
import { parseSwissQR, extractInvoiceData } from './qr-parser';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export class PDFProcessor {
  constructor(onProgress) {
    this.onProgress = onProgress;
  }

  updateProgress(stage, progress, message) {
    if (this.onProgress) {
      this.onProgress({ stage, progress, message });
    }
  }

  async processPDF(file) {
    this.updateProgress('loading', 10, 'Chargement du PDF...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;

      this.updateProgress('scanning', 30, `Analyse de ${numPages} page(s)...`);

      let qrData = null;
      let imageBase64 = null;

      // Process each page looking for QR codes
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        this.updateProgress('scanning', 30 + (pageNum / numPages) * 40, `Page ${pageNum}/${numPages}...`);

        const page = await pdf.getPage(pageNum);
        
        // Try different scales for QR detection
        const scales = [3.0, 2.0, 4.0];
        
        for (const scale of scales) {
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          // Save first page as image for OCR
          if (pageNum === 1 && !imageBase64) {
            imageBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
          }

          // Try to detect QR code
          try {
            const result = await this.scanQRCode(canvas);
            if (result) {
              console.log('QR code found on page', pageNum, 'at scale', scale);
              qrData = parseSwissQR(result);
              break;
            }
          } catch (err) {
            // No QR found at this scale, try next
          }
        }

        if (qrData) break; // Found QR, stop processing pages
      }

      this.updateProgress('extracting', 80, 'Extraction des données...');

      const invoiceData = extractInvoiceData(qrData);

      this.updateProgress('complete', 100, 'Terminé');

      return {
        qrData,
        invoiceData,
        imageBase64,
        hasQR: !!qrData
      };

    } catch (error) {
      console.error('PDF processing error:', error);
      throw new Error(`Erreur de traitement: ${error.message}`);
    }
  }

  async scanQRCode(canvas) {
    // Scan different regions where QR codes typically appear
    const strategies = [
      { name: 'bottom-quarter', x: 0, y: canvas.height * 0.75, width: canvas.width, height: canvas.height * 0.25 },
      { name: 'payment-slip', x: 0, y: canvas.height * 0.6, width: canvas.width, height: canvas.height * 0.4 },
      { name: 'bottom-half', x: 0, y: canvas.height / 2, width: canvas.width, height: canvas.height / 2 },
      { name: 'full-page', x: 0, y: 0, width: canvas.width, height: canvas.height }
    ];

    for (const strategy of strategies) {
      try {
        const regionCanvas = document.createElement('canvas');
        regionCanvas.width = strategy.width;
        regionCanvas.height = strategy.height;
        const regionContext = regionCanvas.getContext('2d');

        regionContext.drawImage(
          canvas,
          strategy.x, strategy.y, strategy.width, strategy.height,
          0, 0, strategy.width, strategy.height
        );

        const result = await QrScanner.scanImage(regionCanvas, {
          returnDetailedScanResult: true,
          alsoTryWithoutScanRegion: true
        });

        if (result && result.data) {
          console.log(`QR found using ${strategy.name} strategy`);
          return result.data;
        }
      } catch (err) {
        // No QR in this region, continue
      }
    }

    return null;
  }
}

export default PDFProcessor;