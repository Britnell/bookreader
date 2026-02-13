import way from "wayy"
import { useCachedVar } from "./cache.ts"
import { generateSpeech, getVoices } from "./kokoro.ts"

way.comp("reader", ({ props: { book } }) => {
	const section = useCachedVar("section", 0)
	const pIndex = useCachedVar("pIndex", 0)
	const selectedVoice = useCachedVar("selectedVoice", "alloy")
	const speed = useCachedVar("speed", 1.0)
	const isPlaying = way.signal(false)
	const paused = way.signal(false)
	const loadingAudio = way.signal(true)
	const voices = way.signal<string[]>([])
	const speedOptions = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]
	const audioCache = new Map<
		number,
		HTMLAudioElement | Promise<HTMLAudioElement | null>
	>()
	let previousPIndex = 0

	const onkey = (ev: KeyboardEvent) => {
		const key = ev.key
		if (key === "ArrowLeft") prev()
		if (key === "ArrowRight") next()
		if (key === " ") {
			ev.preventDefault()
			playpause()
		}
	}

	window.addEventListener("keydown", onkey)

	const next = async () => {
		const currentIndex = pIndex.value
		const current = audioCache.get(currentIndex)
		const currentAudio = current instanceof Promise ? null : current

		// pause current if playing and remove ended listener
		if (currentAudio && isPlaying.value) {
			currentAudio.pause()
			currentAudio.removeEventListener("ended", next)
		}

		stepNode(1)
		const newIndex = pIndex.value

		// Check if the new audio is ready, if not show loading indicator
		const entry = audioCache.get(newIndex)
		if (!entry || entry instanceof Promise) {
			loadingAudio.value = true
		}

		const newAudio = entry instanceof Promise ? await entry : entry

		if (newAudio) {
			// Reset audio position to the beginning
			newAudio.currentTime = 0
			if (isPlaying.value) {
				attachAudioEndedListener(newAudio)
				newAudio.play()
			}
		}

		// Trigger pre-generation for next paragraphs
		preGenerateNext(newIndex)
	}

	const prev = async () => {
		const currentIndex = pIndex.value
		const current = audioCache.get(currentIndex)
		const currentAudio = current instanceof Promise ? null : current

		// Check if we should restart the current paragraph or go to previous
		const shouldGoToPrevious = !currentAudio || currentAudio.currentTime < 1

		// pause current if playing and remove ended listener
		if (currentAudio && isPlaying.value) {
			currentAudio.pause()
			currentAudio.removeEventListener("ended", next)
		}

		if (shouldGoToPrevious) {
			// Go to previous paragraph
			stepNode(-1)
			const newIndex = pIndex.value

			// If the previous paragraph hasn't been generated, generate it now
			if (!audioCache.has(newIndex)) {
				loadingAudio.value = true
				await ensureAudioLoaded(newIndex)
				loadingAudio.value = false
			}

			const entry = audioCache.get(newIndex)
			const newAudio = entry instanceof Promise ? await entry : entry
			if (newAudio) {
				// Reset audio position to the beginning
				newAudio.currentTime = 0
				if (isPlaying.value) {
					attachAudioEndedListener(newAudio)
					newAudio.play()
				}
			}

			// Trigger pre-generation for next paragraphs
			preGenerateNext(newIndex)
		} else {
			// Restart the current paragraph
			currentAudio.currentTime = 0
			if (isPlaying.value) {
				attachAudioEndedListener(currentAudio)
				currentAudio.play()
			}
		}
	}

	const nextSection = () => {
		const entry = audioCache.get(pIndex.value)
		const currentAudio = entry instanceof Promise ? null : entry

		// pause current if playing
		if (currentAudio && isPlaying.value) {
			currentAudio.pause()
			currentAudio.removeEventListener("ended", next)
		}

		// Clear cache before switching sections
		audioCache.clear()
		section.value = section.value + 1
		pIndex.value = 0
	}

	const prevSection = () => {
		const entry = audioCache.get(pIndex.value)
		const currentAudio = entry instanceof Promise ? null : entry

		// pause current if playing
		if (currentAudio && isPlaying.value) {
			currentAudio.pause()
			currentAudio.removeEventListener("ended", next)
		}

		if (section.value > 0) {
			// Clear cache before switching sections
			audioCache.clear()
			section.value = section.value - 1
			pIndex.value = 0
		}
	}

	function stepNode(x: number): void {
		const newIndex = pIndex.value + x
		const pTagCount = epubEl?.querySelectorAll("p").length || 0

		if (newIndex < 0) {
			// Move to previous section
			if (section.value > 0) {
				// Clear cache before switching sections
				audioCache.clear()
				section.value = section.value - 1
				pIndex.value = 0
			}
		} else if (newIndex >= pTagCount) {
			// Move to next section
			// Clear cache before switching sections
			audioCache.clear()
			section.value = section.value + 1
			pIndex.value = 0
		} else {
			pIndex.value = newIndex
		}
	}

	const playpause = async () => {
		const entry = audioCache.get(pIndex.value)
		const currentAudio = entry instanceof Promise ? await entry : entry

		if (isPlaying.value) {
			// Pause: just pause the current audio
			if (currentAudio) {
				currentAudio.pause()
				paused.value = true
			}
			isPlaying.value = false
		} else {
			// Play: resume if paused, or start playing
			if (currentAudio) {
				attachAudioEndedListener(currentAudio)
				currentAudio.play()
				paused.value = false
				isPlaying.value = true
			}
		}
	}

	const attachAudioEndedListener = (audio: HTMLAudioElement) => {
		audio.addEventListener("ended", next)
	}

	const epubEl = document.getElementById("epub")

	async function loadAudioForPTag(
		pIndex: number,
	): Promise<HTMLAudioElement | null> {
		const pTag = epubEl?.querySelectorAll("p")[pIndex]
		if (!pTag) return null
		return generateSpeech(
			pTag.textContent || "",
			selectedVoice.value,
			speed.value,
		)
	}

	async function ensureAudioLoaded(index: number): Promise<void> {
		const existing = audioCache.get(index)

		// If already loaded (HTMLAudioElement), skip
		if (existing && !(existing instanceof Promise)) {
			return
		}

		// If already loading (Promise), wait for it
		if (existing instanceof Promise) {
			await existing
			return
		}

		// Start loading and store the promise
		const loadPromise = loadAudioForPTag(index)
		audioCache.set(index, loadPromise)

		// Wait for the audio to load
		const audio = await loadPromise

		// Replace promise with the actual audio element
		if (audio) {
			audioCache.set(index, audio)
		}
	}

	async function preGenerateNext(currentIndex: number): Promise<void> {
		// First ensure current is loaded
		await ensureAudioLoaded(currentIndex)

		// Once current is ready, enable play button
		loadingAudio.value = false

		// Then load next (don't await - run in background)
		const next1 = currentIndex + 1
		ensureAudioLoaded(next1)

		// Then load next+1 (don't await - run in background)
		const next2 = currentIndex + 2
		ensureAudioLoaded(next2)
	}

	const onMounted = () => {
		console.log("mount")
	}

	const highlightCurrentParagraph = () => {
		const curr = pIndex.value
		const pTags = epubEl?.querySelectorAll("p")
		if (!pTags) return

		// Remove highlight from previous paragraph
		if (previousPIndex < pTags.length) {
			const prevTag = pTags[previousPIndex]
			prevTag?.classList.remove("highlight")
		}

		// Add highlight to current paragraph
		if (curr < pTags.length) {
			const currTag = pTags[curr]
			currTag?.classList.add("highlight")
			currTag?.scrollIntoView({ behavior: "smooth", block: "center" })
		}

		previousPIndex = curr
	}

	const openMenu = () => {
		const dialog = document.getElementById(
			"menu-dialog",
		) as HTMLDialogElement | null
		if (dialog) {
			dialog.showModal()
		}
	}

	const closeMenu = () => {
		const dialog = document.getElementById(
			"menu-dialog",
		) as HTMLDialogElement | null
		if (dialog) {
			dialog.close()
		}
	}

	const render = async () => {
		loadingAudio.value = true
		const curr = pIndex.value

		// Clear the cache when switching sections
		audioCache.clear()

		// Start pre-generation for current and next paragraphs
		await preGenerateNext(curr)
	}

	way.effect(() => {
		;(async () => {
			try {
				const availableVoices = await getVoices()
				console.log(availableVoices)

				voices.value = availableVoices
			} catch (error) {
				console.error("Failed to fetch voices:", error)
			}
		})()
	})

	way.effect(() => {
		pIndex.value // Track changes to pIndex
		highlightCurrentParagraph()
	})

	way.effect(() => {
		if (!book?.value || !epubEl) return
		;(async () => {
			const s = book.value.spine.get(section.value)
			const doc = await s?.load(book.value.load.bind(book.value))

			const body = doc.querySelector("body")
			if (!body) return
			const contents = body.cloneNode(true)
			epubEl?.replaceChildren(contents)

			render()

			setTimeout(() => {
				highlightCurrentParagraph()
			}, 0)
		})()
	})

	return {
		section,
		pIndex,
		next,
		prev,
		nextSection,
		prevSection,
		onMounted,
		isPlaying,
		paused,
		loadingAudio,
		playpause,
		selectedVoice,
		voices,
		speed,
		speedOptions,
		openMenu,
		closeMenu,
	}
})
