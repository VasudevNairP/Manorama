# ManoramaAI 📰

**ManoramaAI** is a production-ready, full-stack multilingual newsroom web application. It transforms raw, unstructured source materials (such as interview transcripts, reporter field notes, draft content, and press releases in any language or mixed scripts like Manglish) into clean, professional, inverted-pyramid news articles in a chosen target language (English, Malayalam, Hindi, or Tamil).

Designed for journalistic integrity, it adheres to strict **zero-hallucination** standards: facts, quotes, numbers, and attributions are preserved verbatim from the source, and missing or ambiguous details are explicitly reported in a **Source Notes** panel rather than invented by the model.

---

## Architecture Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    USER INTERFACE                                       |
|  +---------------------------------------+   +---------------------------------------+  |
|  |             Source Card               |   |             Article Card              |  |
|  | - Raw text / Manglish input           |   | - Headline input (editable)           |  |
|  | - Multi-format upload (.txt/.docx/.pdf|   | - Subheadline / Deck                  |  |
|  | - Character counter (50,000 max)      |   | - TipTap Editor (WYSIWYG toolbar)     |  |
|  | - Language selector (en, ml, hi, ta)  |   | - Source Notes (gaps & ambiguities)   |  |
|  | - Generate Article button             |   | - Regenerate & Export HTML buttons    |  |
|  +-------------------+-------------------+   +-------------------+-------------------+  |
+----------------------|-------------------------------------------|----------------------+
                       |                                           |
       POST /api/extract (Multipart)               Client-Side Standalone
       POST /api/generate (JSON)                   HTML Export (DOMPurified,
                       |                           Zero JS, Inlined CSS,
                       v                           Indian Font Fallbacks)
+-----------------------------------------------------------------------------------------+
|                                    BACKEND ENGINE                                       |
|                                (FastAPI / Serverless)                                   |
|                                                                                         |
|   /api/extract                                    /api/generate                         |
|   - File size validation (<= 4 MB)                - Input validation (<= 50,000 chars)  |
|   - Format check (.txt, .docx, .pdf)              - Language whitelist verification     |
|   - PDF extractor (`pypdf`)                       - Structured JSON schema enforcement  |
|   - DOCX extractor (`python-docx`)                - Retry logic on malformed output     |
|   - Scanned PDF detection                         - Rate limit (429) & error handling   |
+---------------------------------------------------|-------------------------------------+
                                                    |
                                                    v
                               +------------------------------------------+
                               |            Google Gemini API             |
                               |    (`google-genai` Python SDK)           |
                               |    Model: GEMINI_MODEL (2.5-flash)       |
                               |    Temperature: 0.25 (Low creativity)    |
                               |    System Prompt: Strict 4-stage newsroom|
                               +------------------------------------------+
```

---

## Tech Stack

- **Frontend**:
  - **React 19 & TypeScript**: Responsive, component-driven UI with real-time state management.
  - **Vite 6**: Fast build tooling and local development server with proxy routing.
  - **TipTap (StarterKit)**: Rich text editorial experience with Bold, Italic, Heading 2, Paragraph, Bullet Lists, and Undo/Redo.
  - **DOMPurify**: Sanitizes HTML content client-side before rendering and export.
  - **Lucide React**: Clean, accessible iconography.
  - **Typography & Font Stack**: Google Fonts (`Noto Sans Malayalam`, `Noto Sans Devanagari`, `Noto Sans Tamil`, `Inter`) with local system fallbacks for native script rendering.
- **Backend**:
  - **Python 3.11+ / FastAPI**: Modern asynchronous REST API server and serverless handler.
  - **Google GenAI SDK (`google-genai`)**: Official Google Gemini Python SDK with structured JSON output enforcement.
  - **Pydantic v2**: Strict schema validation for requests and model outputs.
  - **Text Extraction**: `pypdf` for text-based PDFs, `python-docx` for Word documents, and UTF-8 decoder for plain text.
  - **Deployment**: Vercel Serverless Function configuration (`vercel.json`) with `maxDuration: 60` for generation.

---

## Local Setup & Development

### 1. Prerequisites
- **Node.js**: v18+ (tested with v25)
- **Python**: 3.11+ (tested with 3.13)
- **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

### 2. Clone and Setup Environment

```bash
# 1. Clone the repository and enter the directory
cd Manorama

# 2. Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install backend dependencies
pip install -r api/requirements.txt

# 4. Install frontend dependencies
cd frontend
npm install
cd ..

# 5. Configure environment variables
cp .env.example .env
```

Edit `.env` and add your Gemini API key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Run Locally

Open two terminal tabs:

**Terminal 1 (Backend API):**
```bash
source .venv/bin/activate
uvicorn api.index:app --reload --port 8000
```

**Terminal 2 (Frontend App):**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000` in your browser. The Vite development server automatically proxies all `/api/*` requests to the FastAPI backend at `http://localhost:8000`.

### 4. Running Backend Unit Tests

A comprehensive suite of unit tests verifies file extractions (txt, docx, pdf), error bounds (oversized files, scanned PDFs, unsupported formats), and structured output generation:

```bash
source .venv/bin/activate
python -m unittest tests/test_backend.py
```

---

## How the Prompt Works & How Hallucination is Minimised

The core intelligence resides in `api/prompts.py`. Rather than performing simple summarization or translation, the prompt enforces a 4-stage newsroom workflow within a single LLM execution:

1. **Understand the Source**: The model extracts Who, What, When, Where, Why, How, key claims, speakers, verbatim quotes, and figures.
2. **Inverted Pyramid Journalism**: The article is constructed with an engaging headline, optional subheadline/deck, a punchy lede paragraph containing the most essential development, followed by supporting details in descending order of priority.
3. **Native Register Writing**: Translates meaning and journalistic tone natively rather than literal word-by-word phrasing:
   - **Malayalam**: Formal newspaper Malayalam as in leading dailies (e.g. *Malayala Manorama*), utilizing correct Unicode Malayalam, proper chillu letters (ൽ, ൾ, ർ, ൺ, ൻ, ൿ), natural sandhi, and journalistic attribution phrasing (`...എന്ന് അദ്ദേഹം വ്യക്തമാക്കി`).
   - **English**: AP/Reuters-style active voice and neutral tone.
   - **Hindi & Tamil**: Formal newsroom registers with appropriate journalistic honorifics and attributions.
4. **Verified Quotes Only**: Quotes are used ONLY if present in the raw source, translated faithfully into the target language, and attributed without embellishment or invention.

### Hallucination Prevention Safeguards:
- **Zero Extrapolation Rule**: If dates, places, full names, official causes, or casualty figures are absent in the source, the model is strictly forbidden from guessing.
- **Source Notes Feedback Loop**: Details that are ambiguous or standard news facts omitted from the source are explicitly listed in `source_notes: string[]`. This informs the editor what needs reporting follow-up.
- **Low Temperature**: Set to `0.25` to prioritize deterministic accuracy over speculative creativity.
- **Structured JSON Output**: Model output is constrained to a Pydantic schema (`ArticleResponse`) via Gemini's native `response_schema` mode, retrying automatically on any schema breach.

---

## Multilingual & Script Handling

- **Source Invariance**: The source material can be in English, Malayalam, Hindi, Tamil, or informal mixed scripts (e.g., Manglish).
- **Target Output**: The output is rendered strictly in the chosen target language.
- **Entity Consistency**: Proper nouns are transliterated consistently into the target script; Latin script spellings are included in parentheses on first mention if ambiguity exists.
- **Editor & Export Typography**: Both the live TipTap editor and the exported HTML document employ a font stack (`"Noto Sans Malayalam", "Noto Sans Devanagari", "Noto Sans Tamil", system-ui, sans-serif`) with `<html lang="ml">` (or en/hi/ta) to ensure conjuncts, chillus, and matras render cleanly across all operating systems without network dependencies.

---

## Standalone HTML Export

Clicking **Export HTML** generates a self-contained `.html` file client-side:
- `<meta charset="utf-8">` and `<html lang="...">` set to the selected language (`en`, `ml`, `hi`, `ta`).
- Inlined CSS with zero external network dependencies and no JavaScript.
- Clean newspaper-style column typography (max-width ~700px, centered).
- Content sanitized via DOMPurify before serialization.
- Automatic safe filename generation (e.g., `major-50mw-floating-solar-project.html`) with fallback to `article.html` for non-Latin script headlines.

---

## Known Limitations

- **Scanned PDFs**: Optical Character Recognition (OCR) is not performed on image-only/scanned PDFs. An informative error directs the user to paste the text or provide a text-based document.
- **File Size Limit**: Uploads are restricted to 4 MB (aligned with serverless body boundaries).
- **Character Limit**: Input source text is capped at 50,000 characters to accommodate long-form interviews, legal briefs, and lengthy transcripts.
- **Stateless Operation**: No database or login is used; articles must be exported as HTML or copied before navigating away.

---

## AI Tools Used

- **Runtime LLM**: Google Gemini API via official `google-genai` Python SDK (defaulting to `gemini-2.5-flash`).
- **AI Coding Assistant**: Built with Antigravity (Google DeepMind Advanced Agentic Coding).

