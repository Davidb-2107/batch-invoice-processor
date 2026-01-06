import React, { useState, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, Edit2, Check, X, AlertCircle, Loader2 } from 'lucide-react';

// Configuration
const CONFIG = {
  N8N_URL: process.env.REACT_APP_N8N_URL || 'https://hen8n.com/webhook',
  API_URL: process.env.REACT_APP_API_URL || '',  // Vercel API (même domaine)
  ENDPOINTS: {
    EXTRACT: '/batch-extract',
    GENERATE_EXCEL: '/api/generate-excel',
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
        const formData = new FormData();
        formData.append('file', file);

        // Appeler l'API d'extraction (n8n)
        const response = await fetch(`${CONFIG.N8N_URL}${CONFIG.ENDPOINTS.EXTRACT}`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Erreur extraction ${file.name}: ${response.statusText}`);
        }

        const data = await response.json();
        
        extractedInvoices.push({
          id: i,
          documentNo: getNextInvoiceNo(startingInvoiceNo, i),
          fileName: file.name,
          vendorNo: data.vendorNo || '',
          vendorName: data.vendorName || '',
          vendorInvoiceNo: data.vendorInvoiceNo || '',
          amount: data.amount || 0,
          glAccount: data.glAccount || '',
          dimension1: data.dimension1 || '',
          dimension2: data.dimension2 || '',
          postingDate: data.postingDate || new Date().toISOString().split('T')[0],
          dueDate: data.dueDate || '',
          paymentReference: data.paymentReference || '',
          description: data.description || '',
          confidence: data.confidence || 0,
          status: data.vendorNo ? (data.confidence >= 0.9 ? 'valid' : 'warning') : 'error',
          modified: false
        });
      }

      setInvoices(extractedInvoices);
    } catch (err) {
      setError(`Erreur lors de l'extraction: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Mettre à jour une facture
  const updateInvoice = (index, field, value) => {
    setInvoices(prev => prev.map((inv, i) => {
      if (i === index) {
        return { ...inv, [field]: value, modified: true };
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
          dimension2: invoice.dimension2
        })
      });
    } catch (err) {
      console.error('RAG Learning error:', err);
    }
  };

  // Générer le package Excel
  const generateExcel = async () => {
    if (invoices.length === 0) {
      setError('Aucune facture à exporter');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Envoyer les modifications au RAG
      for (const invoice of invoices) {
        await saveModifications(invoice);
      }

      // Générer l'Excel (API Vercel locale)
      const response = await fetch(`${CONFIG.API_URL}${CONFIG.ENDPOINTS.GENERATE_EXCEL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices })
      });

      if (!response.ok) {
        throw new Error(`Erreur génération: ${response.statusText}`);
      }

      // Télécharger le fichier
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
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
  };

  // Rendu du statut
  const renderStatus = (status, confidence) => {
    switch (status) {
      case 'valid':
        return <span className="flex items-center text-green-600"><Check size={16} className="mr-1" /> {Math.round(confidence * 100)}%</span>;
      case 'warning':
        return <span className="flex items-center text-yellow-600"><AlertCircle size={16} className="mr-1" /> {Math.round(confidence * 100)}%</span>;
      case 'error':
        return <span className="flex items-center text-red-600"><X size={16} className="mr-1" /> À compléter</span>;
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
            Importez vos factures PDF et générez un package Excel pour Business Central
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
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={18} />
                    Extraction en cours...
                  </>
                ) : (
                  <>Extraire les données</>
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
                    <th className="px-4 py-3 font-medium text-gray-600">N° BC</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Fichier</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Fournisseur</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Réf. fourn.</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Montant</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Compte</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Dim. 2</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr key={invoice.id} className={`border-t ${invoice.modified ? 'bg-yellow-50' : ''}`}>
                      <td className="px-4 py-3 font-mono">{invoice.documentNo}</td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{invoice.fileName}</td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.vendorNo}
                            onChange={(e) => updateInvoice(index, 'vendorNo', e.target.value)}
                            className="border rounded px-2 py-1 w-24"
                          />
                        ) : (
                          <span>{invoice.vendorNo || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.vendorInvoiceNo}
                            onChange={(e) => updateInvoice(index, 'vendorInvoiceNo', e.target.value)}
                            className="border rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span>{invoice.vendorInvoiceNo || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {editingIndex === index ? (
                          <input
                            type="number"
                            value={invoice.amount}
                            onChange={(e) => updateInvoice(index, 'amount', parseFloat(e.target.value))}
                            className="border rounded px-2 py-1 w-28"
                          />
                        ) : (
                          <span>{invoice.amount.toLocaleString('fr-CH')} CHF</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.glAccount}
                            onChange={(e) => updateInvoice(index, 'glAccount', e.target.value)}
                            className="border rounded px-2 py-1 w-28"
                          />
                        ) : (
                          <span className="font-mono">{invoice.glAccount || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <input
                            type="text"
                            value={invoice.dimension2}
                            onChange={(e) => updateInvoice(index, 'dimension2', e.target.value)}
                            className="border rounded px-2 py-1 w-16"
                          />
                        ) : (
                          <span>{invoice.dimension2 || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{renderStatus(invoice.status, invoice.confidence)}</td>
                      <td className="px-4 py-3">
                        {editingIndex === index ? (
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="text-green-600 hover:text-green-800"
                          >
                            <Check size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingIndex(index)}
                            className="text-gray-400 hover:text-blue-600"
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
              >
                <Trash2 className="mr-2" size={18} />
                Effacer tout
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-gray-400 text-sm">
          Batch Invoice Processor v1.0 • Intégré avec Business Central
        </div>
      </div>
    </div>
  );
}

export default App;