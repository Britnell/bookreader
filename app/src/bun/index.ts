import Electrobun, {
	BrowserView,
	BrowserWindow,
	Updater,
	Utils,
	type RPCSchema,
} from "electrobun/bun"
import { join } from "node:path"
import { readBook } from "./bun"
import { homedir } from "node:os"
import { mkdir } from "node:fs/promises"

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

type Settings = {
	path: string
}

let settings: Settings = {
	path: "",
}

const settingsPath = join(Utils.paths.appData, "app.json")

async function readSettings() {
	const f = Bun.file(settingsPath)
	const exists = await f.exists()
	if (!exists) {
		Bun.write(settingsPath, JSON.stringify(settings))
	}
	const json = await f.json()
	settings = json

	if (settings.path) {
		const folder = Bun.file(settings.path)
		const exists = await folder.exists()
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
	Bun.write(settingsPath, JSON.stringify(settings))
}

readSettings()

type RPC = {
	bun: RPCSchema<{
		requests: {
			settings: { params: null | object; response: Settings }
			selectPath: { params: undefined; response: Settings }
			selectBook: { params: undefined; response: string }
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
			selectBook: async () => {
				const paths = await openBookDialog()
				const filePath = paths.join(",")
				await readBook({ file: filePath })
				return filePath
			},
		},
	},
})

const url = await getMainViewUrl()

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
