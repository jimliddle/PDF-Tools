const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const canvas = require('@napi-rs/canvas');
Object.assign(global, { DOMMatrix: canvas.DOMMatrix, Path2D: canvas.Path2D, ImageData: canvas.ImageData });
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const PDFLib = require('pdf-lib');
const forms = require('../pdf-form-tools.js');
const visual = require('../pdf-visual-export.js');
const factory = {
    create(width, height) { const image = canvas.createCanvas(Math.ceil(width), Math.ceil(height)); return { canvas: image, context: image.getContext('2d') }; },
    reset(target, width, height) { target.canvas.width = Math.ceil(width); target.canvas.height = Math.ceil(height); },
    destroy(target) { target.canvas.width = target.canvas.height = 1; target.canvas = target.context = null; }
};
const fontPath = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
function open(bytes) { return pdfjs.getDocument({ data: new Uint8Array(bytes), canvasFactory: factory, standardFontDataUrl: fontPath, disableFontFace: true, useSystemFonts: false }).promise; }
async function render(pdf, pageNumber, scale = 1) {
    const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale });
    const image = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: image.getContext('2d'), viewport, annotationMode: 3 }).promise;
    return image;
}
async function fixture() {
    const doc = await PDFLib.PDFDocument.create();
    const first = doc.addPage([400, 500]), second = doc.addPage([500, 650]);
    first.drawText('ORIGINAL PAGE CONTENT', { x: 30, y: 450, size: 18 });
    first.drawRectangle({ x: 30, y: 30, width: 340, height: 20, color: PDFLib.rgb(1, 0, 0) });
    second.drawText('SECOND PAGE CONTENT', { x: 30, y: 550, size: 18 }); second.setRotation(PDFLib.degrees(90));
    const field = doc.getForm().createTextField('Answer'); field.setText('BEFORE');
    field.addToPage(first, { x: 30, y: 350, width: 300, height: 30 });
    field.addToPage(second, { x: 30, y: 400, width: 300, height: 30 });
    field.setFontSize(12);
    const orphan = field.acroField.getWidgets()[0].dict.clone(doc.context); orphan.delete(PDFLib.PDFName.of('P'));
    const ref = PDFLib.PDFRef.of(1172); doc.context.assign(ref, orphan); field.acroField.addWidget(ref);
    return doc.save();
}
function difference(first, second, rect = [0, 0, first.width, first.height]) {
    const a = first.getContext('2d').getImageData(...rect).data, b = second.getContext('2d').getImageData(...rect).data;
    let count = 0; for (let index = 0; index < a.length; index += 4) if (Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]) > 60) count++;
    return count;
}

test('rendered export keeps original page graphics and edited text, including an orphan widget', async () => {
    const bytes = await fixture(), doc = await PDFLib.PDFDocument.load(bytes), fields = forms.describeForm(doc);
    const pdf = await open(bytes);
    const before = await render(pdf, 1);
    Object.assign(fields.get('Answer'), { value: 'AFTER: THESE EDITS REMAIN', dirty: true });
    const result = await visual.createRenderedPdf({ pdf, fields, pageIndices: [0], createCanvas: canvas.createCanvas, loadImage: canvas.loadImage, scale: 2 });
    const exported = await open(result.bytes);
    try {
        const after = await render(exported, 1), expected = await render(pdf, 1);
        assert.ok(visual.canvasInk(after).ink > 1000, 'The actual exported PDF must contain visible content.');
        assert.ok(difference(before, after, [25, 112, 310, 45]) > 100, 'The exported text must change from the original field value.');
        assert.ok(difference(expected, after, [20, 20, 360, 55]) < 500, 'Original page headings must survive.');
        assert.ok(difference(expected, after, [20, 440, 360, 45]) < 500, 'Original page graphics must survive.');
        assert.equal((await PDFLib.PDFDocument.load(result.bytes)).getForm().getFields().length, 0);
        assert.equal((await PDFLib.PDFDocument.load(bytes)).getForm().getTextField('Answer').getText(), 'BEFORE');
        if (process.env.PDF_TOOLS_VISUAL_OUTPUT) fs.writeFileSync(process.env.PDF_TOOLS_VISUAL_OUTPUT, result.bytes);
    } finally { await exported.destroy(); await pdf.destroy(); }
});

test('rendered export follows selected order and includes signatures on rotated pages', async () => {
    const bytes = await fixture(), fields = forms.describeForm(await PDFLib.PDFDocument.load(bytes)), pdf = await open(bytes);
    const signature = canvas.createCanvas(650, 500), context = signature.getContext('2d');
    context.fillStyle = '#0000ff'; context.fillRect(200, 200, 100, 30);
    const result = await visual.createRenderedPdf({ pdf, fields, pageIndices: [1, 0], signatures: { 1: signature.toDataURL('image/png') }, createCanvas: canvas.createCanvas, loadImage: canvas.loadImage, scale: 2 });
    const output = await open(result.bytes);
    try {
        const first = await render(output, 1);
        assert.equal(first.width, 650); assert.equal(first.height, 500);
        const pixel = first.getContext('2d').getImageData(240, 215, 1, 1).data;
        assert.ok(pixel[2] > 200 && pixel[0] < 50 && pixel[1] < 50, 'The signature must be visible at the displayed page coordinates.');
        const second = await render(output, 2);
        assert.equal(second.width, 400); assert.equal(second.height, 500);
        assert.ok(visual.canvasInk(second).ink > 1000);
    } finally { await output.destroy(); await pdf.destroy(); }
});

test('a render failure is propagated without resetting the document or field values', async () => {
    const fields = new Map([['Answer', { type: 'text', value: 'Keep this edit', dirty: true }]]);
    const pdf = { annotationStorage: { setValue() {} }, async getPage() { return { getAnnotations: async () => [], getViewport: () => ({ width: 100, height: 100 }), render: () => ({ promise: Promise.reject(new Error('Rendering failed')) }) }; } };
    await assert.rejects(visual.createRenderedPdf({ pdf, fields, pageIndices: [0], createCanvas: canvas.createCanvas }), /Rendering failed/);
    assert.equal(fields.get('Answer').value, 'Keep this edit');
    await assert.rejects(visual.createRenderedPdf({ pdf, fields, pageIndices: [], createCanvas: canvas.createCanvas }), /Select at least one page/);
});
