# 🔄 HANDOFF - Batch Invoice Processor

> **Document de reprise de projet** - Contient tous les détails techniques pour continuer le développement

## 📋 Résumé Exécutif

**Projet** : Application de traitement batch de factures PDF suisses avec QR-code  
**Objectif** : Automatiser l'import de factures fournisseurs dans Microsoft Dynamics 365 Business Central  
**Statut** : v1.3 - Fonctionnel avec BC Vendor Lookup  
**Dernière mise à jour** : 2026-01-07  

---

## 🏗️ Architecture Complète

### Stack Technique

| Composant | Technologie | Hébergement |
|-----------|-------------|-------------|
| Frontend | React 18 + Tailwind | Vercel |
| Backend/Workflows | n8n | VPS Docker |
| OCR | Tesseract | VPS Docker |
| Database | PostgreSQL | Neon (Frankfurt) |
| Queue | Redis | VPS Docker |

### URLs & Accès

| Service | URL | Notes |
|---------|-----|-------|
| App Production | https://batch-invoice-processor.vercel.app | Auto-deploy sur push |
| n8n | https://hen8n.com | Login requis |
| Neon Console | https://console.neon.tech | Project: dawn-frog-92063130 |
| GitHub | https://github.com/Davidb-2107/batch-invoice-processor | Main branch |

---

## 🔄 Workflows n8n

### 1. Batch Extract - Invoice Processor
- **ID** : `U7TyGzvkwHiICE8H`
- **Webhook** : `POST https://hen8n.com/webhook/batch-extract`
- **Statut** : ✅ Actif

**Flux de données** :
```
Webhook Batch Extract
    │
    ▼
Split Invoices (Code)
    │ - Extrait qrData.vendorIBAN
    │ - Prépare binary pour OCR
    ▼
Tesseract OCR (HTTP Request)
    │ - POST http://tesseract-ocr:5000/uploader
    │ - multipart/form-data
    ▼
Extract Invoice Data (Code)
    │ - Parse HTML response
    │ - Regex extraction (date, amount, etc.)
    │ - Passe vendorIBAN, vendorName
    ▼
Vendor Lookup (BC Prod) (PostgreSQL)
    │ - Query UNION (IBAN exact + name fuzzy)
    │ - Credentials: Neon Invoice-RAG (LPLhfJ2K18rp4Geu)
    ▼
Merge Vendor Data (Code)
    │ - Combine OCR + vendor lookup
    │ - Ajoute vendorNo, vendorNameBC, canton
    ▼
Aggregate Results (Code)
    │ - Sort par index
    │ - Format final JSON
    ▼
Respond to Webhook
```

**Payload d'entrée** :
```json
{
  "invoices": [{
    "base64": "data:image/jpeg;base64,...",
    "filename": "invoice.pdf",
    "invoiceNumber": "FA182010",
    "qrData": {
      "vendorName": "Steuerverwaltung Thurgau",
      "vendorIBAN": "CH9830000010850000725",
      "amount": 41.30,
      "paymentReference": "11 00000 00013 99416..."
    }
  }]
}
```

**Payload de sortie** :
```json
{
  "success": true,
  "count": 1,
  "invoices": [{
    "filename": "invoice.pdf",
    "vendorNo": "F000050",
    "vendorNameBC": "Steuerverwaltung Thurgau Quellensteuer",
    "canton": "TG",
    "vendorFound": true,
    "vendorConfidence": "1.0"
  }]
}
```

### 2. Batch Generate Excel - BC Package
- **ID** : `dgeGUvUH6kBenAA2`
- **Webhook** : `POST https://hen8n.com/webhook/batch-generate-excel`
- **Statut** : ✅ Actif

---

## 🗄️ Base de Données

### Neon PostgreSQL

**Connection String** :
```
postgresql://invoice-rag_owner:***@ep-small-sun-a2xxxxxx.eu-central-1.aws.neon.tech/invoice-rag?sslmode=require
```

### Table : bc_vendors_prod

```sql
CREATE TABLE bc_vendors_prod (
    vendor_no VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255),
    search_name VARCHAR(255),
    address VARCHAR(255),
    city VARCHAR(100),
    post_code VARCHAR(20),
    canton VARCHAR(10),
    country VARCHAR(50),
    iban VARCHAR(34),
    vendor_posting_group VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Données actuelles** : 21 vendors (administrations cantonales suisses)

**Query Vendor Lookup** :
```sql
-- Match par IBAN (confidence 1.0)
SELECT vendor_no, name, canton, iban, 1.0 as confidence, 'iban_match' as match_type
FROM bc_vendors_prod
WHERE iban = $1

UNION ALL

-- Match par nom (confidence 0.8)
SELECT vendor_no, name, canton, iban, 0.8 as confidence, 'name_match' as match_type
FROM bc_vendors_prod
WHERE LOWER(search_name) LIKE LOWER($2) OR LOWER(name) LIKE LOWER($2)

