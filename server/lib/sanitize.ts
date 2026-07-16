// ─── Input sanitization ───────────────────────────────────────────────────────
// Strip HTML/script tags from user-provided strings to prevent stored XSS
// when values are rendered in server-generated HTML (e.g. OAuth callback pages).
export function sanitizeHtml(input: string | null | undefined): string {
    if (!input) return '';
    return input.replace(/<[^>]*>/g, '').trim();
}

// Escape </script> sequences for safe embedding in <script> blocks via JSON.stringify
export function safeJsonForScript(obj: any): string {
    return JSON.stringify(obj).replace(/<\//g, '<\\/');
}