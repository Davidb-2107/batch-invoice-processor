# 📦 Batch Invoice Processor

Application web pour le traitement en lot de factures PDF suisses avec QR-code, extraction OCR et génération de packages Excel pour Microsoft Dynamics 365 Business Central.

![Version](https://img.shields.io/badge/version-1.6-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 Fonctionnalités

- **📷 Scan QR Swiss Payment Code** - Extraction automatique des données de paiement (IBAN, référence, montant)
- **📋 Format Swico** - Parsing des billing information (`//S1/10/invoiceNo/11/date...`)
- **🔍 OCR Tesseract** - Reconnaissance optique pour données complémentaires
- **🏢 BC Vendor Lookup** - Recherche automatique du fournisseur dans Business Central via IBAN
- **📊 Export Excel** - Génération de packages d'import pour BC Configuration Packages (JavaScript pur)
- **🧠 RAG Learning** - Apprentissage des associations fournisseur/compte pour amélioration continue

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                         │
│  React App - QR Scanner - Invoice Editor - Excel Generator       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND (n8n VPS)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Batch Extract│  │Generate Excel│  │ RAG Learning │          │
│  │   Workflow   │  │  (SheetJS)   │  │   Workflow   │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ Tesseract    │  │  PostgreSQL  │                            │
│  │    OCR       │  │ (Neon - EU)  │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Déploiement

### Frontend (Vercel)
- **URL Production** : https://batch-invoice-processor.vercel.app
- **Déploiement** : Automatique sur push vers `main`

### Backend (n8n sur VPS)
- **URL** : https://hen8n.com
- **Workflows** :
  - `Batch Extract - Invoice Processor` (ID: U7TyGzvkwHiICE8H)
  - `Batch Generate Excel - BC Package` (ID: dgeGUvUH6kBenAA2)

### Base de données (Neon PostgreSQL)
- **Région** : Frankfurt (EU - GDPR compliant)
- **Database** : `invoice-rag`
- **Table principale** : `bc_vendors_prod` (21 vendors BC)

## 📁 Structure du Projet

```
batch-invoice-processor/
├── src/
│   ├── App.js                 # Composant principal React
│   ├── index.js               # Point d'entrée
│   └── lib/
│       ├── pdf-processor.js   # Conversion PDF → Image
│       └── qr-parser.js       # ⚠️ AUTO-GÉNÉRÉ - Ne pas modifier !
├── api/                       # Vercel Serverless Functions (legacy)
├── public/
│   └── index.html
├── docs/
│   └── HANDOFF.md            # Documentation technique complète
├── package.json
├── vercel.json
└── README.md
```

---

## 🔄 Synchronisation Automatique du Parser QR

> ⚠️ **IMPORTANT** : Le fichier `src/lib/qr-parser.js` est **auto-généré** par une GitHub Action depuis [QR-reader](https://github.com/Davidb-2107/QR-reader). **Ne jamais le modifier directement !**

### Source unique

Le parser Swiss QR est maintenu dans **QR-reader** (`client/src/lib/qr-scanner.ts`) et synchronisé automatiquement vers ce projet.

```
QR-reader                              batch-invoice-processor
┌─────────────────────┐                ┌─────────────────────┐
│ client/src/lib/     │    GitHub      │ src/lib/            │
│ qr-scanner.ts       │ ──Action──►    │ qr-parser.js        │
│ (TypeScript)        │   (auto)       │ (JavaScript)        │
│                     │                │                     │
│ ⚡ SOURCE UNIQUE    │                │ ⛔ AUTO-GÉNÉRÉ      │
└─────────────────────┘                └─────────────────────┘
```

### Pour modifier le parser

1. Modifier `client/src/lib/qr-scanner.ts` dans **QR-reader**
2. Push sur `main`
3. La GitHub Action synchronise automatiquement vers ce projet
4. Vercel redéploie automatiquement

### Workflow GitHub Action

Voir : [QR-reader/.github/workflows/sync-qr-parser.yml](https://github.com/Davidb-2107/QR-reader/blob/main/.github/workflows/sync-qr-parser.yml)

---

## 🔧 Configuration

### Variables d'environnement

```env
# N8N Webhooks
REACT_APP_N8N_URL=https://hen8n.com/webhook

# Endpoints
REACT_APP_EXTRACT_ENDPOINT=/batch-extract
REACT_APP_GENERATE_ENDPOINT=/batch-generate-excel
REACT_APP_RAG_ENDPOINT=/rag-learning
```

### n8n Credentials requises
- **Neon Invoice-RAG** : PostgreSQL connection (ID: LPLhfJ2K18rp4Geu)

## 📖 Utilisation

1. **Glisser-déposer** des factures PDF avec QR-code Swiss
2. **Extraire les données** - Le système scanne le QR, effectue l'OCR et recherche le fournisseur BC
3. **Vérifier/Corriger** - Éditer les champs si nécessaire
4. **Générer Excel** - Télécharger le package pour import dans BC

## 🔄 Workflows n8n

### Batch Extract - Invoice Processor
```
Webhook → Split Invoices → Tesseract OCR → Extract Invoice Data
    → Vendor Lookup (PostgreSQL) → Merge Vendor Data → Aggregate Results → Respond
```

### Batch Generate Excel - BC Package
```
Webhook → Generate Excel (JavaScript/SheetJS) → Respond with Binary
```

Génère un fichier Excel avec 2 onglets :
- **Purchase Invoice Header** : En-têtes de factures (44 colonnes)
- **Purchase Invoice Line** : Lignes de factures (38 colonnes)

## 📊 Format de Réponse API

```json
{
  "success": true,
  "count": 1,
  "invoices": [{
    "filename": "invoice.pdf",
    "invoiceNumber": "FA182010",
    "vendorName": "Steuerverwaltung Thurgau",
    "vendorIBAN": "CH9830000010850000725",
    "vendorNo": "F000050",
    "vendorNameBC": "Steuerverwaltung Thurgau Quellensteuer",
    "canton": "TG",
    "vendorFound": true,
    "vendorConfidence": "1.0",
    "amount": "41.30",
    "paymentReference": "11 00000 00013 99416 00181 95183"
  }]
}
```

## 🛠️ Développement Local

```bash
# Installation
npm install

# Démarrage
npm start

# Build
npm run build
```

## 📝 Changelog

### v1.6 (2026-01-10)
- ✅ **Parser QR synchronisé automatiquement depuis QR-reader**
- ✅ Support complet du format Swico (//S1/10/invoiceNo/11/date...)
- ✅ Extraction des champs : invoiceNumber, invoiceDate, vatNumber
- ✅ Conversion date Swico YYMMDD → YYYY-MM-DD

### v1.5 (2026-01-08)
- ✅ Génération Excel réécrite en JavaScript pur (SheetJS)
- ✅ Suppression dépendance Python/openpyxl (problèmes Alpine Linux)
- ✅ Correction "Compte général" avec accents français
- ✅ Workflow simplifié : 3 nodes au lieu de 5

### v1.4 (2026-01-08)
- ✅ Correction affichage du montant dans le tableau des factures
- ✅ Mapping amount depuis la réponse OCR n8n

### v1.3 (2026-01-07)
- ✅ BC Vendor Lookup via IBAN intégré
- ✅ Affichage vendorNo, vendorNameBC, canton
- ✅ Statut automatique (vert) quand fournisseur trouvé

### v1.2 (2026-01-06)
- ✅ Swiss QR Payment Code parser
- ✅ PDF to Image conversion (pdf.js)
- ✅ OCR via Tesseract

### v1.1 (2026-01-06)
- ✅ Interface batch processing
- ✅ Excel generation workflow

## 📚 Documentation

- [HANDOFF.md](docs/HANDOFF.md) - Documentation technique complète pour reprendre le projet
- [Architecture détaillée](docs/HANDOFF.md#architecture)
- [Troubleshooting](docs/HANDOFF.md#troubleshooting)

## 🔗 Liens Utiles

- **App** : https://batch-invoice-processor.vercel.app
- **QR-reader (source du parser)** : https://github.com/Davidb-2107/QR-reader
- **n8n** : https://hen8n.com
- **Neon DB** : https://console.neon.tech (project: dawn-frog-92063130)
- **GitHub** : https://github.com/Davidb-2107/batch-invoice-processor

## 📄 License

MIT License - David B. 2026