ORDER BY confidence DESC
LIMIT 1
```

---

## 📱 Frontend React

### Composants Principaux

**App.js** - Composant principal
- State : files, invoices, isProcessing, editingIndex
- Handlers : handleDrop, extractInvoices, generateExcel

**lib/pdf-processor.js** - Conversion PDF
- Utilise pdf.js pour render PDF → Canvas → JPEG
- Détecte et extrait QR codes avec jsQR

**lib/qr-parser.js** - Parser Swiss QR
- Parse le format Swiss Payment Code (SPC)
- Extrait : IBAN, vendorName, amount, reference

### Flux de données Frontend

```
1. User drops PDF
    ↓
2. PDFProcessor.processPDF()
    ↓ pdf.js render
3. QRParser.parse() - extrait données QR
    ↓
4. fetch() → n8n /batch-extract
    ↓
5. Response avec vendorNo, vendorNameBC
    ↓
6. setInvoices() - update state
    ↓
7. Render table avec données enrichies
```

---

## 🔧 Configuration

### Vercel Environment Variables
```env
# Pas de variables requises actuellement
# CONFIG hardcodé dans App.js
```

### n8n Credentials
| Nom | Type | ID | Usage |
|-----|------|-----|-------|
| Neon Invoice-RAG | PostgreSQL | LPLhfJ2K18rp4Geu | Vendor Lookup |

---

## 🐛 Troubleshooting

### Problème : vendorNo vide dans l'UI
**Cause** : Le nœud Vendor Lookup n'était pas connecté au flux principal  
**Solution** : Vérifier les connexions dans n8n (Extract → Vendor Lookup → Merge)

### Problème : IBAN non trouvé
**Cause** : Différence de format (espaces)  
**Solution** : Nettoyer l'IBAN avec `.replace(/\s/g, '')` avant query

### Problème : OCR timeout
**Cause** : Image trop grande  
**Solution** : Réduire la résolution du canvas (scale 1.5 au lieu de 2)

---

## 🚀 Prochaines Étapes (Roadmap)

### Phase 4 : RAG Learning Amélioré
- [ ] Apprentissage association vendorName → glAccount
- [ ] Apprentissage dimension1/dimension2 par fournisseur
- [ ] Interface feedback utilisateur

### Phase 5 : Multi-tenant
- [ ] Support plusieurs environnements BC
- [ ] Configuration par tenant
- [ ] Isolation des données

### Phase 6 : Monitoring
- [ ] Slack alerts sur erreurs
- [ ] Dashboard statistiques
- [ ] Logs centralisés

### Améliorations UI
- [ ] Preview PDF dans l'interface
- [ ] Historique des batches
- [ ] Export CSV en plus d'Excel

---

## 💬 Prompt pour Nouvelle Conversation

Copier ce prompt pour démarrer une nouvelle session avec contexte complet :

```
Je travaille sur le projet Batch Invoice Processor pour Business Central.

**Contexte** :
- App React sur Vercel : https://batch-invoice-processor.vercel.app
- Workflows n8n sur https://hen8n.com
- PostgreSQL sur Neon (project: dawn-frog-92063130)
- GitHub : https://github.com/Davidb-2107/batch-invoice-processor

**Architecture actuelle** :
1. Frontend React scan QR Swiss Payment Code
2. Envoie à n8n workflow (ID: U7TyGzvkwHiICE8H)
3. OCR Tesseract + Vendor Lookup PostgreSQL (bc_vendors_prod)
4. Retourne vendorNo, vendorNameBC, canton
5. Génération Excel pour BC Configuration Package

**Stack** :
- React 18, Tailwind, pdf.js, jsQR
- n8n (Docker VPS), Tesseract OCR
- PostgreSQL Neon (21 vendors suisses)

**Documentation complète** : https://github.com/Davidb-2107/batch-invoice-processor/blob/main/docs/HANDOFF.md

Je voudrais [DÉCRIS TA DEMANDE ICI]
```

---

## 📚 Ressources

### Documentation Externe
- [Swiss QR-bill Spec](https://www.paymentstandards.ch/dam/downloads/ig-qr-bill-en.pdf)
- [n8n Documentation](https://docs.n8n.io/)
- [Neon PostgreSQL](https://neon.tech/docs)
- [BC Configuration Packages](https://learn.microsoft.com/en-us/dynamics365/business-central/admin-how-to-prepare-a-configuration-package)

### Fichiers Clés
- `src/App.js` - Logique principale React
- `src/lib/qr-parser.js` - Parser Swiss QR
- `src/lib/pdf-processor.js` - PDF → Image + QR detection

---

## 📞 Contact

**Développeur** : David B.  
**GitHub** : @Davidb-2107  

---

*Dernière mise à jour : 2026-01-08*
