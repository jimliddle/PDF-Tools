// Run only in an existing PDF Tools tab. All backup creation happens locally in that browser.
import './pdf-form-tools.js?recovery=20261110';
import './pdf-drafts.js?recovery=20261110';

export function recover() {
    if (typeof currentPdfBytes === 'undefined' || !currentPdfBytes || typeof formFields === 'undefined') throw new Error('Run this in the PDF Tools tab containing your edits. Do not refresh that tab.');
    if (typeof editorBusy !== 'undefined' && editorBusy) throw new Error('Wait for the page to finish displaying, then run recovery again.');
    if (typeof activePageIndex !== 'undefined' && activePageIndex !== null) saveSignature();
    const filename = document.getElementById('filename-input').value.trim() || 'document_edited';
    const pages = Array.from(document.querySelectorAll('.page-card'), card => ({ index: Number(card.dataset.idx), selected: card.querySelector('.cb').checked }));
    const draft = window.PdfToolsDrafts.createDraft(currentPdfBytes, formFields, pageSignatures, filename, pages);
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename.replace(/\.pdf$/i, '') + '_recovery.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    // Classic-script declarations in the original tab are writable window properties.
    // Replacing these functions leaves all loaded bytes, entries and drawings untouched.
    window.applyFormValues = window.PdfToolsForms.applyFormValues;
    window.createExportPdf = window.PdfToolsForms.createExportPdf;
    document.getElementById('status').textContent = 'Recovery backup download requested. Your original PDF, all entries, signatures and page selections are included. Export is repaired; click Export PDF when the download has finished.';
    return { backup: link.download, pages: pages.length, fields: formFields.size, signatures: Object.keys(pageSignatures).length, exportRepaired: true };
}
