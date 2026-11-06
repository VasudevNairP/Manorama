export type TargetLanguage = 'en' | 'ml' | 'hi' | 'ta';

export interface GenerateResponse {
  headline: string;
  subheadline: string | null;
  body_html: string;
  source_notes: string[];
}

export interface ExtractResponse {
  text: string;
}

export interface LanguageOption {
  code: TargetLanguage;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English (AP Style)' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
];

