import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import { parse } from "node-html-parser"
import type { EPub } from "epub2"
import { generateSpeech } from "./kokoro"
import { chunkify } from "./textchunking"
import { joinAudioChunks, embedMetadata } from "./audio"

export function getChapterHtml(epub: EPub, id: string): Promise<string> {
	return new Promise((resolve, reject) => {
		epub.getChapter(id, (error, html) => {
			if (error) reject(error)
			else resolve(html)
		})
	})
}

export async function renderChunk(chunk: string, chunkPath: string) {
	const exists = await Bun.file(chunkPath).exists()
	if (exists) return
	const audio = await generateSpeech({
		text: chunk,
		voice: "bf_emma",
		speed: 1,
	})
	await audio.save(chunkPath)
}

export async function readChapter(
	chapterTitle: string,
	epub: EPub,
	bookTitle: string,
	booksPath: string,
	tempPath: string,
) {
	const chapterIndex = epub.flow.findIndex((chapter, i) => {
		const paddedIndex = String(i).padStart(2, "0")
		const title = chapter.title || chapter.href.split("/").pop()!.split(".")[0]
		return `${paddedIndex}_${title}` === chapterTitle
	})

	console.log(" READ ", chapterIndex)
	if (chapterIndex === -1) throw new Error(`Chapter not found: ${chapterTitle}`)

	const chapter = epub.flow[chapterIndex]
	const html = await getChapterHtml(epub, chapter.id)
	const text = parse(html).textContent.trim()

	if (!text) throw new Error(`Chapter is empty: ${chapterTitle}`)

	const chunks = chunkify(text)

	const sanitizedBookTitle = bookTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const chunksDir = join(tempPath, "bookreader", sanitizedBookTitle)
	await mkdir(chunksDir, { recursive: true })
	for (let i = 0; i < chunks.length; i++) {
		console.log({ i, l: chunks.length })
		const chunkPath = join(chunksDir, `${chapterTitle}_${i}.wav`)
		await renderChunk(chunks[i], chunkPath)
	}

	const bookDir = join(booksPath, bookTitle)
	await joinAudioChunks(chunksDir, bookDir, chapterTitle, chunks.length)

	const wavPath = join(bookDir, `${chapterTitle}.wav`)
	const mp3Path = join(bookDir, `${chapterTitle}.mp3`)
	await embedMetadata(wavPath, mp3Path, {
		title: chapter.title || chapterTitle,
		album: bookTitle,
		artist: epub.metadata.creator || "author",
		trackNumber: chapterIndex + 1,
		totalTracks: epub.flow.length,
	})

	return { chapterTitle }
}
