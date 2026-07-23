# Third-Party Notices

This project loads the following pinned third-party resources at runtime. The project
`LICENSE` applies to the original StudyPlanner code and does not replace these upstream
licenses.

| Component | Version | Purpose | Upstream license |
| --- | --- | --- | --- |
| [Pretendard](https://github.com/orioncactus/pretendard/tree/v1.3.9) | 1.3.9 | Web font | SIL Open Font License 1.1 |
| [Marked](https://github.com/markedjs/marked/tree/v15.0.12) | 15.0.12 | Markdown parsing | MIT; upstream also carries the Markdown license notice |
| [DOMPurify](https://github.com/cure53/DOMPurify/tree/3.4.7) | 3.4.7 | HTML sanitization | Apache License 2.0 |
| [KaTeX](https://github.com/KaTeX/KaTeX/tree/v0.16.11) | 0.16.11 | Math rendering | MIT |
| [jsPDF](https://github.com/parallax/jsPDF/tree/v2.5.1) | 2.5.1 | PDF generation | MIT |
| [html2canvas](https://github.com/niklasvh/html2canvas/tree/v1.4.1) | 1.4.1 | HTML capture for PDF output | MIT |
| [JSZip](https://github.com/Stuk/jszip/tree/v3.10.1) | 3.10.1 | Obsidian ZIP generation | MIT or GPLv3, used here under the MIT option |

## Runtime Delivery

The HTML references version-pinned files on jsDelivr and the Pretendard GitHub CDN.
Those library binaries are not copied into this repository. A browser or intermediary
cache may retain them during normal use.

## Release Check

Before freezing a registration or production release:

1. Confirm that the versions in this file match every external URL in the HTML.
2. Recheck each upstream license at the pinned tag.
3. Keep the applicable notices with any redistributed vendored copy.
4. If a dependency is replaced or vendored, update this file and the registration scope.

