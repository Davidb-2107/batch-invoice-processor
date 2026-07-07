// Self-check pour bulk-fill. Lancer : node src/lib/bulk-fill.test.mjs
// (module ESM sans dépendance ; assert natif Node.)
import assert from 'node:assert';
import { applyBulkFillToInvoice } from './bulk-fill.js';

const bulk = { vendorNo: 'F000099', glAccount: '6000', shortcutDimension2Code: '93622' };

// 1. Champ vide -> rempli
let r = applyBulkFillToInvoice({ vendorNo: '', glAccount: '', shortcutDimension2Code: '' }, bulk);
assert.strictEqual(r.vendorNo, 'F000099');
assert.strictEqual(r.glAccount, '6000');
assert.strictEqual(r.shortcutDimension2Code, '93622');
assert.strictEqual(r.dimension2, '93622', 'dimension2 doit suivre axe 2');
assert.strictEqual(r.modified, true);

// 2. Champ déjà rempli -> préservé (match BC/RAG non écrasé)
r = applyBulkFillToInvoice({ vendorNo: 'F000050', glAccount: '', shortcutDimension2Code: '' }, bulk);
assert.strictEqual(r.vendorNo, 'F000050', 'ligne remplie non écrasée');
assert.strictEqual(r.glAccount, '6000', 'champ vide voisin rempli');

// 3. Input bulk vide -> champ ignoré, facture inchangée
r = applyBulkFillToInvoice({ vendorNo: '', glAccount: '4000', shortcutDimension2Code: '' },
                           { vendorNo: '  ', glAccount: '', shortcutDimension2Code: '' });
assert.strictEqual(r.vendorNo, '', 'input espaces seuls ignoré');
assert.strictEqual(r.glAccount, '4000');
assert.strictEqual(r.modified, undefined, 'aucun changement -> pas de flag modified');

// 4. status/confidence recalculés quand vendorNo + amount présents
r = applyBulkFillToInvoice({ vendorNo: '', amount: 41.30, glAccount: '', shortcutDimension2Code: '' },
                           { vendorNo: 'F000099', glAccount: '', shortcutDimension2Code: '' });
assert.strictEqual(r.status, 'valid');
assert.strictEqual(r.confidence, 1.0);

console.log('bulk-fill: 4/4 OK');
