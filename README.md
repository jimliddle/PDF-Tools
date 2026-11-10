# PDF Tools

Fill in PDF forms, draw signatures, reorder pages, and save just the pages you need. Your documents and answers stay on your device.

[Open PDF Tools](https://jimliddle.github.io/PDF-Tools/)

## Fill in a form

1. Click **Open PDF** and choose your file.
2. Click **Fill Form**, or the magnifying glass on a page.
3. Type in the highlighted boxes and choose any tick boxes or other options.
4. Use **Previous Page** and **Next Page** to move through the document.
5. Click **Save & Close** to return to the page thumbnails.

Entries stay in place when you move between pages or switch between filling and drawing. If the same field appears on more than one page, its value stays in sync. Read-only fields cannot be changed.

## Choose pages and export a PDF

The **Pages to export** bar sits above the page thumbnails. It shows how many pages are selected.

- **Select All** includes every page.
- **Deselect All** clears the selection.
- Tick or untick individual pages to choose which ones to include.
- Drag the thumbnails to change the order of the pages.

All pages are selected when you open a PDF. A restored draft keeps the selection you saved, so check the page count before exporting.

Set the filename, then click **Export PDF**. Only the selected pages are included, in the order shown. The exported file is checked for missing page content, and its first page is previewed below the editor. The document stays open after export.

Completed forms are saved as page images inside a PDF. This keeps the visible text and drawings in place, but the exported fields cannot be edited and the text is not searchable. PDFs without form fields use the original page-copy export.

## Save a draft and come back later

Click **Export Draft** to download a JSON file containing:

- The original PDF, including every page.
- Your form entries and drawn signatures.
- The page order, selection, and export filename.

To continue, click **Restore Draft** and choose that JSON file. You do not need to open the original PDF separately. The JSON is a draft for PDF Tools, not a PDF to open in a document viewer. Older recovery JSON files also work with Restore Draft.

Export a draft before closing the tab if you want to edit the document later. Nothing is saved automatically. The page warns before you leave or replace changes made since the last draft export. Export Draft remains available if PDF export fails.

## Draw or sign a page

Open a page with its magnifying glass, then choose **Draw / Sign**. Use your mouse or a touch screen to draw on the page. **Clear Signature** removes the drawing on that page. Click **Save & Close** when finished.

Drawings are included in the exported PDF. A drawn signature is an image, not a digital certificate.

## Files that can be filled

The PDF must already have editable form fields. Text boxes, multiline fields, tick boxes, radio buttons, dropdowns, and lists are supported.

Scanned pages and printed boxes without form fields cannot be typed into. Password-protected PDFs and forms using Adobe's XFA format cannot be opened. Digital-signature fields and rich-text fields cannot be edited here.

## Privacy

PDFs, answers, signatures, and drafts are processed in your browser. The toolkit does not upload them or save them on a server. Draft files are downloaded to your device and contain the full document and your entries.

The page loads its JavaScript libraries from public CDNs, so an internet connection is needed to load the site.

## Development

The site uses plain HTML and JavaScript and runs on GitHub Pages without a build step.

To install the test dependencies and run the checks:

```sh
npm ci
npm test
```

The [browser check](https://jimliddle.github.io/PDF-Tools/tests/browser.html) tests form filling, PDF export, draft export, and draft restore with a generated sample document. It does not need any personal files.
