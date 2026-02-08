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
	})

	if (!response.ok) {
		throw new Error(
			`TTS request failed: ${response.status} ${response.statusText}`,
		)
	}

	const blob = await response.blob()
	const audio = new Audio()
	audio.src = URL.createObjectURL(blob)

	return audio
}

export async function getVoices(): Promise<string[]> {
	const response = await fetch("http://localhost:8880/v1/audio/voices")

	if (!response.ok) {
		throw new Error(
			`Voices request failed: ${response.status} ${response.statusText}`,
		)
	}

	const data = await response.json()
	return data.voices || []
}
