# 🔄 HANDOFF - Batch Invoice Processor

> **Document de reprise de projet** - Contient tous les détails techniques pour continuer le développement

## 📋 Résumé Exécutif

**Projet** : Application de traitement batch de factures PDF suisses avec QR-code  
**Objectif** : Automatiser l'import de factures fournisseurs dans Microsoft Dynamics 365 Business Central  
**Statut** : v1.6 - Fonctionnel avec BC Vendor Lookup, RAG Mandat Lookup amélioré et génération Excel JavaScript  
**Dernière mise à jour** : 2026-01-09  

---

## 🏗️ Architecture Complète

### Stack Technique

| Composant | Technologie | Hébergement |
|-----------|-------------|-------------|
| Frontend | React 18 + Tailwind | Vercel |
| Backend/Workflows | n8n | VPS Docker |
| OCR | Tesseract | VPS Docker |
| Database | PostgreSQL | Neon (Frankfurt) |
| Excel Generation | SheetJS (xlsx) | n8n (natif) |
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
Get Config (PostgreSQL)
    │ - Récupère bc_company_id depuis bc_companies
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
    │ - Passe vendorIBAN, vendorName, debtorName
    ▼
Vendor Lookup (BC Prod) (PostgreSQL)
    │ - Query UNION (IBAN exact + name fuzzy)
    │ - Credentials: Neon Invoice-RAG
    ▼
RAG Lookup Mandat (PostgreSQL)
    │ - Lookup invoice_vendor_mappings par debtorName (bidirectionnel)
    │ - Validation input (min 3 caractères)
    │ - Retourne mandat_bc (Code raccourci axe 2)
    ▼
Merge Vendor Data (Code)
    │ - Combine OCR + vendor lookup + RAG mandat
    │ - Ajoute vendorNo, vendorNameBC, canton, mandatBC
    ▼
Aggregate Results (Code)
    │ - Sort par index
    │ - Format final JSON avec shortcutDimension2Code
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
      "paymentReference": "11 00000 00013 99416...",
      "debtorName": "David Esteves Beles"
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
    "vendorConfidence": "1.0",
    "amount": "41.30",
    "shortcutDimension2Code": "93622",
    "sousMandatBC": "",
    "mandatFound": true,
    "mandatConfidence": 0.95
  }]
}
```

### 2. Batch Generate Excel - BC Package
- **ID** : `dgeGUvUH6kBenAA2`
- **Webhook** : `POST https://hen8n.com/webhook/batch-generate-excel`
- **Statut** : ✅ Actif

