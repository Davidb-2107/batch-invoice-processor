// Édition en masse : applique une valeur commune aux champs VIDES d'une facture.
// Ne touche jamais un champ déjà rempli (match BC/RAG préservé).
// Invariants alignés sur updateInvoice() : synchro dimension2, flag modified,
// recalcul du status quand vendorNo + amount sont présents.

export const BULK_FIELDS = ['vendorNo', 'glAccount', 'shortcutDimension2Code'];

const isEmpty = (v) => v === '' || v === null || v === undefined;

// Retourne une nouvelle facture avec les champs vides remplis depuis `bulkFill`.
// Un champ de bulkFill vide (après trim) est ignoré. Facture inchangée => même contenu.
export function applyBulkFillToInvoice(invoice, bulkFill) {
  const updated = { ...invoice };
  let changed = false;
  BULK_FIELDS.forEach((field) => {
    const fillVal = (bulkFill[field] || '').trim();
    if (fillVal && isEmpty(invoice[field])) {
      updated[field] = fillVal;
      changed = true;
      if (field === 'shortcutDimension2Code') updated.dimension2 = fillVal;
    }
  });
  if (changed) {
    updated.modified = true;
    if (updated.vendorNo && updated.amount) {
      updated.status = 'valid';
      updated.confidence = 1.0;
    }
  }
  return updated;
}
