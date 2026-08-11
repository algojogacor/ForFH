export interface PasalSearchResultItem {
  frbr_uri: string;
  title: string;
  type: string;
  number?: string;
  year?: string;
  status?: string; // berlaku | dicabut | diubah
  status_uncertain?: boolean;
  content_verified?: boolean;
  snippet?: string;
  matched_articles?: Array<{
    article_number: string;
    snippet: string;
  }>;
}

export interface PasalSearchResponse {
  total: number;
  results: PasalSearchResultItem[];
}

export interface PasalLawArticle {
  number: string;
  title?: string;
  topic?: string;
  content: string;
  explanation?: string;
  paragraphs?: Array<{
    number?: string;
    content: string;
  }>;
}

export interface PasalLawDetail {
  frbr_uri: string;
  title: string;
  type: string;
  number?: string;
  year?: string;
  status: string; // berlaku | dicabut | diubah
  status_uncertain?: boolean;
  content_verified?: boolean;
  promulgated_date?: string;
  effective_date?: string;
  preamble?: string;
  content?: string;
  articles: PasalLawArticle[];
  relationships?: {
    amends?: Array<{ frbr_uri: string; title: string }>;
    amended_by?: Array<{ frbr_uri: string; title: string }>;
    repeals?: Array<{ frbr_uri: string; title: string }>;
    repealed_by?: Array<{ frbr_uri: string; title: string }>;
  };
}
