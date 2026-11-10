const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const PDFLib = require('pdf-lib');
const { PDFDocument, PDFName, PDFDict, PDFRawStream, decodePDFRawStream } = PDFLib;

// Exercise the actual page's document functions with the same pdf-lib version as the CDN.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const { describeForm, applyFormValues, createExportPdf, hasXfa } = require('../pdf-form-tools.js');

async function fixture() {
    const doc = await PDFDocument.create();
    const first = doc.addPage([400, 600]);
    const second = doc.addPage([500, 700]);
    const third = doc.addPage([600, 800]);
    third.setRotation(PDFLib.degrees(90));
    first.drawText('PAGE ONE'); second.drawText('PAGE TWO'); third.drawText('PAGE THREE');
    const form = doc.getForm();
    const name = form.createTextField('Full name'); name.setText('Original'); name.setMaxLength(30);
    name.addToPage(first, { x: 30, y: 500, width: 300, height: 25 });
    name.addToPage(second, { x: 30, y: 600, width: 300, height: 25 });
    const notes = form.createTextField('Notes'); notes.enableMultiline();
    notes.addToPage(second, { x: 30, y: 450, width: 300, height: 80 });
    const locked = form.createTextField('Read only'); locked.setText('Locked value'); locked.enableReadOnly();
    locked.addToPage(first, { x: 30, y: 440, width: 300, height: 25 });
    const checkbox = form.createCheckBox('Subscribe'); checkbox.check(); checkbox.addToPage(first, { x: 30, y: 380 });
    const radio = form.createRadioGroup('Contact');
    radio.addOptionToPage('Email', first, { x: 30, y: 330 });
    radio.addOptionToPage('Phone', first, { x: 100, y: 330 }); radio.select('Email');
    const dropdown = form.createDropdown('Country'); dropdown.setOptions(['UK', 'France']); dropdown.select('UK');
    dropdown.addToPage(second, { x: 30, y: 350, width: 200, height: 25 });
    const list = form.createOptionList('Interests'); list.setOptions(['Books', 'Music', 'Travel']); list.enableMultiselect();
    list.select(['Books']); list.addToPage(second, { x: 30, y: 240, width: 200, height: 75 });
    const rotated = form.createTextField('Rotated'); rotated.addToPage(third, { x: 40, y: 500, width: 250, height: 30 });
    return doc.save();
}

