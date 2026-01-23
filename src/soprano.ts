import { Client } from "@gradio/client";

// TTS Provider - can be switched between implementations
export async function generateSpeech(
  text: string,
): Promise<HTMLAudioElement> {
  const client = await Client.connect("http://127.0.0.1:7860/");
  
  const result = await client.predict("/generate_speech", {
    text: text,
    temperature: 0,
    top_p: 0.95,
    repetition_penalty: 1.2,
    chunk_size: 1,
    streaming: true,
  });

  if (!result.data) {
    throw new Error("TTS request failed: No audio data returned");
  }

  // The result.data contains the audio stream/file
  const audio = new Audio();
  audio.src = Array.isArray(result.data) ? result.data[0] : result.data;

  return audio;
}

export async function getVoices(): Promise<string[]> {
  // Soprano API - return supported voices
  return ["soprano"];
}
