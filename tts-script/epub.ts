// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { writeFile, mkdir } from "fs/promises"
import { createWriteStream } from "fs"
import { pipeline } from "stream/promises"
import { join } from "path"

const TARGET_MIN_TOKENS = 175
const TARGET_MAX_TOKENS = 250
const ABSOLUTE_MAX_TOKENS = 450

function parseChapterText(html: string): string {
	const root = parse(html)
	return root.textContent
}

// Simple token estimator (roughly 1 token per 4 characters for English)
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

// Split text into sentences respecting common sentence boundaries
function splitIntoSentences(text: string): string[] {
	// Match sentence endings followed by whitespace or end of string
	// Handles periods, question marks, exclamation points, and ellipsis
	const sentenceRegex = /[^.!?\n]+[.!?\n]+(?:\s+|$)|[^.!?\n]+$/g
	const sentences = text.match(sentenceRegex) || []
	return sentences.filter((s) => s.length > 0)
}

const kokoroapi = ({ text, voice, speed }) =>
	fetch("http://localhost:8880/v1/audio/speech", {
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
			stream: true,
		}),
	})

// Chunk text into TTS-friendly segments based on Kokoro recommendations
function chunkTextForTTS(text: string): string[] {
	const sentences = splitIntoSentences(text)
	const chunks: string[] = []
	let currentChunk = ""
	let currentTokens = 0

	for (const sentence of sentences) {
		const sentenceTokens = estimateTokens(sentence)

		// If single sentence exceeds absolute max, split it further (fallback)
		if (sentenceTokens > ABSOLUTE_MAX_TOKENS) {
			if (currentChunk) {
				chunks.push(currentChunk.trim())
				currentChunk = ""
				currentTokens = 0
			}
			// Split long sentence by commas or other natural breaks
			const parts = sentence.split(/,\s+/)
			let partChunk = ""
			let partTokens = 0

			for (const part of parts) {
				const partToken = estimateTokens(part)
				if (partTokens + partToken > TARGET_MAX_TOKENS && partChunk) {
					chunks.push(partChunk.trim())
					partChunk = part
					partTokens = partToken
				} else {
					partChunk += (partChunk ? ", " : "") + part
					partTokens += partToken
				}
			}
			if (partChunk) {
				chunks.push(partChunk.trim())
			}
			continue
		}

		// Check if adding this sentence would exceed target max
		if (currentTokens + sentenceTokens > TARGET_MAX_TOKENS && currentChunk) {
			chunks.push(currentChunk.trim())
			currentChunk = sentence
			currentTokens = sentenceTokens
		} else if (
			currentTokens >= TARGET_MIN_TOKENS &&
			currentTokens + sentenceTokens > TARGET_MAX_TOKENS
		) {
			// We're in target range, start new chunk
			chunks.push(currentChunk.trim())
			currentChunk = sentence
			currentTokens = sentenceTokens
		} else {
			// Add to current chunk
			currentChunk += (currentChunk ? " " : "") + sentence
			currentTokens += sentenceTokens
		}
	}

	// Add remaining chunk
	if (currentChunk) {
		chunks.push(currentChunk.trim())
	}

	return chunks.join("\n\n")
}

function parseArgs() {
	const args: Record<string, string> = {}
	for (let i = 2; i < process.argv.length; i += 2) {
		args[process.argv[i]] = process.argv[i + 1] || ""
	}
	return args
}

const args = parseArgs()
if (!args["-f"] || !args["-ch"] || !args["-v"]) {
	console.error(`Missing required arguments
	  -f <file> -ch <chapter> [-v <voice>] [-sp <speed>]
	`)
	process.exit(1)
}

const file = args["-f"]
const ch = parseInt(args["-ch"], 10)
const voice = args["-v"]
const speed = args["-sp"] ? parseFloat(args["-sp"]) : 1

main()

async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp")
	const id = epub.flow[ch].id
	// epub.flow.forEach(function (chapter) {
	// 	console.log(chapter.id)
	// })
	// * Promisify the getChapter callback
	const html = await new Promise<string>((resolve, reject) => {
		epub.getChapter(id, function (error, html) {
			if (error) {
				reject(error)
			} else {
				resolve(html)
			}
		})
	})

	const text = parseChapterText(html)
	console.log(
		`Generating audio for chapter ${ch} (voice: ${voice}, speed: ${speed})...`,
	)

	const resp = await kokoroapi({ text, voice, speed })

	if (!resp.ok) {
		throw new Error(`API request failed: ${resp.status} ${resp.statusText}`)
	}

	// Create folder using book title
	const bookTitle = epub.metadata.title || "unknown_book"
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const outputDir = join("./", sanitizedTitle)

	await mkdir(outputDir, { recursive: true })

	// Save the chapter text to a text file
	const textFile = join(outputDir, `chapter_${ch}.txt`)
	await writeFile(textFile, text, "utf-8")
	console.log(`Text saved to ${textFile}`)

	// Save the audio stream to an MP3 file
	const outputFile = join(outputDir, `chapter_${ch}.mp3`)
	const fileStream = createWriteStream(outputFile)

	if (!resp.body) {
		throw new Error("Response body is null")
	}

	await pipeline(resp.body, fileStream)

	console.log(`Audio saved to ${outputFile}`)
}
