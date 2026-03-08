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

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

type Book = {
	title: string
	cover?: string
	chapters: string[]
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

type RPC = {
	bun: RPCSchema<{
		requests: {
			settings: { params: null | object; response: Settings }
			selectPath: { params: undefined; response: Settings }
			getBooks: { params: undefined; response: Book[] }
			addBook: { params: undefined; response: object }
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
	console.log({ path })
	const epub = await EPub.createAsync(path, "", "")

	const title = epub.metadata.title || "untitled"

	const existing = settings.books.find((b) => b.title === title)
	if (existing) return existing

	// const slug = title.replace(/[^a-z0-9]/gi, "_").toLowerCase()
	const chapters = epub.flow.map((chapter, i) => {
		const paddedIndex = String(i).padStart(2, "0")
		const chapterTitle = chapter.title || chapter.href.split("/").pop()!.split(".")[0]
		return `${paddedIndex}_${chapterTitle}`
	})

	const bookDir = join(settings.path, title)
	await mkdir(bookDir, { recursive: true })

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
	setSetting({ books: [...settings.books, book] })
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

const rpc = BrowserView.defineRPC<RPC>({
	maxRequestTime: 10000,
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
			addBook: async () => {
				const paths = await openBookDialog()
				console.log(paths)
				const path = paths.join(",")
				if (!path) return {}
				try {
					return createBook(path)
				} catch (e) {
					console.log(e)
					return { error: "..." }
				}
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
		x: 900,
		y: 50,
	},
})

console.log("React Tailwind Vite app started!")
