// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { parseArgs } from "util"
import { generateSpeech, type Voice } from "./kokoro.ts"

const MIN_TOKENS = 100 // never below
const OPTIMAL_TOKENS = 200 // optimal below
const UPPER_TOKENS = 300 // ok below
const MAX_TOKENS = 490 // never above

// Simple token estimator (roughly 1 token per 4 characters for English)

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

async function readChapter(epub, i: number) {
	const bookTitle = epub.metadata.title || "untitled"
	const chap = epub.flow[ch]
	const title = chap.id.split(".")[0]

	// get text
	const html = await getChapter(epub, chap.id)
	const text = parse(html).textContent
	// console.log(chap, chap.id, { title })

	// save .txt
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const textFile = `./${sanitizedTitle}/chapter_${ch}.txt`
	const outputFile = `./${sanitizedTitle}/chapter_${ch}.mp3`
	await Bun.write(textFile, text)

	//  make audio
	const chunks = chunkify(text)
	for (const [i, chunk] of chunks.entries()) {
		console.log(
			`[${i}] (${estimateTokens(chunk)} tokens) ${chunk.slice(0, 80)}...`,
		)
	}
	console.log(`Total chunks: ${chunks.length}`)
	// const audio = await generateSpeech({ text: chapterText, voice, speed })
	// await audio.save(outputFile)
}

/** Find the end of the current sentence and all minor break points within it. */
function findSentenceEnd(
	text: string,
	start: number,
): { end: number; minorBreaks: number[] } {
	const minorBreaks: number[] = []
	let i = start

	while (i < text.length) {
		const ch = text[i]

		// Major punctuation — end of sentence
		if (ch === "." || ch === "?" || ch === "!") {
			// Consume consecutive sentence-ending punctuation (e.g. "...", "?!", "!!!")
			while (
				i + 1 < text.length &&
				(text[i + 1] === "." || text[i + 1] === "?" || text[i + 1] === "!")
			) {
				i++
			}
			return { end: i + 1, minorBreaks }
		}

		// Minor punctuation — record as potential break point
		if (ch === "," || ch === ";" || ch === ":" || ch === "—" || ch === "-") {
			minorBreaks.push(i + 1) // index after the punctuation
		}

		i++
	}

	// No sentence-ending punctuation found — treat end of text as sentence end
	return { end: text.length, minorBreaks }
}

/** Find the best minor break point that keeps the first part under maxTokens. */
function splitAtMinorBreak(
	text: string,
	start: number,
	minorBreaks: number[],
	maxTokens: number,
): number {
	const maxChars = maxTokens * 4 // inverse of estimateTokens
	const limit = start + maxChars

	// Find the last minor break that stays within the limit
	let best = -1
	for (const bp of minorBreaks) {
		if (bp <= limit) best = bp
		else break
	}

	if (best > start) return best

	// No suitable minor break — fall back to word boundary near the char limit
	let fallback = Math.min(limit, text.length)
	while (fallback > start && text[fallback] !== " ") fallback--
	return fallback > start ? fallback : Math.min(limit, text.length)
}

/** Drain text that may exceed MAX_TOKENS by splitting at minor punctuation. */
function drainOversized(text: string, chunks: string[]): string {
	let remaining = text
	while (estimateTokens(remaining) > MAX_TOKENS) {
		const breaks: number[] = []
		for (let i = 0; i < remaining.length; i++) {
			const ch = remaining[i]
			if (ch === "," || ch === ";" || ch === ":" || ch === "—" || ch === "-") {
				breaks.push(i + 1)
			}
		}
		const splitPoint = splitAtMinorBreak(remaining, 0, breaks, MAX_TOKENS)
		chunks.push(remaining.slice(0, splitPoint).trim())
		remaining = remaining.slice(splitPoint).trim()
	}
	return remaining
}

/** Split text into chunks respecting token limits and sentence boundaries. */
function chunkify(text: string): string[] {
	const chunks: string[] = []
	let pos = 0
	let buffer = ""

	while (pos < text.length) {
		const { end } = findSentenceEnd(text, pos)
		const sentence = text.slice(pos, end).trim()
		pos = end

		if (sentence.length === 0) continue

		const candidate = buffer ? buffer + " " + sentence : sentence
		const tokens = estimateTokens(candidate)

		if (tokens < MIN_TOKENS) {
			buffer = candidate
			continue
		}

		if (tokens <= MAX_TOKENS) {
			chunks.push(candidate.trim())
			buffer = ""
			continue
		}

		// Too long — need to split
		if (buffer && estimateTokens(buffer) >= MIN_TOKENS) {
			// Buffer alone is viable — emit it, handle sentence separately
			chunks.push(buffer.trim())
			buffer = drainOversized(sentence, chunks)
			continue
		}

		// Buffer too short to emit alone — split the combined candidate
		buffer = drainOversized(candidate, chunks)
	}

	if (buffer.trim()) chunks.push(buffer.trim())

	return chunks
}
async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp")

	const author = epub.metadata.creator || "author"

	// Chapter
	await readChapter(epub, ch)

	//---

	// Save the chapter text to a text file (Bun auto-creates directories)
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

function getChapter(epub, id) {
	return new Promise<string>((resolve, reject) => {
		epub.getChapter(id, (error, html) => {
			if (error) {
				reject(error)
			} else {
				resolve(html)
			}
		})
	})
}