// Follow only resources used by the output page, including flattened form appearances.
function pageStreams(page) {
    const streams = [], seen = new Set();
    function visit(value) {
        const object = page.doc.context.lookup(value);
        if (!object || seen.has(object)) return;
        seen.add(object);
        if (object instanceof PDFRawStream) {
            if (object.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) streams.push(Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'));
            visit(object.dict.get(PDFName.of('Resources')));
        } else if (object instanceof PDFDict) {
            for (const [, child] of object.entries()) visit(child);
        } else if (object instanceof PDFLib.PDFArray) {
            for (let index = 0; index < object.size(); index++) visit(object.get(index));
        }
    }
    visit(page.node.Contents()); visit(page.node.Resources());
    return streams;
}
function pageText(page) {
    return pageStreams(page).flatMap(stream => [...stream.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map(match => Buffer.from(match[1], 'hex').toString('latin1'))).join('\n');
}
function edit(fields, name, value) { Object.assign(fields.get(name), { value, dirty: true }); }

test('detects supported types, initial values, limits and read-only fields', async () => {
    const doc = await PDFDocument.load(await fixture());
    const fields = describeForm(doc);
    assert.equal(fields.get('Full name').value, 'Original');
    assert.equal(fields.get('Full name').maxLength, 30);
    assert.equal(fields.get('Notes').multiline, true);
    assert.equal(fields.get('Read only').readOnly, true);
    assert.equal(fields.get('Subscribe').value, true);
    assert.equal(fields.get('Contact').value, 'Email');
    assert.deepEqual(Object.values(fields.get('Contact').radioOptions), ['Email', 'Phone']);
    assert.equal(fields.get('Interests').multiple, true);
});

test('exports text, repeated widgets, multiline entries and options in selected page order', async () => {
    const original = await fixture();
    const fields = describeForm(await PDFDocument.load(original));
    edit(fields, 'Full name', 'Jane Example'); edit(fields, 'Notes', 'First line\nSecond line');
    edit(fields, 'Country', ['France']); edit(fields, 'Interests', ['Music', 'Travel']);
    edit(fields, 'Subscribe', false); edit(fields, 'Contact', 'Phone');
    edit(fields, 'Read only', 'Must not change');
    const output = await PDFDocument.load(await createExportPdf(original, fields, [1, 0], {}));
    assert.equal(output.getPageCount(), 2);
    assert.equal(output.getPage(0).getWidth(), 500);
    assert.equal(output.getPage(1).getWidth(), 400);
    const text = output.getPages().map(pageText);
    assert.match(text[0], /PAGE TWO/); assert.match(text[1], /PAGE ONE/);
    for (const page of text) { assert.match(page, /Jane Example/); assert.doesNotMatch(page, /Original/); }
    assert.match(text[0], /First line\s+Second\s+line/); assert.match(text[0], /France/);
    assert.match(text[0], /Music/); assert.match(text[0], /Travel/);
    assert.match(text[1], /Locked value/); assert.doesNotMatch(text[1], /Must not change/);
    assert.equal(output.getForm().getFields().length, 0);
    for (const page of output.getPages()) assert.equal(page.node.Annots()?.size() || 0, 0);
    assert.equal((await PDFDocument.load(original)).getForm().getTextField('Full name').getText(), 'Original');
});

test('clears prefilled text and exports a subset of pages', async () => {
    const original = await fixture(), fields = describeForm(await PDFDocument.load(original));
    edit(fields, 'Full name', '');
    const output = await PDFDocument.load(await createExportPdf(original, fields, [0], {}));
    assert.equal(output.getPageCount(), 1);
    assert.doesNotMatch(pageText(output.getPage(0)), /Original|PAGE TWO|PAGE THREE/);
});

test('updates checkbox, radio and choice values before flattening', async () => {
    const doc = await PDFDocument.load(await fixture()), fields = describeForm(doc), form = doc.getForm();
    edit(fields, 'Subscribe', false); edit(fields, 'Contact', 'Phone');
    edit(fields, 'Country', ['France']); edit(fields, 'Interests', ['Music', 'Travel']);
    const flatten = form.flatten.bind(form);
    form.flatten = () => {
        assert.equal(form.getCheckBox('Subscribe').isChecked(), false);
        assert.equal(form.getRadioGroup('Contact').getSelected(), 'Phone');
        assert.deepEqual(form.getDropdown('Country').getSelected(), ['France']);
        assert.deepEqual(form.getOptionList('Interests').getSelected(), ['Music', 'Travel']);
        flatten();
    };
    applyFormValues(doc, fields);
    assert.equal(form.getFields().length, 0);
});

test('maps radio appearance names and choice labels into preview storage values', async () => {
    const fields = describeForm(await PDFDocument.load(await fixture()));
    const widgetValue = new Function(script.slice(script.indexOf('function widgetValue'), script.indexOf('function syncFormField')) + '\nreturn widgetValue;')();
    const radio = fields.get('Contact');
    edit(fields, 'Contact', 'Phone');
    const onValues = Object.keys(radio.radioOptions);
    assert.equal(widgetValue({ buttonValue: onValues[0] }, radio), false);
    assert.equal(widgetValue({ buttonValue: onValues[1] }, radio), true);
    const choice = { type: 'choice', value: ['United Kingdom'] };
    assert.deepEqual(widgetValue({ options: [{ displayValue: 'United Kingdom', exportValue: 'GB' }] }, choice), ['GB']);
});

test('keeps page rotation and combines form entries with a signature image', async () => {
    const original = await fixture(), fields = describeForm(await PDFDocument.load(original));
    edit(fields, 'Rotated', 'Rotated entry');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=';
    const output = await PDFDocument.load(await createExportPdf(original, fields, [2], { 2: png }));
    const page = output.getPage(0);
    assert.equal(page.getRotation().angle, 90);
    assert.match(pageText(page), /Rotated entry/);
    const resources = page.node.Resources().lookup(PDFName.of('XObject'), PDFDict);
    assert.ok(resources.entries().some(([, ref]) => output.context.lookup(ref).dict.get(PDFName.of('Subtype')) === PDFName.of('Image')));
});

test('rejects invalid text without changing input or losing entries', async () => {
    const original = await fixture(), fields = describeForm(await PDFDocument.load(original));
    edit(fields, 'Full name', 'x'.repeat(31));
    await assert.rejects(createExportPdf(original, fields, [0], {}), /Could not save field "Full name"/);
    assert.equal(fields.get('Full name').value.length, 31);
    edit(fields, 'Full name', 'Unsupported \u6f22');
    await assert.rejects(createExportPdf(original, fields, [0], {}), /characters supported by the PDF font/);
    await assert.rejects(createExportPdf(original, fields, [], {}), /Select at least one page/);
});

test('continues to export PDFs without forms', async () => {
    const doc = await PDFDocument.create(); doc.addPage().drawText('Plain PDF');
    const original = await doc.save();
    const output = await PDFDocument.load(await createExportPdf(original, new Map(), [0], {}));
    assert.match(pageText(output.getPage(0)), /Plain PDF/);
});

test('detects and refuses XFA forms before data can be discarded', async () => {
    const doc = await PDFDocument.create(); doc.addPage();
    const form = doc.getForm(); form.acroForm.dict.set(PDFName.of('XFA'), doc.context.obj('unsupported'));
    assert.equal(hasXfa(doc), true);
    await assert.rejects(createExportPdf(await doc.save(), new Map(), [0], {}), /XFA forms are not supported/);
});

test('handles blank digital signature fields when creating a final copy', async () => {
    const doc = await PDFDocument.load(await fixture());
    const page = doc.getPage(0);
    const dict = doc.context.obj({ FT: 'Sig', T: PDFLib.PDFHexString.fromText('Digital signature'), Type: 'Annot', Subtype: 'Widget', Rect: [30, 30, 200, 60], P: page.ref });
    const ref = doc.context.register(dict);
    doc.getForm().acroForm.addField(ref); page.node.addAnnot(ref);
    const fields = describeForm(doc);
    assert.equal(fields.get('Digital signature').type, 'unsupported');
    applyFormValues(doc, fields);
    assert.equal(doc.getForm().getFields().length, 0);
});

test('repairs legacy appearance streams and keeps non-form annotations', async () => {
    const doc = await PDFDocument.load(await fixture()), page = doc.getPage(0);
    const field = doc.getForm().getTextField('Full name');
    const appearance = doc.context.lookup(field.acroField.getWidgets()[0].getNormalAppearance());
    appearance.dict.delete(PDFName.of('Type')); appearance.dict.delete(PDFName.of('Subtype'));
    const link = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 50, 30], A: { S: 'URI', URI: PDFLib.PDFString.of('https://example.com') } });
    page.node.addAnnot(doc.context.register(link));
    const original = await doc.save();
    const output = await PDFDocument.load(await createExportPdf(original, describeForm(doc), [0], {}));
    const exportedPage = output.getPage(0);
    assert.match(pageText(exportedPage), /Original/);
    const xObjects = exportedPage.node.Resources().lookup(PDFName.of('XObject'), PDFDict);
    for (const [, reference] of xObjects.entries()) assert.equal(output.context.lookup(reference).dict.get(PDFName.of('Subtype')), PDFName.of('Form'));
    const annotations = exportedPage.node.Annots();
    assert.equal(annotations.size(), 1);
    assert.equal(output.context.lookup(annotations.get(0)).get(PDFName.of('Subtype')), PDFName.of('Link'));
});

