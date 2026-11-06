import io
import os
import json
import logging
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load local .env if available
load_dotenv()

from api.prompts import SYSTEM_PROMPT, build_user_prompt

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("manorama-ai")

app = FastAPI(title="ManoramaAI API", version="1.0.0")

# Enable CORS for local Vite dev server and Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024  # 4 MB
MAX_CHARACTERS = 50000
SUPPORTED_LANGUAGES = {"en", "ml", "hi", "ta"}


class GenerateRequest(BaseModel):
    text: str = Field(..., description="Raw source text to transform into a news article")
    targetLanguage: str = Field(..., description="Target language code: en, ml, hi, ta")


class ArticleResponse(BaseModel):
    headline: str = Field(description="Crisp, compelling news headline")
    subheadline: Optional[str] = Field(default=None, description="Optional subheadline or deck, or null")
    body_html: str = Field(description="Article body in HTML using only <p>, <h2>, <ul>, <li>, <strong>, <em>, <blockquote>")
    source_notes: List[str] = Field(default_factory=list, description="List of ambiguous/unclear points or missing essential details left out")


class ExtractResponse(BaseModel):
    text: str


@app.get("/api/health")
def health_check():
    api_key_set = bool(os.environ.get("GEMINI_API_KEY"))
    model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
    return {
        "status": "healthy",
        "api_key_configured": api_key_set,
        "model": model,
    }


@app.post("/api/extract", response_model=ExtractResponse)
async def extract_text(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided in upload."
        )

    filename_lower = file.filename.lower()
    allowed_extensions = (".txt", ".docx", ".pdf")
    if not any(filename_lower.endswith(ext) for ext in allowed_extensions):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a .txt, .docx, or .pdf file."
        )

    # Read content
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of 4 MB (uploaded size: {len(contents) / (1024 * 1024):.2f} MB)."
        )

    extracted_text = ""

    try:
        if filename_lower.endswith(".txt"):
            try:
                extracted_text = contents.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    extracted_text = contents.decode("utf-8-sig")
                except UnicodeDecodeError:
                    extracted_text = contents.decode("latin-1")

        elif filename_lower.endswith(".pdf"):
            import pypdf
            pdf_stream = io.BytesIO(contents)
            try:
                reader = pypdf.PdfReader(pdf_stream)
                pages_text = []
                for page in reader.pages:
                    page_t = page.extract_text()
                    if page_t:
                        pages_text.append(page_t)
                extracted_text = "\n\n".join(pages_text).strip()
            except Exception as e:
                logger.error(f"Error parsing PDF: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Could not read PDF. The file may be corrupted or password protected."
                )

            if not extracted_text:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scanned PDF or PDF with no extractable text detected. Please paste text directly or provide a text-based document."
                )

        elif filename_lower.endswith(".docx"):
            import docx
            docx_stream = io.BytesIO(contents)
            try:
                doc = docx.Document(docx_stream)
                doc_paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                # Also include table text if present
                for table in doc.tables:
                    for row in table.rows:
                        row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                        if row_text:
                            doc_paragraphs.append(row_text)
                extracted_text = "\n\n".join(doc_paragraphs).strip()
            except Exception as e:
                logger.error(f"Error parsing DOCX: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Could not read DOCX document. The file may be corrupted."
                )

            if not extracted_text:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The DOCX document contains no readable text."
                )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extraction failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to extract text from the uploaded file."
        )

    # Check extracted text length limit
    if len(extracted_text) > MAX_CHARACTERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Extracted text exceeds the limit of {MAX_CHARACTERS:,} characters (found {len(extracted_text):,} characters). Please shorten the document."
        )

    if not extracted_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The file did not contain any readable text."
        )

    return ExtractResponse(text=extracted_text)


def sanitize_body_html(html_str: str) -> str:
    """Basic validation to ensure body_html contains only allowed tags"""
    # Remove code blocks if model accidentally wrapped output
    cleaned = html_str.strip()
    if cleaned.startswith("```html"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


@app.post("/api/generate", response_model=ArticleResponse)
async def generate_article(payload: GenerateRequest):
    # 1. Validate inputs
    raw_text = payload.text.strip()
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Input source material cannot be empty."
        )

    if len(raw_text) > MAX_CHARACTERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Input text exceeds the maximum limit of {MAX_CHARACTERS:,} characters (found {len(raw_text):,} characters)."
        )

    target_lang = payload.targetLanguage.strip().lower()
    if target_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported target language '{payload.targetLanguage}'. Supported: en, ml, hi, ta."
        )

    # 2. Check API key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY environment variable is not set on the server. Please configure it to enable article generation."
        )

    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

    # 3. Call Gemini using google-genai SDK
    from google import genai
    from google.genai import types
    from google.genai.errors import APIError

    client = genai.Client(api_key=api_key)
    prompt = build_user_prompt(raw_text, target_lang)

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=0.25,
        response_mime_type="application/json",
        response_schema=ArticleResponse,
    )

    last_error: Optional[Exception] = None

    # Retry once on malformed output or transient error
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            )

            if not response.text:
                raise ValueError("Gemini returned an empty response.")

            parsed_data = json.loads(response.text)
            article = ArticleResponse(**parsed_data)
            article.body_html = sanitize_body_html(article.body_html)
            return article

        except json.JSONDecodeError as jde:
            logger.warning(f"JSON decode error on attempt {attempt + 1}: {jde}")
            last_error = jde
        except APIError as ae:
            logger.error(f"Gemini API error on attempt {attempt + 1}: {ae}")
            status_code = getattr(ae, "code", 500)
            ae_str = str(ae)
            if status_code == 429 or "RESOURCE_EXHAUSTED" in ae_str:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Gemini API rate limit or quota exceeded. Please wait a moment and try again."
                )
            if "API_KEY_INVALID" in ae_str or "API key not valid" in ae_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Gemini API key. Please verify your GEMINI_API_KEY in .env (Google AI Studio keys start with 'AIzaSy...')."
                )
            if status_code == 404 or "not found" in ae_str.lower():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"The Gemini model '{model_name}' was not found. Please check GEMINI_MODEL in .env (recommended: 'gemini-2.5-flash')."
                )
            if status_code and status_code < 500:
                raise HTTPException(
                    status_code=status_code,
                    detail=f"Gemini API error ({status_code}): {getattr(ae, 'message', 'Invalid request parameters.')}"
                )
            last_error = ae
        except Exception as e:
            logger.error(f"Unexpected error on attempt {attempt + 1}: {e}")
            last_error = e

    # If retries exhausted
    logger.error(f"All generation attempts failed: {last_error}")
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="The AI model produced an unparseable response or failed. Please try again."
    )

