import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { voices as kokoroVoices, type Voice as KokoroVoice } from "./kokoro.ts"
import { voices as supertonicVoices, type Voice as SupertonicVoice } from "./supertonic.ts"
import { chunkify } from "./textchunking.ts"
import { joinAudioChunks, embedMetadata, type AudioMetadata } from "./audio.ts"

const voices = [...kokoroVoices, ...supertonicVoices] as const
type Voice = (typeof voices)[number]

function isSupertonicVoice(voice: string): boolean {
	return supertonicVoices.includes(voice as SupertonicVoice)
}

async function loadTTS(voice: Voice) {
	if (isSupertonicVoice(voice)) {
		const { generateSpeech } = await import("./supertonic.ts")
		return generateSpeech
	} else {
		const { generateSpeech } = await import("./kokoro.ts")
		return generateSpeech
	}
}

export interface ReadBookOptions {
	file?: string
	voice?: Voice
	speed?: number
	chapter?: number
	text?: string
	log?: (message: string) => void
}

export async function readBook(options: ReadBookOptions = {}) {
	const {
		file,
		voice = "bf_emma" as Voice,
		speed = 1,
		chapter: startChapter = 0,
		text,
		log = console.log,
	} = options

	if (!voices.includes(voice)) {
		throw new Error(
			`Unknown voice "${voice}". Available voices:\n` +
			`Kokoro: ${kokoroVoices.join(", ")}\n` +
			`Supertonic: ${supertonicVoices.join(", ")}`,
		)
	}

	const generateSpeech = await loadTTS(voice)

	if (text) {
		const audio = await generateSpeech({ text, voice, speed })
		const tmpPath = "./tmp/_test.wav"
		await audio.save(tmpPath)
		const proc = Bun.spawn(["ffplay", "-nodisp", "-autoexit", tmpPath], {
			stdout: "ignore",
			stderr: "ignore",
		})
		await proc.exited
		return
	}

	if (!file) {
		throw new Error("Provide a file or text")
	}

	const epub = await EPub.createAsync(file, "./tmp", "./tmp")

	const author = epub.metadata.creator || "author"
	const bookTitle = epub.metadata.title || "untitled"

	let coverImagePath: string | undefined
	if (epub.metadata.cover) {
		try {
			const { buffer, mimeType } = await getImage(epub, epub.metadata.cover)
			const ext = mimeType.split("/")[1] || "jpg"
			const sanitizedTitle = bookTitle.replace(/[^a-z0-9\s]/gi, "").toLowerCase()
			coverImagePath = `./tmp/cover_${sanitizedTitle}.${ext}`
			await Bun.write(coverImagePath, buffer)
		} catch (e) {
			log("Could not extract cover image: " + e)
		}
	}

	for (let i = startChapter; i < epub.flow.length; i++) {
		const ch = epub.flow[i]

		if (await chapterExists(epub, ch, i)) {
			log(`[x] chapter exists ${ch.title || ch.href}`)
			continue
		}

		await readChapter(epub, ch, i, generateSpeech, voice, speed, {
			author,
			bookTitle,
			coverImagePath,
			totalTracks: epub.flow.length,
		}, log)
	}

	log("done")
}

function getBookAndChapterTitles(epub, chapter, index: number) {
	const bookTitle = epub.metadata.title || "untitled"
	const sanitizedTitle = bookTitle.replace(/[^a-z0-9\s]/gi, "").toLowerCase()
	const chapterTitle =
		chapter.title || chapter.href.split("/").pop().split(".")[0]
	const sanitizedChapterTitle = chapterTitle.replace(/[^a-z0-9\s]/gi, "")
	const paddedIndex = String(index).padStart(2, "0")
	return { sanitizedTitle, chapterFileName: `${paddedIndex}_${sanitizedChapterTitle}` }
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
	generateSpeech: (options: { text: string; voice: Voice; speed: number }) => Promise<{ save: (path: string) => void }>,
	voice: Voice,
	speed: number,
	bookMeta: {
		author: string
		bookTitle: string
		coverImagePath?: string
		totalTracks: number
	},
	log: (message: string) => void,
) {
	const { sanitizedTitle, chapterFileName } = getBookAndChapterTitles(
		epub,
		chapter,
		index,
	)

	const html = await getChapter(epub, chapter.id)
	const text = parse(html).textContent

	if (!text.trim()) {
		log(`[x] Skipping empty chapter: ${chapterFileName}`)
		return
	}

	const outputDir = `./${sanitizedTitle}`

	await Bun.file(outputDir).ensureDir?.()

	const textFile = `${outputDir}/${chapterFileName}.txt`
	await Bun.write(textFile, text)

	const chunks = chunkify(text)

	if (chunks.length === 0) {
		return
	}

	const chunksDir = `./tmp/${sanitizedTitle}`
	await Bun.write(`${chunksDir}/.keep`, "")

	log(`[ ] begin rendering chapter: ${chapterFileName}`)

	for (let i = 0; i < chunks.length; i++) {
		const chunkPath = `${chunksDir}/${chapterFileName}_${i}.wav`

		if (await Bun.file(chunkPath).exists()) {
			continue
		}

		const chunk = chunks[i]
		if (i % 10 === 0)
			log(`\tGenerating chunk ${i + 1} of ${chunks.length}`)
		const audio = await generateSpeech({ text: chunk, voice, speed })
		await audio.save(chunkPath)
	}

	await joinAudioChunks(chunksDir, outputDir, chapterFileName, chunks.length)

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
	log(`[x] finished chapter: ${chapterFileName}`)
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