**Flux de données (v1.5)** :
```
Webhook Generate Excel
    │
    ▼
Generate Excel (Code - JavaScript)
    │ - Utilise require('xlsx') (SheetJS natif n8n)
    │ - Nettoie vendorName (supprime \n)
    │ - Crée 2 sheets : Header + Line
    │ - Type = "Compte général" (avec accents)
    │ - Mappe shortcutDimension2Code vers "Shortcut Dimension 2 Code"
    │ - Génère buffer Excel
    │ - Retourne binary via this.helpers.prepareBinaryData()
    ▼
Respond with Excel
    │ - respondWith: binary
    │ - MIME: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

**Payload d'entrée** :
```json
{
  "invoices": [{
    "documentNo": "INV-001",
    "vendorNo": "F000050",
    "vendorName": "Steuerverwaltung Thurgau",
    "vendorNameBC": "Steuerverwaltung Thurgau Quellensteuer",
    "postingDate": "2026-01-08",
    "dueDate": "2026-02-08",
    "amount": 41.30,
    "description": "Facture janvier",
    "dimension1": "TG",
    "shortcutDimension2Code": "93622",
    "glAccount": "6000",
    "paymentReference": "11 00000 00013 99416..."
  }]
}
```

**Structure Excel générée** :

| Onglet | Lignes | Colonnes |
|--------|--------|----------|
| Purchase Invoice Header | Row 1: Table name, Row 3: Headers, Row 4+: Data | 44 colonnes |
| Purchase Invoice Line | Row 1: Table name, Row 3: Headers, Row 4+: Data | 38 colonnes |

**Colonnes principales Header** :
- Document Type, No., Buy-from Vendor No., Pay-to Vendor No., Pay-to Name
- Posting Date, Document Date, Due Date
- Shortcut Dimension 1 Code (Canton)
- **Shortcut Dimension 2 Code (Mandat)** ← Nouveau v1.5
- Gen. Bus. Posting Group = "Compte général"
- Payment Reference, Vendor Invoice No.

**Colonnes principales Line** :
- Document Type, Document No., Line No., Buy-from Vendor No.
- Type = "Compte général"
- No. (G/L Account), Description
- Direct Unit Cost, Amount, Line Amount
- Shortcut Dimension 1 Code (Canton)
- **Shortcut Dimension 2 Code (Mandat)** ← Nouveau v1.5

**Note technique importante** :
> Le container n8n utilise Alpine Linux avec un Python "externally managed" (PEP 668).
> pip install est bloqué. Solution : utiliser SheetJS (`require('xlsx')`) qui est natif dans n8n.

### 3. RAG Lookup Mandat (Workflow de référence)
- **ID** : `I4jxZ9oILeuIMrYS`
- **Usage** : Référence pour la logique RAG mandat
- **Statut** : ✅ Actif (référence)

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

### Table : bc_companies

```sql
CREATE TABLE bc_companies (
    id SERIAL PRIMARY KEY,
    bc_company_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Données actuelles** : 1 company (CRONUS CH)
- `bc_company_id`: `207217f3-fdb9-f011-af69-6045bde99e23`

### Table : invoice_vendor_mappings (RAG Mandat)

```sql
CREATE TABLE invoice_vendor_mappings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES bc_companies(id),
    debtor_name VARCHAR(255),
    iban VARCHAR(34),
    mandat_bc VARCHAR(50),           -- Code raccourci axe 2
    sous_mandat_bc VARCHAR(50),      -- Sous-mandat optionnel
    confidence DECIMAL(3,2) DEFAULT 0.50,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Données actuelles** : Mappings debtorName → mandat_bc
- Exemple : `debtor_name="David Esteves Beles"` → `mandat_bc="93622"`, `confidence=0.95`

**Query RAG Lookup Mandat (v1.6)** :
```sql
SELECT mandat_bc, sous_mandat_bc, confidence, usage_count
FROM invoice_vendor_mappings m
JOIN bc_companies c ON m.company_id = c.id
WHERE c.bc_company_id = $1
  AND COALESCE(NULLIF(TRIM($2), ''), NULL) IS NOT NULL  -- Ignore si vide
  AND LENGTH(TRIM($2)) >= 3                              -- Minimum 3 caractères
  AND (
    m.debtor_name ILIKE '%' || TRIM($2) || '%'
    OR TRIM($2) ILIKE '%' || m.debtor_name || '%'
  )
ORDER BY confidence DESC, usage_count DESC
LIMIT 1
```

**Paramètres** : `[bc_company_id, debtorName]`

#### Logique de la requête RAG Lookup Mandat

| Élément | Description |
|---------|-------------|
| `COALESCE(NULLIF(TRIM($2), ''), NULL) IS NOT NULL` | Ignore la recherche si `debtorName` est vide ou ne contient que des espaces |
| `LENGTH(TRIM($2)) >= 3` | Exige un minimum de 3 caractères pour éviter les faux positifs |
| `m.debtor_name ILIKE '%' || TRIM($2) || '%'` | Match si le terme de recherche est contenu dans `debtor_name` |
| `TRIM($2) ILIKE '%' || m.debtor_name || '%'` | Match si `debtor_name` est contenu dans le terme de recherche (recherche bidirectionnelle) |
| `TRIM($2)` | Nettoie les espaces en début/fin du paramètre |

**Avantages de la recherche bidirectionnelle** :
- Trouve "David Beles" dans "David Esteves Beles" (partiel → complet)
- Trouve "David Esteves Beles SA" quand `debtor_name` = "David Esteves Beles" (complet → partiel)
- Robuste face aux variations de noms entre factures

**Changements v1.6 vs v1.5** :
- ❌ Suppression de la recherche par IBAN (maintenant uniquement par `debtorName`)
- ✅ Ajout validation input vide
- ✅ Ajout longueur minimale 3 caractères
- ✅ Recherche bidirectionnelle ILIKE
- ✅ TRIM() systématique sur le paramètre

---

## 📱 Frontend React

### Composants Principaux

**App.js** - Composant principal (v1.5)
- State : files, invoices, isProcessing, editingIndex
- Handlers : handleDrop, extractInvoices, generateExcel
- **Nouveau** : Champ `shortcutDimension2Code` (Axe 2 / Mandat)
- **Nouveau** : Indicateurs `mandatFound`, `mandatConfidence`

**lib/pdf-processor.js** - Conversion PDF
- Utilise pdf.js pour render PDF → Canvas → JPEG
- Détecte et extrait QR codes avec jsQR

**lib/qr-parser.js** - Parser Swiss QR
- Parse le format Swiss Payment Code (SPC)
- Extrait : IBAN, vendorName, amount, reference, debtorName

### Flux de données Frontend

```
1. User drops PDF
    ↓
2. PDFProcessor.processPDF()
    ↓ pdf.js render
3. QRParser.parse() - extrait données QR (incl. debtorName)
    ↓
4. fetch() → n8n /batch-extract
    ↓
5. Response avec vendorNo, vendorNameBC, amount, shortcutDimension2Code
    ↓
6. setInvoices() - update state
    ↓
7. Render table avec données enrichies (colonne "Axe 2")
```

### Colonnes du tableau des factures (v1.5)

| Colonne | Source | Éditable | Tooltip |
|---------|--------|----------|---------|
| N° BC | documentNo | Non | "Numéro de document Business Central" |
| Fournisseur | vendorName + vendorNameBC | Non | "Nom du fournisseur (QR + BC)" |
| IBAN | vendorIBAN | Non | "IBAN du fournisseur" |
| Référence | paymentReference | Non | "Référence de paiement Swiss QR" |
| Montant | amount | Oui | "Montant de la facture" |
| N° Fourn. | vendorNo | Oui | "Numéro fournisseur Business Central" |
| Compte | glAccount | Oui | "Compte général (G/L Account)" |
| **Axe 2** | shortcutDimension2Code | Oui | "Code raccourci axe 2 (Mandat BC)" |
| Statut | confidence + mandatFound | Non | "Statut de validation" |

### Indicateurs visuels et tooltips

| Indicateur | Couleur | Tooltip au survol |
|------------|---------|-------------------|
| 🔲 QrCode | — | "QR-code Swiss détecté" |
| ✓ Check | Vert | "Fournisseur trouvé" |
| ⚠ AlertCircle | Jaune | "Fournisseur non trouvé dans BC" |
| ✗ X | Rouge | "QR-code non détecté ou illisible" |
| % Confiance | — | "Confiance de correspondance: XX%" |
| ◆ Mandat | Violet | "Mandat trouvé via RAG (confiance: XX%)" |
| vendorNo | Vert | "Fournisseur trouvé dans Business Central" |
| Axe 2 | Violet | "Mandat trouvé via RAG: XXXXX" |
| Ligne jaune | Jaune | "Ligne modifiée manuellement" |

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
| Neon Invoice-RAG | PostgreSQL | LPLhfJ2K18rp4Geu | Vendor Lookup + RAG Mandat |

---

## 🐛 Troubleshooting

### Problème : vendorNo vide dans l'UI
**Cause** : Le nœud Vendor Lookup n'était pas connecté au flux principal  
**Solution** : Vérifier les connexions dans n8n (Extract → Vendor Lookup → Merge)

### Problème : IBAN non trouvé
**Cause** : Différence de format (espaces)  
**Solution** : Nettoyer l'IBAN avec `.replace(/\\s/g, '')` avant query

### Problème : OCR timeout
**Cause** : Image trop grande  
**Solution** : Réduire la résolution du canvas (scale 1.5 au lieu de 2)

### Problème : Excel "format or extension not valid" (RÉSOLU v1.5)
**Cause** : Python pip bloqué sur Alpine Linux (externally-managed-environment)  
**Solution** : Réécriture complète en JavaScript avec SheetJS natif

### Problème : "Compte general" sans accents (RÉSOLU v1.5)
**Cause** : Encodage incorrect  
**Solution** : Utiliser directement "Compte général" dans le code JavaScript

### Problème : Amount non affiché dans le tableau (RÉSOLU v1.4)
**Cause** : Mapping manquant dans App.js  
**Solution** : Ajouter `amount: inv.amount || qrData?.amount` dans le mapping

### Problème : Binary file not found at Tesseract OCR (RÉSOLU v1.5)
**Cause** : Get Config node inséré entre Webhook et Split Invoices cassait le flux de données binaires  
**Solution** : Modifier Split Invoices pour accéder aux données Webhook directement via `$('Webhook Batch Extract').first().json`

### Problème : shortcutDimension2Code vide
**Cause** : Pas de mapping dans invoice_vendor_mappings pour le debtorName  
**Solution** : Ajouter un enregistrement dans la table avec le debtor_name et mandat_bc correspondants

### Problème : RAG Lookup retourne des faux positifs (RÉSOLU v1.6)
**Cause** : Recherche trop permissive avec des termes courts ou vides  
**Solution** : Ajout validation input (min 3 caractères, ignore si vide) + recherche bidirectionnelle

---

## 🚀 Prochaines Étapes (Roadmap)

### Phase 4 : RAG Learning Amélioré
- [x] ~~RAG Lookup Mandat (Code raccourci axe 2)~~ ✅ v1.5
- [x] ~~Validation input et recherche bidirectionnelle~~ ✅ v1.6
- [ ] Auto-apprentissage : augmenter confidence après validation utilisateur
- [ ] Apprentissage association vendorName → glAccount
- [ ] Interface feedback utilisateur pour corrections

### Phase 5 : Multi-tenant
- [ ] Support plusieurs environnements BC
- [ ] Configuration par tenant
- [ ] Isolation des données

### Phase 6 : Monitoring
- [ ] Slack alerts sur erreurs
- [ ] Dashboard statistiques
- [ ] Logs centralisés

### Améliorations UI
- [x] ~~Tooltips explicatifs sur tous les indicateurs~~ ✅ v1.5
- [ ] Preview PDF dans l'interface
- [ ] Historique des batches
- [ ] Export CSV en plus d'Excel

---

## 📝 Changelog Technique

### v1.6 (2026-01-09)
- **RAG Lookup Mandat amélioré** : Nouvelle requête SQL avec validation input
  - Ignore les recherches si debtorName est vide
  - Exige minimum 3 caractères
  - Recherche bidirectionnelle (terme dans DB OU DB dans terme)
  - TRIM() systématique pour nettoyer les espaces
- **Suppression recherche IBAN** : Le RAG Mandat utilise maintenant uniquement debtorName
- **Documentation** : Mise à jour HANDOFF.md avec explication détaillée de la logique

### v1.5 (2026-01-09)
- **RAG Lookup Mandat** : Nouveau nœud PostgreSQL pour lookup `invoice_vendor_mappings`
- **shortcutDimension2Code** : Ajout du champ "Code raccourci axe 2" dans le workflow et le frontend
- **Frontend** : Nouvelle colonne "Axe 2" avec affichage violet et édition
- **Indicateur mandat** : Icône ◆ dans le statut quand mandat trouvé
- **Tooltips UX** : Ajout de tooltips explicatifs sur tous les indicateurs, colonnes et boutons
- **Fix binary data flow** : Correction du flux de données entre Webhook et Split Invoices

### v1.5 (2026-01-08)
- **Excel Generation** : Réécrit en JavaScript pur avec SheetJS
- **Workflow simplifié** : 3 nodes (Webhook → Code → Respond) au lieu de 5
- **Fix accents** : "Compte général" correctement encodé
- **Suppression dépendances** : Plus de Python/openpyxl

### v1.4 (2026-01-08)
- **Fix amount display** : Ajout mapping amount dans App.js
- **Commits** : 977891b, 9cec1ef

### v1.3 (2026-01-07)
- **BC Vendor Lookup** : Intégration PostgreSQL via IBAN
- **UI enrichie** : vendorNo, vendorNameBC, canton

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
1. Frontend React scan QR Swiss Payment Code (incl. debtorName)
2. Envoie à n8n workflow (ID: U7TyGzvkwHiICE8H)
3. OCR Tesseract + Vendor Lookup PostgreSQL (bc_vendors_prod)
4. RAG Lookup Mandat (invoice_vendor_mappings) → shortcutDimension2Code
   - Recherche bidirectionnelle par debtorName (min 3 chars)
5. Retourne vendorNo, vendorNameBC, canton, amount, shortcutDimension2Code
6. Génération Excel via SheetJS (JavaScript pur) pour BC Configuration Package

**Stack** :
- React 18, Tailwind, pdf.js, jsQR
- n8n (Docker VPS), Tesseract OCR
- PostgreSQL Neon (21 vendors suisses + mappings mandat)
- SheetJS (xlsx) pour génération Excel

**Tables principales** :
- bc_vendors_prod : Fournisseurs BC (vendor_no, iban, canton)
- bc_companies : Companies BC (bc_company_id)
- invoice_vendor_mappings : RAG Mandat (debtor_name → mandat_bc)

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
- [SheetJS Documentation](https://docs.sheetjs.com/)

### Fichiers Clés
- `src/App.js` - Logique principale React
- `src/lib/qr-parser.js` - Parser Swiss QR
- `src/lib/pdf-processor.js` - PDF → Image + QR detection

---

## 📞 Contact

**Développeur** : David B.  
**GitHub** : @Davidb-2107  

---

*Dernière mise à jour : 2026-01-09*
