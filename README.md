# Batch Invoice Processor

Interface web pour traiter des factures PDF et générer un package Excel pour Business Central.

## Fonctionnalités

- 📄 Import de multiples factures PDF par drag & drop
- 🔍 Extraction automatique des données via OCR (n8n + Tesseract)
- 🤖 Enrichissement RAG (mapping fournisseur → N° BC, compte G/L)
- ✏️ Validation et édition des données
- 📦 Génération du package Excel BC (Configuration Packages)

## Architecture

```
┌─────────┐     ┌───────────────┐     ┌──────────────┐     ┌─────────────┐
│  PDFs   │────▶│ n8n Batch     │────▶│  Interface   │────▶│ Vercel API  │
│ (batch) │     │ Extract (sync)│     │  Validation  │     │ Generate    │
└─────────┘     └───────────────┘     └──────────────┘     └─────────────┘
```

## Déploiement

### Prérequis

- Node.js 18+
- Compte Vercel
- n8n avec workflow batch-extract configuré

### Installation

```bash
# Cloner le repo
git clone https://github.com/Davidb-2107/batch-invoice-processor.git
cd batch-invoice-processor

# Installer les dépendances
npm install

# Développement local
npm start
```

### Déploiement Vercel

```bash
# Login
vercel login

# Configurer la variable d'environnement
vercel env add BC_TEMPLATE_URL
# Valeur: https://raw.githubusercontent.com/Davidb-2107/business-central-api-integration/main/bc_template.xlsx

# Déployer
vercel --prod
```

## Configuration

| Variable | Description |
|----------|-------------|
| `REACT_APP_N8N_URL` | URL du webhook n8n (défaut: https://hen8n.com/webhook) |
| `BC_TEMPLATE_URL` | URL du template Excel BC |

## Workflow n8n requis

Le workflow `batch-extract` doit être configuré pour:
1. Recevoir un fichier PDF en POST
2. Extraire le texte via Tesseract OCR
3. Parser les données (montant, référence, date échéance)
4. Lookup RAG pour fournisseur et compte G/L
5. Retourner les données en JSON synchrone

## Licence

MIT