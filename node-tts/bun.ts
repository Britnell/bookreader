// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { parseArgs } from "util"
import { generateSpeech, type Voice } from "./kokoro.ts"

const TARGET_MIN_TOKENS = 175
const TARGET_MAX_TOKENS = 250
const ABSOLUTE_MAX_TOKENS = 450

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
	console.log({ text })
	// const audio = await generateSpeech({ text: chapterText, voice, speed })
	// await audio.save(outputFile)
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
