import { GoogleGenAI, Type } from "@google/genai";
import type { PredictionResult } from "../types";
import { PRODUCE } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function identifyProduce(base64Image: string, mimeType: string): Promise<string> {
    const model = "gemini-2.5-flash";
    const allProduceNames = PRODUCE.map(p => p.label.split('(')[0].trim()).join(', ');
    const prompt = `Analyze the image to identify the primary fruit or vegetable. Your answer MUST be one of the following options: [${allProduceNames}]. If the image does not contain any recognizable fruit or vegetable from the list, respond with the single word "None". Otherwise, respond with only the name of the produce, for example: "Apple".`;

    const imagePart = {
        inlineData: {
            mimeType: mimeType,
            data: base64Image,
        },
    };

    const textPart = { text: prompt };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [imagePart, textPart] },
        });

        const detectedProduceName = response.text.trim();

        if (detectedProduceName.toLowerCase() === 'none') {
            return 'None';
        }
        
        // Find the corresponding produce item to return its value
        const foundProduce = PRODUCE.find(p => p.label.toLowerCase().includes(detectedProduceName.toLowerCase()));
        
        return foundProduce ? foundProduce.value : '';

    } catch (error) {
        console.error("Error calling Gemini API for identification:", error);
        throw new Error("Failed to identify produce from Gemini API.");
    }
}


export async function getRipenessPrediction(base64Image: string, mimeType: string, fruitName: string): Promise<PredictionResult> {
  const model = "gemini-2.5-flash";
  const prompt = `You are an expert botanist and plant pathologist renowned for accurate identification and diagnosis. Your task is to analyze the provided image of a ${fruitName}. Your analysis MUST be specific to the visual characteristics, ripening stages, and common ailments of a ${fruitName}. Do not provide generic analysis. Scrutinize the image for all relevant details: color (hue, uniformity, blemishes), texture (smoothness, wrinkles, bruising), and shape (plumpness, deformities). Pay extremely close attention to any signs of infection, such as mold, fungal spots, or rot. If an infection is detected, you MUST classify the status as 'Damaged' and provide a detailed analysis in the 'infection_details' object. This includes identifying the common name of the infection (e.g., "anthracnose"), its type (e.g., "Fungal"), and diagnosing the likely root cause (e.g., "Caused by excessive moisture and poor air circulation during growth"). If no infection is found, ensure the 'infection_details' object contains empty strings for all values. In addition to ripeness and infection, meticulously inspect the physical integrity of the ${fruitName}. Determine if any part of the produce is physically missing, such as a bite taken out, a slice cut off, or significant gouging. If a part is missing, set 'isPartlyMissing' to true and briefly describe what you see in 'missingPartDescription'. If the produce is whole, set 'isPartlyMissing' to false and leave 'missingPartDescription' as an empty string. Based on this meticulous, ${fruitName}-specific analysis, provide your diagnosis in the required JSON format.`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64Image,
    },
  };

  const textPart = {
    text: prompt,
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            days: {
              type: Type.NUMBER,
              description: "Estimated days until peak ripeness. Negative for overripe.",
            },
            status: {
              type: Type.STRING,
              description: "Current ripeness status: Unripe, Nearing Ripeness, Ripe, Overripe, or Damaged.",
            },
            recommendation: {
              type: Type.STRING,
              description: "A short, helpful tip for the user.",
            },
            infection_details: {
              type: Type.OBJECT,
              description: "Details of any detected infection.",
              properties: {
                type: {
                  type: Type.STRING,
                  description: "The type of infection (e.g., Fungal, Bacterial), or empty string if none.",
                },
                name: {
                  type: Type.STRING,
                  description: "The common name of the infection, or empty string if none.",
                },
                cause: {
                  type: Type.STRING,
                  description: "The likely root cause of the infection, or empty string if none.",
                },
              },
              required: ["type", "name", "cause"],
            },
            isPartlyMissing: {
              type: Type.BOOLEAN,
              description: "True if a part of the produce is physically missing, otherwise false.",
            },
            missingPartDescription: {
              type: Type.STRING,
              description: "A brief description of the missing part, or an empty string if not applicable.",
            },
          },
          required: ["days", "status", "recommendation", "infection_details", "isPartlyMissing", "missingPartDescription"],
        },
      },
    });

    const jsonString = response.text.trim();
    const result: PredictionResult = JSON.parse(jsonString);

    // Basic validation
    if (typeof result.days !== 'number' || typeof result.status !== 'string' || typeof result.recommendation !== 'string' || typeof result.infection_details !== 'object' || typeof result.isPartlyMissing !== 'boolean' || typeof result.missingPartDescription !== 'string') {
        throw new Error("Invalid JSON structure from API.");
    }

    return result;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get prediction from Gemini API.");
  }
}