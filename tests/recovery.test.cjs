const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const PDFLib = require('pdf-lib');
const forms = require('../pdf-form-tools.js');
const drafts = require('../pdf-drafts.js');

test('local draft round trip retains the original PDF, all entries, signatures and page choices', async () => {
    const doc = await PDFLib.PDFDocument.create(); doc.addPage(); doc.addPage();
    const field = doc.getForm().createTextField('Answer'); field.addToPage(doc.getPage(1));
    const bytes = await doc.save(), fields = forms.describeForm(doc);
    Object.assign(fields.get('Answer'), { value: 'Keep this answer', dirty: true });
    const signatures = { 1: 'data:image/png;base64,fixture' }, pages = [{ index: 1, selected: true }, { index: 0, selected: false }];
    const draft = drafts.createDraft(bytes, fields, signatures, 'completed', pages);
    const restored = drafts.readDraft(JSON.stringify(draft));
    assert.deepEqual(restored.bytes, bytes);
    const restoredDoc = await PDFLib.PDFDocument.load(restored.bytes);
    const restoredFields = forms.describeForm(restoredDoc);
    drafts.restoreFields(restoredFields, restored.draft.fields);
    assert.equal(restoredFields.get('Answer').value, 'Keep this answer');
    assert.equal(restoredFields.get('Answer').dirty, true);
    assert.deepEqual(restored.draft.signatures, signatures);
    assert.deepEqual(restored.draft.pages, pages);
    assert.equal(restoredDoc.getPageCount(), 2);
    assert.throws(() => drafts.readDraft('{"format":"something-else"}'), /not a PDF Tools draft/);
});

test('recovery runs against the old tab bindings, downloads locally and replaces only export functions', async () => {
    const doc = await PDFLib.PDFDocument.create(); doc.addPage();
    const bytes = await doc.save(), fields = new Map([['Answer', { name: 'Answer', type: 'text', value: 'Original live edit', dirty: true }]]);
    let blob, clicked = false, signatureSaved = false;
    const status = { textContent: '' }, filename = { value: 'completed' };
    const link = { click() { clicked = true; }, remove() {} };
    const context = vm.createContext({
        seedBytes: bytes, seedFields: fields,
        PdfToolsForms: forms, PdfToolsDrafts: drafts, Blob,
        document: { getElementById(id) { return id === 'status' ? status : filename; },
            querySelectorAll() { return [{ dataset: { idx: '0' }, querySelector() { return { checked: true }; } }]; },
            createElement() { return link; }, body: { appendChild() {} } },
        URL: { createObjectURL(value) { blob = value; return 'blob:local-backup'; }, revokeObjectURL() {} },
        setTimeout() {}, saveSignature() { signatureSaved = true; },
        fetch() { throw new Error('Recovery must not upload or fetch document data.'); }
    });
    context.window = context;
    vm.runInContext('let currentPdfBytes = seedBytes; let formFields = seedFields; let pageSignatures = {0:"data:image/png;base64,live-drawing"}; let editorBusy = false; let activePageIndex = 0; function createExportPdf() { return "old"; } function applyFormValues() { return "old"; }', context);
    const module = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, '..', 'recover.js'), 'utf8'), { context });
    await module.link(() => new vm.SyntheticModule([], () => {}, { context }));
    await module.evaluate();
    const result = module.namespace.recover();
    assert.equal(signatureSaved, true); assert.equal(clicked, true);
    assert.equal(link.download, 'completed_recovery.json');
    assert.equal(result.exportRepaired, true);
    assert.equal(vm.runInContext('createExportPdf', context), forms.createExportPdf);
    assert.equal(vm.runInContext('applyFormValues', context), forms.applyFormValues);
    assert.equal(vm.runInContext('currentPdfBytes', context), bytes);
    assert.equal(vm.runInContext('formFields', context), fields);
    const saved = drafts.readDraft(await blob.text());
    assert.deepEqual(saved.bytes, bytes);
    assert.equal(saved.draft.fields[0].value, 'Original live edit');
    assert.equal(saved.draft.signatures[0], 'data:image/png;base64,live-drawing');
    assert.match(status.textContent, /Export is repaired/);
});
