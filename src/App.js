import React, { useState, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, Edit2, Check, X, AlertCircle, Loader2, QrCode } from 'lucide-react';
import { PDFProcessor } from './lib/pdf-processor';

// Configuration - Tout via n8n
const CONFIG = {
  N8N_URL: 'https://hen8n.com/webhook',
  ENDPOINTS: {
    EXTRACT: '/batch-extract',
    GENERATE_EXCEL: '/batch-generate-excel',
    RAG_LEARNING: '/rag-learning'
  }
};

function App() {
  // State
  const [startingInvoiceNo, setStartingInvoiceNo] = useState('FA182010');
  const [files, setFiles] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');

  // Calculer le prochain numéro de facture
  const getNextInvoiceNo = (baseNo, index) => {
    const prefix = baseNo.replace(/\d+$/, '');
    const numPart = parseInt(baseNo.match(/\d+$/)?.[0] || '0', 10);
    return `${prefix}${numPart + index}`;
  };

  // Gérer le drop des fichiers
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf'
    );
    setFiles(prev => [...prev, ...droppedFiles]);
    setError(null);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Sélection de fichiers via input
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(
      f => f.type === 'application/pdf'
    );
    setFiles(prev => [...prev, ...selectedFiles]);
    setError(null);
  };

  // Supprimer un fichier
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Extraire les données des PDFs
  const extractInvoices = async () => {
    if (files.length === 0) {
      setError('Veuillez ajouter au moins un fichier PDF');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const extractedInvoices = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Traitement ${i + 1}/${files.length}: ${file.name}`);

        // Process PDF - extract QR code and image
        const processor = new PDFProcessor((p) => {
          setProgress(`${file.name}: ${p.message}`);
        });

        const result = await processor.processPDF(file);
        
        // Prepare invoice data
        const invoiceNumber = getNextInvoiceNo(startingInvoiceNo, i);
        
        let invoiceData = {
          id: i,
          documentNo: invoiceNumber,
          fileName: file.name,
          hasQR: result.hasQR,
          vendorNo: '',
          vendorName: result.invoiceData?.vendorName || '',
          vendorNameBC: '',
          canton: '',
          vendorAddress: result.invoiceData?.vendorAddress || '',
          vendorIBAN: result.invoiceData?.vendorIBAN || '',
          debtorName: result.invoiceData?.debtorName || '',
          vendorInvoiceNo: '',
          amount: result.invoiceData?.amount || 0,
          currency: result.invoiceData?.currency || 'CHF',
          glAccount: '',
          dimension1: '',
          dimension2: '',
          shortcutDimension2Code: '',  // Code raccourci axe 2 (Mandat BC)
          postingDate: new Date().toISOString().split('T')[0],
          dueDate: '',
          paymentReference: result.invoiceData?.paymentReference || '',
          referenceType: result.invoiceData?.referenceType || '',
          description: result.invoiceData?.message || '',
          confidence: result.hasQR ? 0.9 : 0.3,
          status: result.hasQR ? 'warning' : 'error',
          modified: false,
          mandatFound: false,
          mandatConfidence: 0
        };

        // If we have QR data but need OCR for additional info, send to n8n
        if (result.imageBase64) {
          try {
            const ocrResponse = await fetch(`${CONFIG.N8N_URL}${CONFIG.ENDPOINTS.EXTRACT}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invoices: [{
                  base64: result.imageBase64,
                  filename: file.name,
                  invoiceNumber: invoiceNumber,
                  qrData: result.invoiceData // Send QR data for enrichment
                }]
              })
            });

            if (ocrResponse.ok) {
              const ocrData = await ocrResponse.json();
              if (ocrData.invoices && ocrData.invoices[0]) {
                const ocr = ocrData.invoices[0];
                
                // BC Vendor lookup results
                invoiceData.vendorNo = ocr.vendorNo || '';
                invoiceData.vendorNameBC = ocr.vendorNameBC || '';
                invoiceData.canton = ocr.canton || '';
                
                // RAG Mandat lookup results - Code raccourci axe 2
                invoiceData.shortcutDimension2Code = ocr.shortcutDimension2Code || '';
                invoiceData.mandatFound = ocr.mandatFound || false;
                invoiceData.mandatConfidence = ocr.mandatConfidence || 0;
                
                // OCR extracted data
                invoiceData.vendorInvoiceNo = ocr.extractedInvoiceNumber || '';
                invoiceData.description = invoiceData.description || ocr.description || '';
                
                // FIX: Map amount from OCR/n8n response
                if (ocr.amount) {
                  invoiceData.amount = parseFloat(ocr.amount) || invoiceData.amount;
                }
                
                // Map invoice date if available
                if (ocr.invoiceDate) {
                  invoiceData.invoiceDate = ocr.invoiceDate;
                }
                
                // Update vendor name from BC if not from QR
                if (!invoiceData.vendorName && ocr.vendorName) {
                  invoiceData.vendorName = ocr.vendorName;
                }
                
                // Update status based on vendor found
                if (ocr.vendorFound && ocr.vendorNo) {
                  invoiceData.status = 'valid';
                  invoiceData.confidence = parseFloat(ocr.vendorConfidence) || 1.0;
                }
              }
            }
          } catch (ocrErr) {
            console.log('OCR enrichment failed, using QR data only:', ocrErr);
          }
        }

        extractedInvoices.push(invoiceData);
      }

      setInvoices(extractedInvoices);
      setProgress('');
    } catch (err) {
      setError(`Erreur lors de l'extraction: ${err.message}`);
      setProgress('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Mettre à jour une facture
  const updateInvoice = (index, field, value) => {
    setInvoices(prev => prev.map((inv, i) => {
      if (i === index) {
        const updated = { ...inv, [field]: value, modified: true };
        if (updated.vendorNo && updated.amount) {
          updated.status = 'valid';
          updated.confidence = 1.0;
        }
        return updated;
      }
      return inv;
    }));
  };

  // Sauvegarder les modifications (RAG Learning)
  const saveModifications = async (invoice) => {
    if (!invoice.modified) return;

    try {
      await fetch(`${CONFIG.N8N_URL}${CONFIG.ENDPOINTS.RAG_LEARNING}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: invoice.vendorName,
          vendorNo: invoice.vendorNo,
          glAccount: invoice.glAccount,
          dimension1: invoice.dimension1,
          dimension2: invoice.dimension2,
          shortcutDimension2Code: invoice.shortcutDimension2Code,
          debtorName: invoice.debtorName,
          paymentReference: invoice.paymentReference
        })
      });
    } catch (err) {
      console.error('RAG Learning error:', err);
    }
  };

  // Générer le package Excel (via n8n)
  const generateExcel = async () => {
    if (invoices.length === 0) {
      setError('Aucune facture à exporter');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      for (const invoice of invoices) {
        await saveModifications(invoice);
      }

      const response = await fetch(`${CONFIG.N8N_URL}${CONFIG.ENDPOINTS.GENERATE_EXCEL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices })
      });

      if (!response.ok) {
        throw new Error(`Erreur génération: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a')
      a.href = url;
      a.download = `BC_Package_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

    } catch (err) {
      setError(`Erreur lors de la génération: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Effacer tout
  const clearAll = () => {
    setFiles([]);
    setInvoices([]);
    setError(null);
    setEditingIndex(null);
    setProgress('');
  };

  // Rendu du statut avec tooltips
  const renderStatus = (invoice) => {
    const { status, confidence, hasQR, mandatFound, mandatConfidence } = invoice;
    const confidencePercent = Math.round(confidence * 100);
    
    // Icône QR avec tooltip
    const qrIcon = hasQR ? (
      <span title="QR-code Swiss détecté">
        <QrCode size={14} className="mr-1" />
      </span>
    ) : null;
    
    // Icône mandat avec tooltip détaillé
    const mandatIcon = mandatFound ? (
      <span 
        className="text-purple-500 ml-1" 
        title={`Mandat trouvé via RAG (confiance: ${Math.round(mandatConfidence * 100)}%)`}
      >
        ◆
      </span>
    ) : null;
    
    switch (status) {
      case 'valid':
        return (
          <span className="flex items-center text-green-600" title="Fournisseur validé dans Business Central">
            {qrIcon}
            <span title="Fournisseur trouvé">
              <Check size={16} className="mr-1" />
            </span>
            <span title={`Confiance de correspondance: ${confidencePercent}%`}>
              {confidencePercent}%
            </span>
            {mandatIcon}
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center text-yellow-600" title="En attente de validation fournisseur">
            {qrIcon}
            <span title="Fournisseur non trouvé dans BC">
              <AlertCircle size={16} className="mr-1" />
            </span>
            <span title={`Confiance de correspondance: ${confidencePercent}%`}>
              {confidencePercent}%
            </span>
            {mandatIcon}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center text-red-600" title="Données manquantes - compléter manuellement">
            <span title="QR-code non détecté ou illisible">
              <X size={16} className="mr-1" />
            </span>
            À compléter
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            📦 Batch Invoice Processor
          </h1>
          <p className="text-gray-600">
            Importez vos factures PDF avec QR-code Swiss et générez un package Excel pour Business Central
          </p>
        </div>

        {/* Paramètres */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Paramètres du batch</h2>
          <div className="flex items-center gap-4">
            <label className="text-gray-600">N° facture de départ :</label>
            <input
              type="text"
              value={startingInvoiceNo}
              onChange={(e) => setStartingInvoiceNo(e.target.value)}
              className="border rounded-md px-3 py-2 w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="FA182010"
            />
            <span className="text-sm text-gray-500">(série: PPI)</span>
          </div>
        </div>

        {/* Zone de drop */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <input
              type="file"
              multiple
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="cursor-pointer">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg text-gray-600">Glisser-déposer vos factures PDF ici</p>
              <p className="text-sm text-gray-400 mt-2">ou cliquer pour sélectionner</p>
            </label>
          </div>

          {/* Liste des fichiers */}
          {files.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium text-gray-700 mb-2">Fichiers sélectionnés ({files.length})</h3>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-red-500 mr-2" />
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-400 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-red-500"
                      title="Supprimer ce fichier"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={extractInvoices}
                disabled={isProcessing}
                className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
                title="Lancer l'extraction des données QR et OCR"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={18} />
                    {progress || 'Traitement...'}
                  </>
                ) : (
                  <>
                    <QrCode className="mr-2" size={18} />
                    Extraire les données
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center">
              <AlertCircle className="mr-2" size={20} />
              {error}
            </div>
          </div>
        )}

        {/* Tableau des factures */}
        {invoices.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              Factures extraites ({invoices.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600" title="Numéro de document Business Central">N° BC</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Nom du fournisseur (QR + BC)">Fournisseur</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="IBAN du fournisseur">IBAN</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Référence de paiement Swiss QR">Référence</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Montant de la facture">Montant</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Numéro fournisseur Business Central">N° Fourn.</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Compte général (G/L Account)">Compte</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Code raccourci axe 2 (Mandat BC)">Axe 2</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Description de la facture">Description</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Statut de validation">Statut</th>
                    <th className="px-4 py-3 font-medium text-gray-600" title="Modifier cette ligne">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr key={invoice.id} className={`border-t ${invoice.modified ? 'bg-yellow-50' : ''}`} title={invoice.modified ? 'Ligne modifiée manuellement' : ''}>
                      <td className="px-4 py-3 font-mono text-xs">{invoice.documentNo}</td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs">
                          <div className="font-medium truncate" title={invoice.vendorName || 'Non détecté'}>{invoice.vendorName || '—'}</div>
                          {invoice.vendorNameBC && invoice.vendorNameBC !== invoice.vendorName && (
                            <div className="text-xs text-blue-600 truncate" title={`Nom dans Business Central: ${invoice.vendorNameBC}`}>BC: {invoice.vendorNameBC}</div>
                          )}
                          {invoice.canton && (
                            <div className="text-xs text-gray-500" title="Canton suisse">Canton: {invoice.canton}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" title={invoice.vendorIBAN || 'IBAN non détecté'}>{invoice.vendorIBAN || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs">
                          <div className="font-mono text-xs truncate" title={invoice.paymentReference || 'Référence non détectée'}>{invoice.paymentReference || '—'}</div>
                          {invoice.referenceType && (
                            <div className="text-xs text-gray-400" title="Type de référence de paiement">{invoice.referenceType}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">
                        {editingIndex === index ? (
                          <input
                            type="number"
                            value={invoice.amount}
                            onChange={(e) => updateInvoice(index, 'amount', parseFloat(e.target.value))}
                            className="border rounded px-2 py-1 w-24"
                            title="Modifier le montant"
                          />
                        ) : (
                          <span title={`Montant: ${invoice.amount} ${invoice.currency}`}>{invoice.amount.toLocaleString('fr-CH')} {invoice.currency}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.vendorNo}
                            onChange={(e) => updateInvoice(index, 'vendorNo', e.target.value)}
                            className="border rounded px-2 py-1 w-20"
                            placeholder="F00XXX"
                            title="Entrer le numéro fournisseur BC"
                          />
                        ) : (
                          <span 
                            className={`font-mono ${invoice.vendorNo ? 'text-green-600 font-medium' : ''}`}
                            title={invoice.vendorNo ? 'Fournisseur trouvé dans Business Central' : 'Fournisseur non trouvé - à compléter'}
                          >
                            {invoice.vendorNo || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.glAccount}
                            onChange={(e) => updateInvoice(index, 'glAccount', e.target.value)}
                            className="border rounded px-2 py-1 w-20"
                            title="Entrer le compte général"
                          />
                        ) : (
                          <span className="font-mono" title={invoice.glAccount ? `Compte général: ${invoice.glAccount}` : 'Compte non défini'}>{invoice.glAccount || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.shortcutDimension2Code}
                            onChange={(e) => updateInvoice(index, 'shortcutDimension2Code', e.target.value)}
                            className="border rounded px-2 py-1 w-20"
                            placeholder="Mandat"
                            title="Entrer le code mandat (Axe 2)"
                          />
                        ) : (
                          <span
                            className={`font-mono ${invoice.shortcutDimension2Code ? 'text-purple-600 font-medium' : ''}`}
                            title={invoice.shortcutDimension2Code ? `Mandat trouvé via RAG: ${invoice.shortcutDimension2Code}` : 'Mandat non trouvé'}
                          >
                            {invoice.shortcutDimension2Code || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.description}
                            onChange={(e) => updateInvoice(index, 'description', e.target.value)}
                            className="border rounded px-2 py-1 w-40"
                            placeholder="Description"
                            title="Modifier la description"
                          />
                        ) : (
                          <span
                            className="text-xs truncate block max-w-xs"
                            title={invoice.description || 'Aucune description'}
                          >
                            {invoice.description || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{renderStatus(invoice)}</td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="text-green-600 hover:text-green-800"
                            title="Valider les modifications"
                          >
                            <Check size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingIndex(index)}
                            className="text-gray-400 hover:text-blue-600"
                            title="Modifier cette ligne"
                          >
                            <Edit2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={generateExcel}
                disabled={isGenerating}
                className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 flex items-center"
                title="Générer le fichier Excel pour import dans Business Central"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={18} />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Download className="mr-2" size={18} />
                    Générer Package Excel
                  </>
                )}
              </button>
              <button
                onClick={clearAll}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-300 flex items-center"
                title="Effacer tous les fichiers et données"
              >
                <Trash2 className="mr-2" size={18} />
                Effacer tout
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-gray-400 text-sm">
          Batch Invoice Processor v1.6 • QR-code Swiss + OCR + BC Vendor + RAG Mandat Lookup • Business Central
        </div>
      </div>
    </div>
  );
}

export default App;
