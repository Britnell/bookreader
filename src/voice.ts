import way from "wayy";

export async function generateSpeech(
  text: string,
  voice: string = "alloy",
  speed: number = 1.0,
): Promise<HTMLAudioElement> {
  const response = await fetch("http://localhost:8880/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "kokoro",
      input: text,
      voice: voice,
      response_format: "mp3",
      speed: speed,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `TTS request failed: ${response.status} ${response.statusText}`,
    );
  }

  // Create MediaSource for streaming playback
  const mediaSource = new MediaSource();
  const audio = new Audio();
  audio.src = URL.createObjectURL(mediaSource);

  const reader = response.body!.getReader();
  let sourceBuffer: SourceBuffer;

  // Setup happens asynchronously, doesn't block returning
  mediaSource.addEventListener("sourceopen", () => {
    sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");

    const appendNextChunk = async () => {
      try {
        const { done, value } = await reader.read();

        if (done) {
          mediaSource.endOfStream();
          return;
        }

        sourceBuffer.appendBuffer(value);
      } catch (error) {
        mediaSource.endOfStream("network");
      }
    };

    sourceBuffer.addEventListener("update", async () => {
      await appendNextChunk();
    });

    // Start appending first chunk
    appendNextChunk();
  });

  return audio;
}

export async function getVoices(): Promise<string[]> {
  const response = await fetch("http://localhost:8880/v1/audio/voices");

  if (!response.ok) {
    throw new Error(
      `Voices request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.voices || [];
}

export async function createAudioNode(
  arrayBuffer: ArrayBuffer,
): Promise<AudioBufferSourceNode> {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    audioContext.decodeAudioData(
      arrayBuffer.slice(0),
      (audioBuffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        resolve(source);
      },
      (error) => {
        reject(new Error(`Audio decoding failed: ${error}`));
      },
    );
  });
}

export async function playAudioBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
  const source = await createAudioNode(arrayBuffer);
  return new Promise((resolve) => {
    source.onended = () => {
      resolve();
    };
    source.start(0);
  });
}
