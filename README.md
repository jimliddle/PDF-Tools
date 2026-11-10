# PDF-Tools
 A single page HTML file that enables individual pages of PDF's to be extracted locally, with individual pages being able to be deleted and pages re-ordered before saving.

 https://jimliddle.github.io/PDF-Tools/

 Pages can be made full screen to analyze contents by clicking the magnifying glass icon, and once in this state the page can be written on (for annotations or signature) and these annotations will be saved out into the new pdf once exported.

Use **Fill Form** to enter text directly into an existing fillable PDF's highlighted boxes. Standard AcroForm text fields (including multiline fields), checkboxes, radio buttons, dropdowns, and option lists are supported. Existing entries are loaded, read-only fields stay read-only, and changes are kept when moving between pages or switching to **Draw / Sign**. Repeated fields stay in sync across pages.

All pages start selected. Use the page checkboxes and drag to choose the pages and their export order, set the filename, then click **Export PDF**. Entries and drawn signatures are fixed into the final PDF so they remain visible after extraction and reordering. Exported fields are no longer editable; keep the original PDF if you need to fill it again.

Scanned documents and printed boxes without actual form fields cannot be filled. XFA forms and editing digital-signature or rich-text fields are not supported. Text that cannot be rendered by the PDF export font produces an error without losing the entries.

As its local it keeps everything local and private. Pdf-lib Javascript ibrary is used as it handles PDF manipulation directly in the browser. Drag-and-Drop Reordering uses the SortableJS lib.

The application uses a CDN to load the library, but the actual processing of your files happens entirely on the local machine.

For development, run `npm ci` and `npm test`. The tests generate PDFs in memory and check form values, visible exported text, repeated fields, page selection/order, rotations, signatures, and error handling. The website remains a single HTML file and requires no build step.

<img width="683" height="399" alt="PDF Tools Image" src="https://github.com/user-attachments/assets/6ed0bba6-124b-4374-ae19-29deb12b26dd" />


