import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  Download,
  RotateCcw,
  AlertCircle,
  X,
  Loader2,
  FileSearch,
  BookOpen,
} from 'lucide-react';
import { TipTapEditor } from './components/TipTapEditor';
import {
  TargetLanguage,
  GenerateResponse,
  ExtractResponse,
  SUPPORTED_LANGUAGES,
} from './types';
import { downloadArticleHtml } from './utils/exportHtml';

const MAX_CHARACTERS = 50000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const App: React.FC = () => {
  const [sourceText, setSourceText] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>('en');

  // Generation state
  const [headline, setHeadline] = useState<string>('');
  const [subheadline, setSubheadline] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string>('');
  const [sourceNotes, setSourceNotes] = useState<string[]>([]);

  // Status flags
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastGeneratedLang, setLastGeneratedLang] = useState<TargetLanguage>('en');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const charCount = sourceText.length;
  const isCharLimitExceeded = charCount > MAX_CHARACTERS;
  const canGenerate = sourceText.trim().length > 0 && !isCharLimitExceeded && !isGenerating;
  const hasArticle = headline.trim().length > 0 || bodyHtml.trim().length > 0;

  // Handle File Upload & Extraction via /api/extract
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input value so re-uploading the same file works
    event.target.value = '';
    setErrorMessage(null);

    // Client-side validation: format check
    const filenameLower = file.name.toLowerCase();
    const isSupported =
      filenameLower.endsWith('.txt') ||
      filenameLower.endsWith('.docx') ||
      filenameLower.endsWith('.pdf');

    if (!isSupported) {
      setErrorMessage(
        'Unsupported file format. Please upload a .txt, .docx, or .pdf document.'
      );
      return;
    }

    // Client-side validation: size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(
        `File exceeds maximum allowed size of 4 MB (selected file: ${(
          file.size /
          (1024 * 1024)
        ).toFixed(2)} MB).`
      );
      return;
    }

    setIsExtracting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to extract text from file.');
      }

      const extractResult = data as ExtractResponse;
      setSourceText(extractResult.text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error extracting text from file.';
      setErrorMessage(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  // Trigger article generation via /api/generate
  const handleGenerate = async () => {
    if (!canGenerate) return;

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sourceText,
          targetLanguage,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to generate article.');
      }

      const result = data as GenerateResponse;
      setHeadline(result.headline || '');
      setSubheadline(result.subheadline || null);
      setBodyHtml(result.body_html || '');
      setSourceNotes(result.source_notes || []);
      setLastGeneratedLang(targetLanguage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation request failed.';
      setErrorMessage(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate with existing source and chosen language
  const handleRegenerate = () => {
    handleGenerate();
  };

  // Export standalone HTML file
  const handleExportHtml = () => {
    if (!hasArticle) return;
    downloadArticleHtml({
      headline,
      subheadline,
      bodyHtml,
      targetLanguage: lastGeneratedLang,
    });
  };

  // Quick sample loader for testing convenience
  const loadSample = (type: 'transcript' | 'brief' | 'malayalam') => {
    setErrorMessage(null);
    if (type === 'transcript') {
      setSourceText(
        `Q: Dr. Menon, could you tell us about the new solar energy project your team is deploying?\n` +
        `Dr. Menon: Yes, we are rolling out a 50-megawatt distributed floating solar installation on several reservoir networks. Phase one is expected to generate 70 gigawatt-hours annually.\n` +
        `Q: What makes this approach unique compared to standard ground-mounted panels?\n` +
        `Dr. Menon: Standard panels take up valuable agricultural land. By placing bifacial photovoltaic modules on water reservoirs, we reduce water evaporation by nearly 35 percent and the water cooling effect actually improves panel efficiency by 12 percent. As I always say, "Engineering should work in harmony with nature, not compete with it."\n` +
        `Q: How much did the project cost?\n` +
        `Dr. Menon: The initial capital outlay for phase one is around 180 crore rupees, funded through a public-private partnership.\n` +
        `Q: Are there any environmental concerns from local fishermen?\n` +
        `Dr. Menon: A few groups raised questions about sunlight penetration impacting aquatic plants. We conducted a 6-month limnological assessment and found that covering only 20 percent of the reservoir surface area keeps the aquatic ecosystem completely healthy.`
      );
    } else if (type === 'brief') {
      setSourceText(
        `KOCHI — Kerala Startup Mission (KSUM) announced a 25 crore rupee seed fund initiative for early-stage artificial intelligence and deep-tech startups. The fund will provide matching grants of up to 50 lakh rupees per venture alongside mentorship from global technology executives. Applications open next Monday and close on December 15. The initiative aims to support at least 40 innovative homegrown enterprises over the next 18 months.`
      );
    } else {
      setSourceText(
        `സംസ്ഥാനത്തെ സർക്കാർ വിദ്യാലയങ്ങളിൽ പുതിയ അധ്യയന വർഷം മുതൽ നിർമ്മിത ബുദ്ധി (AI) അടിസ്ഥാനമാക്കിയുള്ള പഠന പദ്ധതികൾ നടപ്പിലാക്കുമെന്ന് വിദ്യാഭ്യാസ മന്ത്രി അറിയിച്ചു. ആദ്യഘട്ടത്തിൽ 500 ഹൈസ്കൂളുകളിലാണ് പദ്ധതി ആരംഭിക്കുന്നത്. ഇതിനായി പ്രത്യേക കരിക്കുലം തയ്യാറാക്കിയിട്ടുണ്ട്. അധ്യാപകർക്ക് മെയ് മാസത്തിൽ പ്രത്യേക പരിശീലനം നൽകും. "വിദ്യാർത്ഥികളെ ഭാവി സാങ്കേതികവിദ്യകൾക്ക് സജ്ജരാക്കുക എന്നതാണ് സർക്കാരിന്റെ ലക്ഷ്യം" എന്ന് മന്ത്രി പറഞ്ഞു. ഇതിനായി 15 കോടി രൂപ വകയിരുത്തി.`
      );
      setTargetLanguage('en');
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <h1 className="brand-title">ManoramaAI</h1>
          <span className="brand-subtitle">
            Multilingual Newsroom Engine
          </span>
        </div>
      </header>

      {/* Global Error Notification */}
      {errorMessage && (
        <div className="error-banner" role="alert">
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main 2-Column Responsive Workspace */}
      <main className="main-grid">
        {/* Left Column: Source Material Card */}
        <section className="card" aria-labelledby="source-card-title">
          <div className="card-header">
            <h2 id="source-card-title" className="card-title">
              <FileText size={18} />
              <span>Source Material</span>
            </h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                onClick={() => loadSample('transcript')}
                title="Load English interview sample"
              >
                Sample 1
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                onClick={() => loadSample('brief')}
                title="Load English news brief sample"
              >
                Sample 2
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                onClick={() => loadSample('malayalam')}
                title="Load Malayalam draft sample"
              >
                Sample 3
              </button>
            </div>
          </div>

          <div className="card-body">
            {/* File Upload Row */}
            <div className="upload-row">
              <div className="upload-info">
                <strong>Upload Document</strong> (.txt, .docx, .pdf up to 4 MB)
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                aria-label="Upload document"
              />
              <button
                type="button"
                className="btn-file-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting || isGenerating}
              >
                {isExtracting ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Browse File
                  </>
                )}
              </button>
            </div>

            {/* Source Textarea */}
            <div className="textarea-wrapper">
              <textarea
                className="source-textarea"
                placeholder="Paste interview transcripts, rough notes, press releases, or news briefs here in any language (English, Malayalam, Manglish, Hindi, Tamil...)..."
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                aria-label="Raw source material input"
              />
              <div
                className={`char-counter ${
                  isCharLimitExceeded
                    ? 'danger'
                    : charCount > 45000
                    ? 'warning'
                    : ''
                }`}
              >
                {charCount.toLocaleString()} / {MAX_CHARACTERS.toLocaleString()}{' '}
                characters
              </div>
            </div>

            {/* Language Selector + Generate Action */}
            <div className="action-row">
              <div className="lang-select-group">
                <label htmlFor="target-language-select" className="label-subtle">
                  Target Language
                </label>
                <select
                  id="target-language-select"
                  className="lang-select"
                  value={targetLanguage}
                  onChange={(e) =>
                    setTargetLanguage(e.target.value as TargetLanguage)
                  }
                  disabled={isGenerating}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn-generate"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Synthesizing Article...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Generate Article
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Generated Article Card */}
        <section className="card" aria-labelledby="article-card-title">
          <div className="card-header">
            <h2 id="article-card-title" className="card-title">
              <BookOpen size={18} />
              <span>News Article</span>
            </h2>

            {hasArticle && (
              <div className="article-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRegenerate}
                  disabled={isGenerating || !canGenerate}
                  title="Re-run generation with current source and language"
                >
                  <RotateCcw size={15} />
                  Regenerate
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExportHtml}
                  title="Export as standalone HTML file"
                >
                  <Download size={15} />
                  Export HTML
                </button>
              </div>
            )}
          </div>

          <div className="card-body">
            {!hasArticle && !isGenerating && (
              <div className="empty-article-state">
                <FileSearch className="empty-icon" />
                <p style={{ fontWeight: 600, color: '#334155' }}>
                  No article generated yet
                </p>
                <p style={{ fontSize: '0.9rem', maxWidth: '340px' }}>
                  Paste source material or upload a document on the left, choose a
                  target language, and click "Generate Article".
                </p>
              </div>
            )}

            {isGenerating && (
              <div className="empty-article-state">
                <Loader2 size={36} className="spinner" style={{ color: 'var(--color-primary)' }} />
                <p style={{ fontWeight: 600, color: '#334155', marginTop: '0.75rem' }}>
                  Crafting inverted-pyramid news article...
                </p>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Structuring headline, lede, verified quotes, and source notes in native journalistic register.
                </p>
              </div>
            )}

            {hasArticle && !isGenerating && (
              <>
                {/* Headline Input */}
                <div className="headline-input-wrapper">
                  <label htmlFor="article-headline-input" className="label-subtle">
                    Headline
                  </label>
                  <input
                    id="article-headline-input"
                    type="text"
                    className="headline-input"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Enter or edit headline..."
                  />
                </div>

                {/* Subheadline (if provided) */}
                {subheadline && (
                  <div className="subheadline-display" title="Subheadline / Deck">
                    {subheadline}
                  </div>
                )}

                {/* TipTap Rich Text Editor */}
                <div>
                  <label className="label-subtle" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Article Body
                  </label>
                  <TipTapEditor content={bodyHtml} onChange={setBodyHtml} />
                </div>

                {/* Source Notes Panel */}
                {sourceNotes && sourceNotes.length > 0 && (
                  <div className="source-notes-card" aria-label="Source notes and fact check">
                    <div className="source-notes-header">
                      <AlertCircle size={16} />
                      <span>Source Notes &amp; Missing Details</span>
                    </div>
                    <ul className="source-notes-list">
                      {sourceNotes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

