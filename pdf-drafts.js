// Drafts are explicit local downloads. No document or answers are uploaded or stored online.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PdfToolsDrafts = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
    function createDraft(bytes, fields, signatures, filename, pages) {
        const data = new Uint8Array(bytes);
        let binary = '';
        for (let offset = 0; offset < data.length; offset += 32768) binary += String.fromCharCode(...data.subarray(offset, offset + 32768));
        return {
            format: 'pdf-tools-draft', version: 1, filename,
            fields: Array.from(fields.values(), field => ({ name: field.name, type: field.type, value: field.value, dirty: field.dirty })),
            pages: pages.map(page => ({ index: page.index, selected: !!page.selected })),
            pdf: btoa(binary), signatures: { ...signatures }
        };
    }
    function readDraft(text) {
        const draft = JSON.parse(text);
        if (draft.format !== 'pdf-tools-draft' || draft.version !== 1 || typeof draft.pdf !== 'string' || !Array.isArray(draft.fields) || !Array.isArray(draft.pages)) throw new Error('This is not a PDF Tools draft.');
        const binary = atob(draft.pdf);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('The draft does not contain a valid PDF.');
        return { draft, bytes };
    }
    function restoreFields(fields, savedFields) {
        for (const saved of savedFields) {
            const field = fields.get(saved.name);
            if (!field || field.readOnly || field.type !== saved.type) continue;
            const valid = field.type === 'text' ? typeof saved.value === 'string'
                : field.type === 'checkbox' ? typeof saved.value === 'boolean'
                : field.type === 'radio' ? saved.value === undefined || typeof saved.value === 'string'
                : field.type === 'choice' && Array.isArray(saved.value) && saved.value.every(value => typeof value === 'string');
            if (!valid) continue;
            field.value = saved.value; field.dirty = !!saved.dirty;
        }
    }
    return { createDraft, readDraft, restoreFields };
});
