// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { join } from "path"
import { mkdir } from "fs/promises"
import { parseArgs } from "util"
import { generateSpeech, type Voice } from "./kokoro.ts"

const TARGET_MIN_TOKENS = 175
const TARGET_MAX_TOKENS = 250
const ABSOLUTE_MAX_TOKENS = 450

// Simple token estimator (roughly 1 token per 4 characters for English)
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

const { values } = parseArgs({
	args: Bun.argv,
	options: {
		file: { type: "string", short: "f", default: "book.epub" },
		chapter: { type: "string", short: "c", default: "1" },
		voice: { type: "string", short: "v", default: "bf_emma" },
		speed: { type: "string", short: "s", default: "1" },
	},
	strict: true,
	allowPositionals: true,
})

const file = values.file
const ch = parseInt(values.chapter, 10)
const voice = values.voice as Voice
const speed = parseFloat(values.speed)

main()

async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp")
	const id = epub.flow[ch].id
	const html = await new Promise<string>((resolve, reject) => {
		epub.getChapter(id, function (error, html) {
			if (error) {
				reject(error)
			} else {
				resolve(html)
			}
		})
	})

	const text = parse(html).textContent

	console.log(
		`Generating audio for chapter ${ch} (voice: ${voice}, speed: ${speed})...`,
	)
	console.log(text)

	// Generate speech using local Kokoro
	const audio = await generateSpeech({ text, voice, speed })

	// Create folder using book title
	const bookTitle = epub.metadata.title || "unknown_book"
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const outputDir = join("./", sanitizedTitle)

	await mkdir(outputDir, { recursive: true })

	// Save the chapter text to a text file
	const textFile = join(outputDir, `chapter_${ch}.txt`)
	await Bun.write(textFile, text)
	console.log(`Text saved to ${textFile}`)

	// Save the audio to an MP3 file
	const outputFile = join(outputDir, `chapter_${ch}.mp3`)
	await audio.save(outputFile)

	console.log(`Audio saved to ${outputFile}`)
}