// Optional local fixture for manual browser checks; never committed as a binary.
if (process.env.PDF_TOOLS_FIXTURE) fixture().then(bytes => fs.writeFileSync(process.env.PDF_TOOLS_FIXTURE, bytes));

test('exports attached edits despite an orphan widget with the reported reference', async () => {
    const doc = await PDFDocument.load(await fixture());
    const form = doc.getForm(), field = form.getTextField('Full name');
    const orphan = field.acroField.getWidgets()[0].dict.clone(doc.context);
    orphan.delete(PDFName.of('P'));
    const orphanRef = PDFLib.PDFRef.of(1172);
    doc.context.assign(orphanRef, orphan); field.acroField.addWidget(orphanRef);
    assert.throws(() => form.findWidgetPage(field.acroField.getWidgets()[2]), /Could not find page for PDFRef 1172 0 R/);
    const original = await doc.save(), fields = describeForm(doc);
    edit(fields, 'Full name', 'Keep these edits');
    const output = await PDFDocument.load(await createExportPdf(original, fields, [1], {}));
    assert.equal(output.getPageCount(), 1);
    assert.match(pageText(output.getPage(0)), /Keep these edits/);
    assert.equal(fields.get('Full name').value, 'Keep these edits');
    assert.equal(doc.getForm().getTextField('Full name').acroField.getWidgets().length, 3);
});

test('repairs missing and stale widget page pointers and ignores wholly detached fields', async () => {
    const doc = await PDFDocument.load(await fixture()), form = doc.getForm();
    const widgets = form.getTextField('Full name').acroField.getWidgets();
    widgets[0].dict.delete(PDFName.of('P'));
    widgets[1].dict.set(PDFName.of('P'), PDFLib.PDFRef.of(9999));
    const detached = form.createTextField('Detached');
    detached.addToPage(doc.getPage(0), { x: 10, y: 20, width: 100, height: 20 });
    const widget = detached.acroField.getWidgets()[0];
    widget.dict.delete(PDFName.of('P'));
    doc.getPage(0).node.removeAnnot(doc.context.getObjectRef(widget.dict));
    const original = await doc.save(), fields = describeForm(doc);
    edit(fields, 'Full name', 'Still present');
    const output = await PDFDocument.load(await createExportPdf(original, fields, [0, 1], {}));
    for (const page of output.getPages()) assert.match(pageText(page), /Still present/);
});
