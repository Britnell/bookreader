// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { parseArgs } from "util"
import { generateSpeech, voices, type Voice } from "./kokoro.ts"
import { chunkify } from "./textchunking.ts"
import { joinAudioChunks, embedMetadata, type AudioMetadata } from "./audio.ts"

const { values } = parseArgs({
	args: Bun.argv,
	options: {
		file: { type: "string", short: "f", default: "book.epub" },
		voice: { type: "string", short: "v", default: "bf_emma" },
		speed: { type: "string", short: "s", default: "1" },
		text: { type: "string", short: "t" },
		list: { type: "boolean", short: "l" },
		help: { type: "boolean", short: "h" },
	},
	strict: true,
	allowPositionals: true,
})

if (values.help) {
	console.log(`
USAGE
  bun bun.ts [options]

OPTIONS
  -f, --file <path>    ePub file to convert  (default: book.epub)
  -v, --voice <name>   Voice to use          (default: bf_emma)
  -s, --speed <num>    Speech speed          (default: 1)
  -t, --text <text>    Speak text and play it (test mode, no file needed)
  -l, --list           List all available voices
  -h, --help           Show this help

EXAMPLES
  bun bun.ts -f mybook.epub
  bun bun.ts -f mybook.epub -v am_michael -s 1.2
  bun bun.ts -t "Hello world" -v bf_alice
  bun bun.ts --list
`)
	process.exit(0)
}

if (values.list) {
	console.log(` Kokoro Voices: \n` + voices.join("\n"))
	process.exit(0)
}

const voice = (values.voice ?? "bf_emma") as Voice
const speed = parseFloat(values.speed ?? "1")

if (!voices.includes(voice)) {
	console.error(`Error: unknown voice "${voice}"\n`)
	console.log(` Kokoro Voices: \n` + voices.join("\n"))
	process.exit(1)
}

if (values.text) {
	const audio = await generateSpeech({ text: values.text, voice, speed })
	const tmpPath = "./tmp/_test.wav"
	await audio.save(tmpPath)
	const proc = Bun.spawn(["ffplay", "-nodisp", "-autoexit", tmpPath], { stdout: "ignore", stderr: "ignore" })
	await proc.exited
	process.exit(0)
}

const file = values.file ?? "book.epub"

main()

async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp")

	const author = epub.metadata.creator || "author"
	const bookTitle = epub.metadata.title || "untitled"

	// Extract cover image if available
	let coverImagePath: string | undefined
	if (epub.metadata.cover) {
		try {
			const { buffer, mimeType } = await getImage(epub, epub.metadata.cover)
			const ext = mimeType.split("/")[1] || "jpg"
			const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
			coverImagePath = `./tmp/cover_${sanitizedTitle}.${ext}`
			await Bun.write(coverImagePath, buffer)
			console.log(`Cover extracted: ${coverImagePath}`)
		} catch (e) {
			console.warn("Could not extract cover image:", e)
		}
	}

	// Process all chapters
	for (let i = 0; i < epub.flow.length; i++) {
		const chapter = epub.flow[i]

		// Check if chapter already exists
		if (await chapterExists(epub, chapter, i)) {
			console.log(
				` # chapter ${chapter.title || chapter.href} exists ${i} / ${epub.flow.length}`,
			)
			continue
		}

		await readChapter(epub, chapter, i, {
			author,
			bookTitle,
			coverImagePath,
			totalTracks: epub.flow.length,
		})
	}
	console.log("done")
}

function getBookAndChapterTitles(epub, chapter, index: number) {
	const bookTitle = epub.metadata.title || "untitled"
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const chapterTitle =
		chapter.title || chapter.href.split("/").pop().split(".")[0]
	const paddedIndex = String(index).padStart(2, "0")
	return { sanitizedTitle, chapterFileName: `${paddedIndex}_${chapterTitle}` }
}

async function chapterExists(epub, chapter, index: number): Promise<boolean> {
	const { sanitizedTitle, chapterFileName } = getBookAndChapterTitles(
		epub,
		chapter,
		index,
	)
	const outputDir = `./${sanitizedTitle}`

	return (
		(await Bun.file(`${outputDir}/${chapterFileName}.mp3`).exists()) ||
		(await Bun.file(`${outputDir}/${chapterFileName}.wav`).exists())
	)
}

async function readChapter(
	epub,
	chapter,
	index: number,
	bookMeta: {
		author: string
		bookTitle: string
		coverImagePath?: string
		totalTracks: number
	},
) {
	const { sanitizedTitle, chapterFileName } = getBookAndChapterTitles(
		epub,
		chapter,
		index,
	)

	// get text
	const html = await getChapter(epub, chapter.id)
	const text = parse(html).textContent

	// Skip empty chapters
	if (!text.trim()) {
		console.log(` # Skipping empty chapter: ${chapterFileName}`)
		return
	}

	// save .txt
	const outputDir = `./${sanitizedTitle}`

	// Ensure directory exists
	await Bun.file(outputDir).ensureDir?.()

	const textFile = `${outputDir}/${chapterFileName}.txt`
	await Bun.write(textFile, text)

	// make audio chunks
	const chunks = chunkify(text)

	// Skip if no chunks (shouldn't happen after empty text check, but just in case)
	if (chunks.length === 0) {
		console.log(`No chunks generated for chapter: ${chapterFileName}`)
		return
	}

	// Generate audio for each chunk synchronously
	for (let i = 0; i < chunks.length; i++) {
		const chunkPath = `${outputDir}/${chapterFileName}_${i}.wav`

		// Check if chunk already exists
		if (await Bun.file(chunkPath).exists()) {
			// console.log(`Chunk ${i + 1} already exists, skipping generation`)
			continue
		}

		const chunk = chunks[i]
		if (i % 10 === 0)
			console.log(`Generating chunk ${i + 1} of ${chunks.length}`)
		const audio = await generateSpeech({ text: chunk, voice, speed })
		await audio.save(chunkPath)
	}

	// Join chunks with ffmpeg
	console.log("  join chapter chunks + cleanup")
	await joinAudioChunks(outputDir, chapterFileName, chunks.length)

	// Embed metadata and convert to mp3
	console.log("  embedding metadata")
	const chapterTitle = chapter.title || chapterFileName
	const wavPath = `${outputDir}/${chapterFileName}.wav`
	const mp3Path = `${outputDir}/${chapterFileName}.mp3`
	await embedMetadata(wavPath, mp3Path, {
		title: chapterTitle,
		album: bookMeta.bookTitle,
		artist: bookMeta.author,
		trackNumber: index + 1,
		totalTracks: bookMeta.totalTracks,
		coverImagePath: bookMeta.coverImagePath,
	})
	console.log("  chapter done")
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

function getImage(epub, id): Promise<{ buffer: Buffer; mimeType: string }> {
	return new Promise((resolve, reject) => {
		epub.getImage(id, (error, buffer, mimeType) => {
			if (error) reject(error)
			else resolve({ buffer, mimeType })
		})
	})
}
