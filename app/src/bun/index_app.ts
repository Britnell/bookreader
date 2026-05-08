import Electrobun, {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Updater,
	Utils,
	type RPCSchema,
} from "electrobun/bun"
import { join } from "node:path"
import { homedir } from "node:os"
import { readdir, mkdir } from "node:fs/promises"
import { EPub } from "epub2"
import { parse } from "node-html-parser"
import { getChapterHtml, readChapter } from "./read"
import { getTTS } from "./kokoro"

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

type Book = {
	title: string
	cover?: string
	chapters: string[]
}

type OpenBookResult = {
	title: string
}
type Settings = {
	path: string
	books: Book[]
}

let settings: Settings = {
	path: "",
	books: [],
}

const settingsPath = join(Utils.paths.appData, "app.json")

async function readSettings() {
	const f = Bun.file(settingsPath)
	const exists = await f.exists() // false
	if (!exists) {
		Bun.write(settingsPath, JSON.stringify(settings))
		// return
	}
	const json = await f.json()
	settings = json

	if (settings.path) {
		const folder = Bun.file(settings.path)
		const exists = await folder.exists() // false
		if (!exists) {
			await mkdir(settings.path, { recursive: true })
		}
	}
}

function setSetting(updates: Partial<Settings>) {
	settings = {
		...settings,
		...updates,
	}
	// const path = join(Utils.paths.appData, "app.json")
	Bun.write(settingsPath, JSON.stringify(settings))
}

readSettings()

let openEpub: EPub | null = null
let openBookTitle: string | null = null

type RPC = {
	bun: RPCSchema<{
		requests: {
			settings: { params: null | object; response: Settings }
			selectPath: { params: undefined; response: Settings }
			getBooks: { params: undefined; response: Book[] }
			removeBook: { params: string; response: object }
			addBook: { params: undefined; response: object }
			openBook: { params: string; response: OpenBookResult }
			getFinishedChapters: { params: string; response: string[] }
			readChapter: { params: string; response: { chapterTitle: string } }
		}
	}>
	webview: RPCSchema<{
		requests: {}
		messages: {}
	}>
}

const openPathDialog = () =>
	Utils.openFileDialog({
		startingFolder: join(homedir(), "Documents"),
		canChooseFiles: false,
		canChooseDirectory: true,
		allowsMultipleSelection: false,
	})

const openBookDialog = () =>
	Utils.openFileDialog({
		startingFolder: join(homedir(), "Documents"),
		allowedFileTypes: "epub",
		canChooseFiles: true,
		canChooseDirectory: false,
		allowsMultipleSelection: false,
	})

async function createBook(path: string) {
	const epub = await EPub.createAsync(path, "", "")
	const title = epub.metadata.title || "untitled"
	const existing = settings.books.find((b) => b.title === title)
	if (existing) return existing

	const chapters = epub.flow.map((chapter, i) => {
		const paddedIndex = String(i).padStart(2, "0")
		const chapterTitle =
			chapter.title || chapter.href.split("/").pop()!.split(".")[0]
		return `${paddedIndex}_${chapterTitle}`
	})

	const bookDir = join(settings.path, title)
	await mkdir(bookDir, { recursive: true })

	// Copy epub into book folder so we can reload it later without the original
	await Bun.write(join(bookDir, "book.epub"), Bun.file(path))

	if (epub.metadata.cover) {
		try {
			const { buffer, mimeType } = await getImage(epub, epub.metadata.cover)
			const ext = mimeType.split("/")[1] || "jpg"
			const cover = join(bookDir, `cover.${ext}`)
			await Bun.write(cover, buffer)
		} catch (e) {
			console.warn("Could not extract cover image:", e)
		}
	}

	const book = { title, chapters }
	setSetting({
		...settings,
		books: [...settings.books, book],
	})
	return book
}

function getImage(epub, id): Promise<{ buffer: Buffer; mimeType: string }> {
	return new Promise((resolve, reject) => {
		epub.getImage(id, (error, buffer, mimeType) => {
			if (error) reject(error)
			else resolve({ buffer, mimeType })
		})
	})
}

async function openBook(title: string) {
	const book = settings.books.find((b) => b.title === title)
	if (!book) throw new Error(`Book not found: ${title}`)

	const bookDir = join(settings.path, title)

	openEpub = await EPub.createAsync(join(bookDir, "book.epub"), "", "")
	openBookTitle = title

	return { title }
}

async function getFinishedChapters(title: string) {
	if (!openEpub || openBookTitle !== title)
		throw new Error(`Book not open: ${title}`)

	const bookDir = join(settings.path, title)
	const files = await readdir(bookDir)

	const results = await Promise.all(
		openEpub.flow.map(async (chapter, i) => {
			const paddedIndex = String(i).padStart(2, "0")
			const chapterTitle =
				chapter.title || chapter.href.split("/").pop()!.split(".")[0]
			const name = `${paddedIndex}_${chapterTitle}`

			if (files.includes(`${name}.mp3`)) return name

			const html = await getChapterHtml(openEpub, chapter.id)
			if (!parse(html).textContent.trim()) return name

			return null
		}),
	)

	return results.filter(Boolean) as string[]
}

const rpc = BrowserView.defineRPC<RPC>({
	maxRequestTime: 3600000,
	handlers: {
		requests: {
			settings: (updates) => {
				if (updates) setSetting(updates)
				return settings
			},
			selectPath: async () => {
				const res = await openPathDialog()
				if (!res[0]) return settings
				const path = join(res[0], "BookReader")
				setSetting({ path })
				return settings
			},
			getBooks: () => {
				return settings.books
				// const files = await readdir(settings.path).catch(console.log)
			},
			removeBook: (title: string) => {
				setSetting({
					...settings,
					books: settings.books.filter((b) => b.title !== title),
				})
				return
			},
			addBook: async () => {
				const paths = await openBookDialog()
				const path = paths.join(",")
				if (!path) return {}
				try {
					return createBook(path)
				} catch (e) {
					console.log(e)
					return { error: "..." }
				}
			},
			openBook,
			getFinishedChapters,
			readChapter: (chapterTitle) => {
				if (!openEpub || !openBookTitle) throw new Error("No book open")
				return readChapter(
					chapterTitle,
					openEpub,
					openBookTitle,
					settings.path,
					Utils.paths.temp,
				)
			},
		},
	},
})

const url = await getMainViewUrl()

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel()
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" })
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`)
			return DEV_SERVER_URL
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			)
		}
	}
	return "views://mainview/index.html"
}

const mainWindow = new BrowserWindow({
	title: "Much App Wow",
	url,
	rpc,
	frame: {
		width: 800,
		height: 400,
		x: 1900,
		y: 50,
	},
})

console.log("React Tailwind Vite app started!")
