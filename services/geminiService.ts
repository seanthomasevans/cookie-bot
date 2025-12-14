import { GoogleGenAI, Type } from "@google/genai";
import { DesignCategory } from "../types";

// Helper to get a fresh AI instance with the latest key
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const suggestDesigns = async (theme: string): Promise<Array<{title: string, visualPrompt: string, category: DesignCategory}>> => {
  try {
    const ai = getAI();
    // Upgraded to gemini-3-pro-preview for better reasoning on art history, styles, and eras.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are an expert art director and industrial designer.
      User Theme: "${theme}"

      1. ANALYZE the theme. Identify the specific historical era, art movement, or iconic style associated with it (e.g., Art Deco, 1950s Diner, Cyberpunk, Victorian, 1980s Arcade, Bauhaus).
      2. GENERATE 4 distinct design concepts for 3D printed cookie stamps.
      
      For each concept:
      - Title: Catchy name.
      - Category: 'portrait' (for characters/faces) or 'typography' (for text/logos).
      - Visual Prompt: A highly detailed image generation prompt.
        - TYPOGRAPHY: Must explicitly name the FONT STYLE matching the era (e.g., "Bold Art Deco Sans-Serif", "Psychedelic 60s Bubble", "Gothic Blackletter", "Digital Pixel Font").
        - ART STYLE: Describe the specific line art technique (e.g., "Woodcut", "Halftone Pop Art", "Clean Vector Monoline", "Nouveau Organic Lines").
        - Do not use generic terms. Be historically accurate to the theme.
      
      Output JSON only.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              visualPrompt: { type: Type.STRING, description: "Detailed image generation prompt for line art" },
              category: { type: Type.STRING, enum: ['portrait', 'typography'] }
            },
            required: ["title", "visualPrompt", "category"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (e) {
    console.error("Planning Error", e);
    throw e;
  }
};

const getAspectRatio = (width: number, height: number): "1:1" | "3:4" | "4:3" | "16:9" | "9:16" => {
  const ratio = width / height;
  if (ratio >= 1.5) return "16:9";
  if (ratio <= 0.6) return "9:16";
  if (ratio > 1.1) return "4:3";
  if (ratio < 0.9) return "3:4";
  return "1:1";
}

export const generateStencilImage = async (prompt: string, category: DesignCategory, width: number = 60, height: number = 60, referenceImage?: string): Promise<string> => {
  try {
    const ai = getAI();
    const aspectRatio = getAspectRatio(width, height);
    
    let systemPrompt = "";
    
    // If a reference image is provided, we change the strategy to use it as the source of truth
    const hasReference = !!referenceImage;

    if (category === 'portrait') {
      systemPrompt = `
        Create a BOLD, HIGH-CONTRAST VECTOR ILLUSTRATION for a 3D printed cookie stamp.
        ${hasReference ? "Subject: Reference the attached image closely for likeness." : "Subject: " + prompt}
        
        CRITICAL RULES FOR PRINTABILITY:
        1. STYLE: Think "Pop Art" or "High-Quality Vector Logo". 
        2. EYES & FACE: This is the most important part.
           - define the eyes clearly (lids, iris, pupil). 
           - Do NOT reduce eyes to simple dots or empty circles.
           - Use negative space (white breaks) to define the nose bridge and highlights.
        3. LINE WEIGHT: Lines must be thick enough to print (bold marker weight), but vary the width to capture detail.
        4. TEXTURE: Hair should be grouped into solid shapes with clear flow, not individual strands.
        5. CONTRAST: Pure Black and White only. No gray.
        6. PRESERVE NEGATIVE SPACE: Ensure there are clear gaps between separate features so they don't merge into a blob.
      `;
    } else {
      // Typography / Logo
      // Relaxed generic constraints to allow the "prompt" (which now contains specific era/style info) to take precedence.
      systemPrompt = `
        Create a 3D PRINTABLE STENCIL DESIGN based on this prompt: ${prompt}.
        ${hasReference ? "Trace the shapes from the attached reference image exactly." : ""}
        
        DESIGN RULES:
        1. TYPOGRAPHY & STYLE: STRICTLY match the era, font style, and artistic direction described in the prompt.
        2. PRINTABILITY: All lines must be THICK and solid (marker weight).
           - Letters must be solid or thick outlines.
           - If using stencil fonts, ensure bridges are thick.
        3. COMPOSITION: Enclosed in a cohesive shape or border if necessary to keep parts together.
        4. AESTHETIC: "Vector Art" or "Screen Print" style. Sharp, clean edges.
        5. COLOR: Pure Black on White.
      `;
    }

    const parts: any[] = [{ text: systemPrompt }];

    if (referenceImage) {
        // Extract base64 data, removing the header if present
        const base64Data = referenceImage.includes(',') ? referenceImage.split(',')[1] : referenceImage;
        parts.push({
            inlineData: {
                mimeType: "image/png",
                data: base64Data
            }
        });
    }

    // Using gemini-3-pro-image-preview for highest fidelity and instruction following
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview', 
      contents: {
        parts: parts
      },
      config: {
        imageConfig: { 
            aspectRatio: aspectRatio,
            imageSize: "1K" 
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Gemini Image Gen Error:", error);
    throw error;
  }
};

export const editStencilImage = async (currentImage: string, instruction: string): Promise<string> => {
  try {
    const ai = getAI();
    
    // Extract base64
    const base64Data = currentImage.includes(',') ? currentImage.split(',')[1] : currentImage;

    const systemPrompt = `
      You are an expert image editor for 3D printing assets.
      
      Task: Edit the attached line art image based on this instruction: "${instruction}"
      
      STRICT CONSTRAINTS:
      1. STYLE: Maintain the exact same BOLD BLACK AND WHITE VECTOR style.
      2. CONSISTENCY: Do not change parts of the image that were not mentioned.
      3. OUTPUT: Must remain a high-contrast 2-color (Black/White) image suitable for a cookie stamp. No greyscale.
      4. CLARITY: Ensure any new details are thick enough to be 3D printed.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
             inlineData: {
                 mimeType: "image/png",
                 data: base64Data
             }
          },
          { text: systemPrompt }
        ]
      },
      config: {
         imageConfig: {
             imageSize: "1K"
         }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data in edit response");
  } catch (e) {
    console.error("Gemini Edit Error", e);
    throw e;
  }
};
