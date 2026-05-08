import { voices as kokoroVoices } from "./kokoro.ts"
import { voices as supertonicVoices } from "./supertonic.ts"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Sample text - edit this to change what's rendered
const sampleText = `In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole,
filled with the ends of worms and an oozy smell, nor yet a dry, bare,
sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole,
and that means comfort.`

// Determine TTS engine based on voice
function isSupertonicVoice(voice: string): boolean {
	return supertonicVoices.includes(voice as any)
}

// Dynamic TTS loader - only loads the required module when needed
async function loadTTS(voice: string) {
	if (isSupertonicVoice(voice)) {
		const { generateSpeech } = await import("./supertonic.ts")
		return generateSpeech
	} else {
		const { generateSpeech } = await import("./kokoro.ts")
		return generateSpeech
	}
}

async function main() {
	const allVoices = [...kokoroVoices, ...supertonicVoices]
	const outputDir = path.join(__dirname, "samples")

	// Create samples directory (Bun.write auto-creates parent dirs)
	await Bun.write(path.join(outputDir, ".gitkeep"), "")

	console.log(`Rendering ${allVoices.length} voice samples...`)
	console.log(`Text: "${sampleText.substring(0, 60)}..."`)
	console.log(``)

	for (const voice of allVoices) {
		console.log(`[ ] Rendering ${voice}...`)

		try {
			const generateSpeech = await loadTTS(voice)
			const audio = await generateSpeech({ text: sampleText, voice })

			const outputPath = path.join(outputDir, `${voice}.wav`)
			await audio.save(outputPath)

			console.log(`[x] Saved: ${outputPath}`)
		} catch (error) {
			console.error(`[!] Failed to render ${voice}:`, error)
		}
	}

	console.log(``)
	console.log(
		`Done! Rendered ${allVoices.length} voice samples to ${outputDir}/`,
	)
}

main().catch(console.error)
