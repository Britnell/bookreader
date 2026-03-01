import { KokoroTTS } from "kokoro-js"

export type Voice = (typeof voices)[number]
export type DataType = "fp32" | "fp16" | "q8" | "q4" | "q4f16"
export type Device = "cpu" | "wasm" | "webgpu"
const dtype = "fp32" // fp16 has NaN issues https://github.com/hexgrad/kokoro/issues/74
const device = "cpu"

export interface GenerateSpeechOptions {
	text: string
	voice?: Voice
	speed?: number
}

/**
 * Generate speech from text using Kokoro TTS
 * @param options - Generation options
 * @returns Audio object with save() method
 */
const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX"
let _tts: KokoroTTS | null = null

async function getTTS(): Promise<KokoroTTS> {
	if (!_tts) {
		_tts = await KokoroTTS.from_pretrained(model_id, { dtype, device })
	}
	return _tts
}

export async function generateSpeech({
	text,
	voice = "af_heart",
	speed = 1,
}: GenerateSpeechOptions) {
	const tts = await getTTS()

	const audio = await tts.generate(text, {
		voice,
		speed,
	})

	if (audio.data?.some((value: number) => Number.isNaN(value))) {
		console.log(" NaN", text)
	}

	return audio
}

export const voices = [
	"bf_emma",
	"bf_alice",
	"bf_isabella",
	"bf_lily",
	"bm_daniel",
	"bm_fable",
	"bm_george",
	"bm_lewis",
	"af_heart",
	"af_alloy",
	"af_aoede",
	"af_bella",
	"af_jessica",
	"af_kore",
	"af_nicole",
	"af_nova",
	"af_river",
	"af_sarah",
	"af_sky",
	"am_adam",
	"am_echo",
	"am_eric",
	"am_fenrir",
	"am_liam",
	"am_michael",
	"am_onyx",
	"am_puck",
	"am_santa",
] as const
