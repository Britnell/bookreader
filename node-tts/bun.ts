// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { parseArgs } from "util"
import { generateSpeech, type Voice } from "./kokoro.ts"
import { chunkify } from "./textchunking.ts"
import { joinAudioChunks } from "./audio.ts"

const { values } = parseArgs({
	args: Bun.argv,
	options: {
		file: { type: "string", short: "f", default: "book.epub" },
		// chapter: { type: "string", short: "c", default: "1" },
		voice: { type: "string", short: "v", default: "bf_emma" },
		speed: { type: "string", short: "s", default: "1" },
	},
	strict: true,
	allowPositionals: true,
})

const file = values.file
// const ch = parseInt(values.chapter, 10)
const voice = values.voice as Voice
const speed = parseFloat(values.speed)

main()

async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp")

	const author = epub.metadata.creator || "author"

	// Process all chapters
	for (let i = 0; i < epub.flow.length; i++) {
		const chapter = epub.flow[i]
		const chapterTitle = chapter.id.split(".")[0]

		// Check if chapter already exists
		if (await chapterExists(epub, chapter)) {
			continue
		}

		console.log(`chapter ${i + 1}/${epub.flow.length} : ${chapterTitle}`)
		await readChapter(epub, chapter)
	}
	console.log("done")
}

function getBookAndChapterTitles(epub, chapter) {
	const bookTitle = epub.metadata.title || "untitled"
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const chapterTitle = chapter.id.split(".")[0]

	return { sanitizedTitle, chapterTitle }
}

async function chapterExists(epub, chapter): Promise<boolean> {
	const { sanitizedTitle, chapterTitle } = getBookAndChapterTitles(
		epub,
		chapter,
	)
	const outputDir = `./${sanitizedTitle}`
	const audioFile = `${outputDir}/${chapterTitle}.wav`

	return await Bun.file(audioFile).exists()
}

async function readChapter(epub, chapter) {
	const { sanitizedTitle, chapterTitle } = getBookAndChapterTitles(
		epub,
		chapter,
	)

	// get text
	const html = await getChapter(epub, chapter.id)
	const text = parse(html).textContent

	// Skip empty chapters
	if (!text.trim()) {
		console.log(`Skipping empty chapter: ${chapterTitle}`)
		return
	}

	// save .txt
	const outputDir = `./${sanitizedTitle}`

	// Ensure directory exists
	await Bun.file(outputDir).ensureDir?.()

	const textFile = `${outputDir}/${chapterTitle}.txt`
	await Bun.write(textFile, text)

	// make audio chunks
	const chunks = chunkify(text)

	// Skip if no chunks (shouldn't happen after empty text check, but just in case)
	if (chunks.length === 0) {
		console.log(`No chunks generated for chapter: ${chapterTitle}`)
		return
	}

	// Generate audio for each chunk synchronously
	for (let i = 0; i < chunks.length; i++) {
		const chunkPath = `${outputDir}/${chapterTitle}_${i}.wav`

		// Check if chunk already exists
		if (await Bun.file(chunkPath).exists()) {
			console.log(`Chunk ${i + 1} already exists, skipping generation`)
			continue
		}

		const text = chunks[i]
		console.log(`Generating chunk ${i + 1} , ${text.length}`)
		const audio = await generateSpeech({ text, voice, speed })
		await audio.save(chunkPath)
	}

	// Join chunks with ffmpeg
	console.log("join chapter chunks + cleanup")
	await joinAudioChunks(outputDir, chapterTitle, chunks.length)
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
