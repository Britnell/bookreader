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
	chunkify(text)
	// const audio = await generateSpeech({ text: chapterText, voice, speed })
	// await audio.save(outputFile)
}

const nextPunct = (text: string, start: number) => {
	const afterStart = text.slice(start)
	const majorIndex = afterStart.search(/[\.\?\!]/)
	const minorIndex = afterStart.search(/[,;:\-—]/)
	return [
		majorIndex >= 0 ? start + majorIndex : -1,
		minorIndex >= 0 ? start + minorIndex : -1,
	]
}

function chunkify(text: string) {
	let pos = 0
	console.log({ text })

	for (let x = 0; x < 10; x++) {
		const [mj, mn] = nextPunct(text, pos)
		console.log({ mj, mn })
		// if majoy is too long then use  minor
		// if major is too short, get next major after that
		// get that chunk of text
	}
	return
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
