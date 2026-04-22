export interface WPSettings {
  url: string;
  username: string;
  appPassword: string;
  promptTemplate: string;
}

export interface ArticleInfo {
  focusKeyphrase: string;
  title: string;
  topic: string;
  imageId: string;
  publishDate: string;
}

export interface ArticleSEO {
  metaTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
  slug: string;
  outline: string;
  excerpt: string;
  category: string;
  tags: string[];
}

export interface GenerationState {
  stage: 'idle' | 'outline' | 'content_part1' | 'content_part2' | 'publishing' | 'completed';
  progress: number;
  error?: string;
}
