// Shared PDF form handling for the toolkit and in-place recovery.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('pdf-lib'));
    else root.PdfToolsForms = factory(root.PDFLib);
})(typeof window === 'undefined' ? globalThis : window, function (PDFLib) {
    const { PDFDocument } = PDFLib;
    function hasXfa(doc) {
        const form = doc.catalog.lookupMaybe(PDFLib.PDFName.of('AcroForm'), PDFLib.PDFDict);
        return !!form && form.has(PDFLib.PDFName.of('XFA'));
    }

    function describeForm(doc) {
        const fields = new Map();
        for (const field of doc.getForm().getFields()) {
            const info = { name: field.getName(), readOnly: field.isReadOnly(), dirty: false };
            if (field instanceof PDFLib.PDFTextField && !field.isRichFormatted()) {
                Object.assign(info, { type: 'text', value: field.getText() || '', multiline: field.isMultiline(), maxLength: field.getMaxLength(), password: field.isPassword(), alignment: field.getAlignment() });
            } else if (field instanceof PDFLib.PDFCheckBox) {
                Object.assign(info, { type: 'checkbox', value: field.isChecked() });
            } else if (field instanceof PDFLib.PDFRadioGroup) {
                const options = field.getOptions();
                const radioOptions = Object.fromEntries(field.acroField.getOnValues().map((value, index) => [value.decodeText(), options[index]]));
                Object.assign(info, { type: 'radio', value: field.getSelected(), options, radioOptions });
            } else if (field instanceof PDFLib.PDFDropdown || field instanceof PDFLib.PDFOptionList) {
                const options = field.getOptions();
                const rawOptions = field.acroField.getOptions();
                const value = field.getSelected().map(selected => {
                    const index = rawOptions.findIndex(option => option.value.decodeText() === selected);
                    return index < 0 ? selected : options[index];
                });
                Object.assign(info, { type: 'choice', value, options, multiple: field.isMultiselect(), editable: field instanceof PDFLib.PDFDropdown && field.isEditable(), list: field instanceof PDFLib.PDFOptionList });
            } else {
                info.type = 'unsupported';
            }
            fields.set(info.name, info);
        }
        return fields;
    }

    function applyFormValues(doc, fields) {
        const form = doc.getForm();
        for (const info of fields.values()) {
            if (!info.dirty || info.readOnly) continue;
            const field = form.getField(info.name);
            try {
                if (info.type === 'text') field.setText(info.value);
                else if (info.type === 'checkbox') info.value ? field.check() : field.uncheck();
                else if (info.type === 'radio') info.value ? field.select(info.value) : field.clear();
                else if (info.type === 'choice') info.value.length ? field.select(info.value) : field.clear();
                field.defaultUpdateAppearances(form.getDefaultFont());
            } catch (error) {
                throw new Error(`Could not save field "${info.name}". Check its length and use characters supported by the PDF font. Your entries are still available.`);
            }
        }
        // Bake appearances into page content before copying: copyPages does not copy the AcroForm.
        if (form.getFields().length) {
            const pages = doc.getPages();
            const annotationPages = new Map();
            for (const page of pages) {
                const annotations = page.node.Annots();
                for (let index = 0; annotations && index < annotations.size(); index++) {
                    annotationPages.set(doc.context.lookup(annotations.get(index)), page);
                }
            }
            for (const field of form.getFields()) {
                const widgets = field.acroField.getWidgets();
                for (let index = widgets.length - 1; index >= 0; index--) {
                    const widget = widgets[index];
                    const page = annotationPages.get(widget.dict) || pages.find(page => page.ref === widget.P());
                    if (page) widget.dict.set(PDFLib.PDFName.of('P'), page.ref);
                    else field.acroField.removeWidget(index);
                }
                // An orphan has no visible location. Keep every widget attached to a real page.
                if (!field.acroField.getWidgets().length) form.acroForm.removeField(field.acroField);
            }
            form.updateFieldAppearances();
            for (const field of form.getFields()) {
                for (const widget of field.acroField.getWidgets()) {
                    let normal = widget.AP()?.lookup(PDFLib.PDFName.of('N'));
                    if (!normal && field instanceof PDFLib.PDFSignature) {
                        const rect = widget.getRectangle();
                        const blank = doc.context.formXObject([], { BBox: [0, 0, rect.width, rect.height] });
                        widget.setNormalAppearance(doc.context.register(blank));
                        normal = blank;
                    }
                    const appearances = normal instanceof PDFLib.PDFDict ? normal.values().map(value => doc.context.lookup(value)) : [normal];
                    for (const appearance of appearances) {
                        if (appearance instanceof PDFLib.PDFStream) {
                            // Legacy annotation appearances can omit these; page XObjects cannot.
                            appearance.dict.set(PDFLib.PDFName.of('Type'), PDFLib.PDFName.of('XObject'));
                            appearance.dict.set(PDFLib.PDFName.of('Subtype'), PDFLib.PDFName.of('Form'));
                        }
                    }
                }
            }
            form.flatten({ updateFieldAppearances: false });
            // pdf-lib 1.17 can leave deleted child-widget refs in a page's Annots array.
            for (const page of doc.getPages()) {
                const annotations = page.node.Annots();
                if (!annotations) continue;
                for (let index = annotations.size() - 1; index >= 0; index--) {
                    const annotation = doc.context.lookup(annotations.get(index));
                    if (!annotation || annotation.get?.(PDFLib.PDFName.of('Subtype')) === PDFLib.PDFName.of('Widget')) annotations.remove(index);
                }
            }
        }
    }

    async function createExportPdf(bytes, fields, pageIndices, signatures) {
        if (!pageIndices.length) throw new Error('Select at least one page to export.');
        const srcDoc = await PDFDocument.load(bytes.slice(0));
        if (hasXfa(srcDoc)) throw new Error('XFA forms are not supported. Use a standard fillable PDF (AcroForm).');
        applyFormValues(srcDoc, fields);
        const output = await PDFDocument.create();
        for (const index of pageIndices) {
            const [page] = await output.copyPages(srcDoc, [index]);
            output.addPage(page);
            if (signatures[index]) {
                const image = await output.embedPng(signatures[index]);
                const crop = page.getCropBox();
                const rotation = ((page.getRotation().angle % 360) + 360) % 360;
                const positions = { 0: [crop.x, crop.y], 90: [crop.x + crop.width, crop.y], 180: [crop.x + crop.width, crop.y + crop.height], 270: [crop.x, crop.y + crop.height] };
                const [x, y] = positions[rotation];
                page.drawImage(image, { x, y, width: rotation % 180 ? crop.height : crop.width, height: rotation % 180 ? crop.width : crop.height, rotate: PDFLib.degrees(rotation) });
            }
        }
        return output.save();
    }

    return { hasXfa, describeForm, applyFormValues, createExportPdf };
});
