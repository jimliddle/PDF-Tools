// Run only in an existing PDF Tools tab. All backup creation happens locally in that browser.
import './pdf-drafts.js?recovery=20261110';

export function recover() {
    if (typeof currentPdfBytes === 'undefined' || !currentPdfBytes || typeof formFields === 'undefined') throw new Error('Run this in the PDF Tools tab containing your edits. Do not refresh that tab.');
    if (typeof editorBusy !== 'undefined' && editorBusy) throw new Error('Wait for the page to finish displaying, then run recovery again.');
    if (typeof activePageIndex !== 'undefined' && activePageIndex !== null) saveSignature();
    const filename = document.getElementById('filename-input').value.trim() || 'document_edited';
    const pages = Array.from(document.querySelectorAll('.page-card'), card => ({ index: Number(card.dataset.idx), selected: card.querySelector('.cb').checked }));
    const draft = window.PdfToolsDrafts.createDraft(currentPdfBytes, formFields, pageSignatures, filename, pages);
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename.replace(/\.pdf$/i, '') + '_recovery.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    document.getElementById('status').textContent = 'Local recovery draft download requested. After keeping that JSON file, open the current PDF Tools page and use Restore Draft. Your original PDF, entries, signatures and page selections are included.';
    return { backup: link.download, pages: pages.length, fields: formFields.size, signatures: Object.keys(pageSignatures).length, localDraftRequested: true };
}
