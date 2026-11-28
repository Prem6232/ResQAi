/**
 * ============================================================================
 * ML MODEL INTEGRATION BRIDGE (Live FastAPI + Offline Graceful Fallback)
 * ============================================================================
 * Connects Mobile UI previews directly to live backend ML endpoints:
 * 1. POST /api/v1/citizen/triage-preview (MuRIL ONNX Hinglish/Hindi/English)
 * 2. POST /api/v1/media/upload-url -> MinIO PUT -> FastAPI/Celery Whisper & FCOS
 * 3. Server-side Multilingual-E5 + PostGIS duplicate matching
 * ============================================================================
 */

import {
  MLTextClassificationOutput,
  MLVoiceTranscriptionOutput,
  MLVisionDetectionOutput,
  MLDuplicateDetectionOutput,
  IncidentCategory,
} from "../types";
import { mobileApi } from "./api";

function offlineKeywordTriageFallback(text: string): MLTextClassificationOutput {
  const lower = text.toLowerCase();

  if (lower.includes("fire") || lower.includes("smoke") || lower.includes("aag") || lower.includes("dhuwa")) {
    return {
      suggestedCategory: "fire_smoke",
      suggestedUrgency: "critical",
      modelConfidence: 0.75,
      explanation: "Offline keyword fallback matched fire/smoke terms; live MuRIL triage runs on submission.",
    };
  }

  if (lower.includes("accident") || lower.includes("bike") || lower.includes("car") || lower.includes("collision") || lower.includes("takkar")) {
    return {
      suggestedCategory: "road_accident",
      suggestedUrgency: "high",
      modelConfidence: 0.72,
      explanation: "Offline keyword fallback matched traffic crash terms; live MuRIL triage runs on submission.",
    };
  }

  if (lower.includes("blood") || lower.includes("unconscious") || lower.includes("heart") || lower.includes("chot") || lower.includes("behosh")) {
    return {
      suggestedCategory: "medical",
      suggestedUrgency: "critical",
      modelConfidence: 0.76,
      explanation: "Offline keyword fallback matched medical trauma terms; live MuRIL triage runs on submission.",
    };
  }

  if (lower.includes("water") || lower.includes("flood") || lower.includes("paani") || lower.includes("jalbharav")) {
    return {
      suggestedCategory: "water_flood",
      suggestedUrgency: "medium",
      modelConfidence: 0.70,
      explanation: "Offline keyword fallback matched water/flood terms; live MuRIL triage runs on submission.",
    };
  }

  return {
    suggestedCategory: "hazard",
    suggestedUrgency: "medium",
    modelConfidence: 0.55,
    explanation: "Offline fallback estimate; live MuRIL emergency triage runs once connected.",
  };
}

/**
 * 1. TEXT CLASSIFIER MODEL (Live MuRIL ONNX via FastAPI /citizen/triage-preview)
 */
export async function runTextClassifier(
  text: string
): Promise<MLTextClassificationOutput> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      suggestedCategory: "other",
      suggestedUrgency: "medium",
      modelConfidence: 0.0,
      explanation: "Enter incident details to run live AI triage.",
    };
  }

  if (mobileApi.getAccessToken()) {
    try {
      const liveRes = await mobileApi.previewTextTriage(trimmed);
      return {
        suggestedCategory: liveRes.suggestedCategory,
        suggestedUrgency: liveRes.suggestedUrgency,
        modelConfidence: liveRes.modelScore,
        explanation: liveRes.explanation,
      };
    } catch {
      // Graceful offline/transient network fallback
    }
  }

  return offlineKeywordTriageFallback(trimmed);
}

/**
 * 2. VOICE UPLOAD & TRANSCRIPTION (MinIO + Faster-Whisper server pipeline)
 */
export async function runVoiceTranscription(
  audioUri: string,
  mimeType: string = "audio/m4a"
): Promise<MLVoiceTranscriptionOutput & { mediaAssetId?: string }> {
  const uri = audioUri.trim();
  if (!uri || uri === "dummy.wav") {
    throw new Error("A recorded audio file URI is required before uploading for Faster-Whisper transcription.");
  }

  const assetId = await mobileApi.uploadMediaAsset({
    uri,
    name: `voice_memo_${Date.now()}.m4a`,
    mimeType,
  });

  return {
    mediaAssetId: assetId,
    transcript: "",
    detectedLanguage: "auto (server faster-whisper)",
    confidence: 1.0,
  };
}

/**
 * 3. NARROW VISION CLASSIFIER (MinIO + Server FCOS-ResNet50-FPN)
 */
export async function runFireSmokeVisionClassifier(
  imageUri: string,
  mimeType: string = "image/jpeg"
): Promise<MLVisionDetectionOutput & { mediaAssetId?: string }> {
  const uri = imageUri.trim();
  if (!uri) {
    throw new Error("An image file URI is required before uploading for vision verification.");
  }
  const assetId = await mobileApi.uploadMediaAsset({
    uri,
    name: `evidence_${Date.now()}.jpg`,
    mimeType,
  });
  return {
    mediaAssetId: assetId,
    fireSmokeDetected: false,
    confidence: 0,
    explanation: "Image uploaded to MinIO; server FCOS fire/smoke verification runs asynchronously on submission.",
    boundingBoxes: [],
  };
}

/**
 * 4. DUPLICATE INCIDENT DETECTOR (Executed server-side by E5-small + PostGIS)
 */
export async function runDuplicateDetector(_params: {
  category: IncidentCategory;
  text: string;
}): Promise<MLDuplicateDetectionOutput> {
  return {
    isDuplicateCandidate: false,
    similarityScore: 0.0,
  };
}
