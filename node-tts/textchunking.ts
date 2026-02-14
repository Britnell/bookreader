const MIN_TOKENS = 40 // absolute min
const OPTIMAL_TOKENS = 80 // optimal max
const MAX_TOKENS = 100 // max

/** Estimate tokens (roughly 1 token per 4 characters for English) */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

/** Find the end of the current sentence (index after terminal punctuation). */
function findSentenceEnd(text: string, start: number): number {
	let i = start

	while (i < text.length) {
		const ch = text[i]

		// Major punctuation — end of sentence
		if (ch === "." || ch === "?" || ch === "!") {
			// Consume consecutive sentence-ending punctuation (e.g. "...", "?!", "!!!")
			while (
				i + 1 < text.length &&
				(text[i + 1] === "." || text[i + 1] === "?" || text[i + 1] === "!")
			) {
				i++
			}
			return i + 1
		}

		i++
	}

	// No sentence-ending punctuation found — treat end of text as sentence end
	return text.length
}

/** Find the best minor break point that keeps the first part under maxTokens. */
function splitAtMinorBreak(
	text: string,
	minorBreaks: number[],
	maxTokens: number,
): number {
	const limit = maxTokens * 4 // inverse of estimateTokens

	// Find the last minor break that stays within the limit
	let best = -1
	for (const bp of minorBreaks) {
		if (bp <= limit) best = bp
		else break
	}

	if (best > 0) return best

	// No suitable minor break — fall back to word boundary near the char limit
	let fallback = Math.min(limit, text.length)
	while (fallback > 0 && text[fallback] !== " ") fallback--
	return fallback > 0 ? fallback : Math.min(limit, text.length)
}

/** Drain text that exceeds OPTIMAL_TOKENS by splitting at minor punctuation. */
function drainOversized(text: string, chunks: string[]): string {
	let remaining = text
	while (estimateTokens(remaining) > OPTIMAL_TOKENS) {
		const breaks: number[] = []
		for (let i = 0; i < remaining.length; i++) {
			const ch = remaining[i]
			if (ch === "," || ch === ";" || ch === ":" || ch === "—" || ch === "-") {
				breaks.push(i + 1)
			}
		}
		const splitPoint = splitAtMinorBreak(remaining, breaks, OPTIMAL_TOKENS)
		chunks.push(remaining.slice(0, splitPoint).trim())
		remaining = remaining.slice(splitPoint).trim()
	}
	return remaining
}

/** Split text into chunks respecting token limits and sentence boundaries. */
export function chunkify(text: string): string[] {
	const chunks: string[] = []
	let pos = 0
	let buffer = ""

	while (pos < text.length) {
		const sentenceEnd = findSentenceEnd(text, pos)
		const sentence = text.slice(pos, sentenceEnd).trim()
		pos = sentenceEnd

		if (sentence.length === 0) continue

		const candidate = buffer ? buffer + " " + sentence : sentence
		const tokens = estimateTokens(candidate)

		if (tokens < MIN_TOKENS) {
			buffer = candidate
			continue
		}

		if (tokens <= OPTIMAL_TOKENS) {
			// Lookahead: peek at next sentence — if it's short, defer so we
			// can absorb it on the next iteration
			if (pos < text.length) {
				const nextEnd = findSentenceEnd(text, pos)
				const nextSentence = text.slice(pos, nextEnd).trim()
				if (
					nextSentence.length > 0 &&
					estimateTokens(nextSentence) < MIN_TOKENS
				) {
					const withNext = candidate + " " + nextSentence
					// Absorb short next sentence if combined stays in OPTIMAL range
					if (estimateTokens(withNext) <= OPTIMAL_TOKENS) {
						buffer = candidate
						continue
					}
					// Last sentence exception: absorb a short trailing sentence
					// even above OPTIMAL, as long as we stay under UPPER
					const isLastSentence = text.slice(nextEnd).trim().length === 0
					if (isLastSentence && estimateTokens(withNext) <= MAX_TOKENS) {
						buffer = candidate
						continue
					}
				}
			}
			chunks.push(candidate.trim())
			buffer = ""
			continue
		}

		if (tokens <= MAX_TOKENS) {
			// Between OPTIMAL and UPPER — emit as-is, no further absorption
			chunks.push(candidate.trim())
			buffer = ""
			continue
		}

		// Too long — need to split
		if (buffer && estimateTokens(buffer) >= MIN_TOKENS) {
			// Buffer alone is viable — emit it, handle sentence separately
			chunks.push(buffer.trim())
			buffer = drainOversized(sentence, chunks)
			continue
		}

		// Buffer too short to emit alone — split the combined candidate
		buffer = drainOversized(candidate, chunks)
	}

	if (buffer.trim()) chunks.push(buffer.trim())

	return chunks
}
