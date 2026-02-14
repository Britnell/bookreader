// import * as EPub from "epub2/node";
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { parseArgs } from "util"
import { generateSpeech, type Voice } from "./kokoro.ts"
import { chunkify } from "./textchunking.ts"

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
	const chapter = epub.flow[ch]
	const chapterTitle = chapter.id.split(".")[0]

	// get text
	const html = await getChapter(epub, chapter.id)
	const text = parse(html).textContent
	// console.log(chapter, chapter.id, { chapterTitle })

	// save .txt
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const outputDir = `./${sanitizedTitle}`

	// Ensure directory exists
	await Bun.file(outputDir).ensureDir?.()

	const textFile = `${outputDir}/${chapterTitle}.txt`
	await Bun.write(textFile, text)

	// make audio chunks
	const chunks = chunkify(text)

	// Generate audio for each chunk synchronously
	for (let i = 0; i < chunks.length; i++) {
		const text = chunks[i]
		console.log(`Generating chunk ${i + 1} , ${text.length}`)
		const audio = await generateSpeech({ text, voice, speed })
		await audio.save(`${outputDir}/${chapterTitle}_${i}.wav`)
	}

	// Join chunks with ffmpeg
	console.log("join chapter chunks...")
	await joinAudioChunks(outputDir, chapterTitle, chunks.length)
}

async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp")

	const author = epub.metadata.creator || "author"

	// Chapter
	await readChapter(epub, ch)

	//---

	// Save the chapter text to a text file (Bun auto-creates directories)
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

async function joinAudioChunks(
	outputDir: string,
	chapterTitle: string,
	numChunks: number,
) {
	console.log(`Joining ${numChunks} audio chunks...`)

	const outputFile = `${outputDir}/${chapterTitle}.wav`
	const fileListPath = `${outputDir}/chunklist.txt`

	// Create file list for concat demuxer
	const fileListContent = Array.from(
		{ length: numChunks },
		(_, i) => `file '${chapterTitle}_${i}.wav'`,
	).join("\n")

	await Bun.write(fileListPath, fileListContent)

	// Use concat demuxer with -c copy for instant, lossless joining
	const proc = Bun.spawn(
		[
			"ffmpeg",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			fileListPath,
			"-c",
			"copy",
			outputFile,
		],
		{
			cwd: process.cwd(),
			stdout: "inherit",
			stderr: "inherit",
		},
	)

	await proc.exited

	if (proc.exitCode === 0) {
		console.log(`✓ Created ${outputFile}`)

		// Clean up temp file list
		await Bun.file(fileListPath).delete?.()

		// Delete chunk files
		for (let i = 0; i < numChunks; i++) {
			const chunkFile = `${outputDir}/${chapterTitle}_${i}.wav`
			await Bun.file(chunkFile).delete?.()
		}
		console.log(`✓ Cleaned up ${numChunks} chunk files`)
	} else {
		console.error(`✗ ffmpeg failed with exit code ${proc.exitCode}`)
	}
}
