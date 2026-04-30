// ============================================================
// HTML Document Template
// Wraps body HTML in a complete, valid HTML document with
// Tailwind CSS CDN for standalone viewing/export.
// ============================================================

/**
 * Wrap body HTML in a complete HTML document with Tailwind CDN.
 * Used for single-page export / preview.
 */
export function wrapInDocument(bodyHtml: string, title: string = 'Page'): string {
    const safeTitle = escapeHtmlContent(title)
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

/**
 * Minimal wrapper for AI iteration — just the root div, no document chrome.
 */
export function wrapForAI(bodyHtml: string): string {
    return `<div>\n${bodyHtml}\n</div>`
}

function escapeHtmlContent(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
