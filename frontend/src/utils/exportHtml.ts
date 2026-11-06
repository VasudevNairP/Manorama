import DOMPurify from 'dompurify';
import { TargetLanguage } from '../types';

interface ExportArticleParams {
  headline: string;
  subheadline: string | null;
  bodyHtml: string;
  targetLanguage: TargetLanguage;
}

export function generateExportHtml({
  headline,
  subheadline,
  bodyHtml,
  targetLanguage,
}: ExportArticleParams): string {
  const cleanHeadline = DOMPurify.sanitize(headline.trim());
  const cleanSubheadline = subheadline ? DOMPurify.sanitize(subheadline.trim()) : null;
  const cleanBodyHtml = DOMPurify.sanitize(bodyHtml, {
    ALLOWED_TAGS: ['p', 'h2', 'ul', 'li', 'strong', 'em', 'blockquote'],
    ALLOWED_ATTR: [],
  });

  return `<!DOCTYPE html>
<html lang="${targetLanguage}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanHeadline || 'News Article'}</title>
  <style>
    /* Standalone newspaper-style typography, zero external dependencies */
    :root {
      --font-stack: "Noto Sans Malayalam", "Noto Sans Devanagari", "Noto Sans Tamil", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-stack);
      line-height: 1.75;
      color: #1a1a1a;
      background-color: #fafaf9;
      padding: 2.5rem 1.25rem 4rem 1.25rem;
    }

    .article-wrapper {
      max-width: 700px;
      margin: 0 auto;
      background: #ffffff;
      padding: 3rem 2.5rem;
      border: 1px solid #e7e5e4;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    header {
      border-bottom: 2px solid #1c1917;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }

    .meta-tagline {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #b91c1c;
      margin-bottom: 0.75rem;
    }

    h1.article-headline {
      font-size: 2.15rem;
      font-weight: 800;
      line-height: 1.25;
      color: #0c0a09;
      margin-bottom: 0.75rem;
    }

    p.article-subheadline {
      font-size: 1.2rem;
      line-height: 1.45;
      color: #57534e;
      font-style: italic;
      margin-top: 0.5rem;
    }

    .article-body {
      font-size: 1.075rem;
      line-height: 1.8;
      color: #292524;
    }

    .article-body p {
      margin-bottom: 1.35rem;
      text-align: justify;
      text-justify: inter-word;
    }

    .article-body h2 {
      font-size: 1.4rem;
      font-weight: 700;
      line-height: 1.3;
      margin-top: 2rem;
      margin-bottom: 0.85rem;
      color: #1c1917;
      border-bottom: 1px solid #e7e5e4;
      padding-bottom: 0.35rem;
    }

    .article-body ul {
      margin: 1.25rem 0 1.5rem 1.75rem;
    }

    .article-body li {
      margin-bottom: 0.45rem;
    }

    .article-body blockquote {
      border-left: 4px solid #b91c1c;
      padding: 0.65rem 1.25rem;
      margin: 1.5rem 0;
      color: #44403c;
      background-color: #f5f5f4;
      font-style: italic;
    }

    .article-body strong {
      font-weight: 700;
      color: #0c0a09;
    }

    .article-body em {
      font-style: italic;
    }

    footer {
      margin-top: 3rem;
      padding-top: 1.25rem;
      border-top: 1px solid #e7e5e4;
      font-size: 0.8rem;
      color: #78716c;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="article-wrapper">
    <header>
      <div class="meta-tagline">ManoramaAI News Report</div>
      <h1 class="article-headline">${cleanHeadline}</h1>
      ${cleanSubheadline ? `<p class="article-subheadline">${cleanSubheadline}</p>` : ''}
    </header>
    <main class="article-body">
      ${cleanBodyHtml}
    </main>
    <footer>
      Published via ManoramaAI • Generated from source material
    </footer>
  </div>
</body>
</html>`;
}

export function downloadArticleHtml(params: ExportArticleParams): void {
  const htmlContent = generateExportHtml(params);

  // Derive safe filename: only alphanumeric characters, dashes, and lowercase
  const rawSlug = params.headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);

  // Fallback to "article.html" if slug is empty (e.g. for non-Latin script headlines)
  const filename = rawSlug.length > 0 ? `${rawSlug}.html` : 'article.html';

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

