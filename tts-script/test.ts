// import * as EPub from "epub2/node";
// import { generateSpeech, type Voice } from "./kokoro.ts"
import { generateSpeech } from "./supertonic.ts"

function parseArgs() {
	const args: Record<string, string> = {}
	for (let i = 2; i < process.argv.length; i += 2) {
		args[process.argv[i]] = process.argv[i + 1] || ""
	}
	return args
}

const args = parseArgs()
const voice = args["-v"] as string
const speed = args["-sp"] ? parseFloat(args["-sp"]) : 1

main()

async function main() {
	const text = `
	lorem ipsum dolor sit amet, consectetur adipiscing elit. sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
	`
	console.log(`Generating audio for  (voice: ${voice}, speed: ${speed})...`)

	// Generate speech using local Kokoro
	const audio = await generateSpeech({ text, voice, speed })

	// await writeFile('./test.wav', text, "utf-8")
	await audio.save("./test.mp3")
}
