// Render form PDFs through the same PDF.js renderer as the editor. Processing stays local.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('pdf-lib'));
    else root.PdfToolsVisualExport = factory(root.PDFLib);
})(typeof window === 'undefined' ? globalThis : window, function (PDFLib) {
    function widgetValue(annotation, field) {
        if (field.type === 'radio') return field.value === (field.radioOptions?.[annotation.buttonValue] ?? annotation.buttonValue);
        if (field.type === 'choice') return field.value.map(value => annotation.options?.find(option => option.displayValue === value)?.exportValue ?? value);
        return field.value;
    }
    function canvasInk(canvas) {
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let ink = 0, samples = 0;
        for (let index = 0; index < data.length; index += 16) {
            samples++;
            if (data[index + 3] && Math.min(data[index], data[index + 1], data[index + 2]) < 240) ink++;
        }
        return { ink, samples, fraction: samples ? ink / samples : 0 };
    }
    function browserCanvas(width, height) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
    }
    async function browserImage(source) { const image = new Image(); image.src = source; await image.decode(); return image; }

    async function createRenderedPdf({ pdf, fields, pageIndices, signatures = {}, createCanvas = browserCanvas, loadImage = browserImage, onProgress = () => {}, scale = 3 }) {
        if (!pageIndices.length) throw new Error('Select at least one page to export.');
        const output = await PDFLib.PDFDocument.create(), renderedPages = [];
        for (const index of pageIndices) {
            const page = await pdf.getPage(index + 1);
            for (const annotation of await page.getAnnotations({ intent: 'display' })) {
                const field = fields.get(annotation.fieldName);
                if (field?.dirty && !field.readOnly && field.type !== 'unsupported') pdf.annotationStorage.setValue(annotation.id, { value: widgetValue(annotation, field) });
            }
        }
        for (let position = 0; position < pageIndices.length; position++) {
            const index = pageIndices[position], page = await pdf.getPage(index + 1);
            onProgress(position + 1, pageIndices.length);
            const base = page.getViewport({ scale: 1 });
            const renderScale = Math.min(scale, Math.sqrt(16000000 / (base.width * base.height)));
            const viewport = page.getViewport({ scale: renderScale });
            const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
            try {
                const context = canvas.getContext('2d');
                await page.render({ canvasContext: context, viewport, annotationMode: 3, intent: 'display', background: 'rgb(255,255,255)' }).promise;
                if (signatures[index]) context.drawImage(await loadImage(signatures[index]), 0, 0, canvas.width, canvas.height);
                const ink = canvasInk(canvas);
                const image = await output.embedPng(canvas.toDataURL('image/png'));
                const target = output.addPage([base.width, base.height]);
                target.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
                renderedPages.push({ index, width: base.width, height: base.height, ...ink });
            } finally { canvas.width = canvas.height = 1; }
        }
        return { bytes: await output.save(), pages: renderedPages };
    }
    return { createRenderedPdf, canvasInk, widgetValue };
});
