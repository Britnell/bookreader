// import * as EPub from "epub2/node";
import { EPub } from "epub2";
import { parse } from "node-html-parser";

const TARGET_MIN_TOKENS = 175;
const TARGET_MAX_TOKENS = 250;
const ABSOLUTE_MAX_TOKENS = 450;

function parseChapterText(html: string): string {
	const root = parse(html);
	return root.textContent;
}

// Simple token estimator (roughly 1 token per 4 characters for English)
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// Split text into sentences respecting common sentence boundaries
function splitIntoSentences(text: string): string[] {
	// Match sentence endings followed by whitespace or end of string
	// Handles periods, question marks, exclamation points, and ellipsis
	const sentenceRegex = /[^.!?\n]+[.!?\n]+(?:\s+|$)|[^.!?\n]+$/g;
	const sentences = text.match(sentenceRegex) || [];
	return sentences.filter((s) => s.length > 0);
}

// Chunk text into TTS-friendly segments based on Kokoro recommendations
function chunkTextForTTS(text: string): string[] {
	const sentences = splitIntoSentences(text);
	const chunks: string[] = [];
	let currentChunk = "";
	let currentTokens = 0;

	for (const sentence of sentences) {
		const sentenceTokens = estimateTokens(sentence);

		// If single sentence exceeds absolute max, split it further (fallback)
		if (sentenceTokens > ABSOLUTE_MAX_TOKENS) {
			if (currentChunk) {
				chunks.push(currentChunk.trim());
				currentChunk = "";
				currentTokens = 0;
			}
			// Split long sentence by commas or other natural breaks
			const parts = sentence.split(/,\s+/);
			let partChunk = "";
			let partTokens = 0;

			for (const part of parts) {
				const partToken = estimateTokens(part);
				if (partTokens + partToken > TARGET_MAX_TOKENS && partChunk) {
					chunks.push(partChunk.trim());
					partChunk = part;
					partTokens = partToken;
				} else {
					partChunk += (partChunk ? ", " : "") + part;
					partTokens += partToken;
				}
			}
			if (partChunk) {
				chunks.push(partChunk.trim());
			}
			continue;
		}

		// Check if adding this sentence would exceed target max
		if (currentTokens + sentenceTokens > TARGET_MAX_TOKENS && currentChunk) {
			chunks.push(currentChunk.trim());
			currentChunk = sentence;
			currentTokens = sentenceTokens;
		} else if (
			currentTokens >= TARGET_MIN_TOKENS &&
			currentTokens + sentenceTokens > TARGET_MAX_TOKENS
		) {
			// We're in target range, start new chunk
			chunks.push(currentChunk.trim());
			currentChunk = sentence;
			currentTokens = sentenceTokens;
		} else {
			// Add to current chunk
			currentChunk += (currentChunk ? " " : "") + sentence;
			currentTokens += sentenceTokens;
		}
	}

	// Add remaining chunk
	if (currentChunk) {
		chunks.push(currentChunk.trim());
	}

	return chunks.join("\n\n");
}

function parseArgs() {
	const args: Record<string, string> = {};
	for (let i = 2; i < process.argv.length; i += 2) {
		args[process.argv[i]] = process.argv[i + 1] || "";
	}
	return args;
}

const args = parseArgs();
if (!args["-f"] || !args["-ch"]) {
	console.error(`Missing required arguments
	  -f <file> -ch <chapter>
	`);
	process.exit(1);
}

const file = args["-f"];
const ch = parseInt(args["-ch"], 10);

main();

async function main() {
	const epub = await EPub.createAsync(file, "./tmp", "./tmp");

	epub.flow.forEach(function (chapter) {
		console.log(chapter.id);
	});

	const id = epub.flow[ch].id;
	const x = epub.getChapter(id, function (error, html) {
		if (error) {
			console.error(error);
			return;
		}

		const text = parseChapterText(html);
		const result = chunkTextForTTS(text);

		console.log(result);
	});
}
