export interface CutterSettings {
  width: number;
  height: number;
  baseThickness: number;
  detailHeight: number;
  invert: boolean;
  threshold: number;
  smoothing: number;
  shape: 'rectangle' | 'circle' | 'outline';
  frameThickness: number;
  frameHeight: number;
}

export type DesignCategory = 'portrait' | 'typography';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface DesignAsset {
  id: string;
  title: string;
  visualPrompt: string;
  category: DesignCategory;
  imageUrl: string | null;
  referenceImage?: string; // Base64 string of the optional reference image
  status: 'idle' | 'generating' | 'done' | 'error';
  errorMessage?: string;
  chatHistory: ChatMessage[];
}