export async function joinAudioChunks(
	chunksDir: string,
	outputDir: string,
	chapterTitle: string,
	numChunks: number,
) {
	const outputFile = `${outputDir}/${chapterTitle}.wav`
	const fileListPath = `${chunksDir}/chunklist.txt`

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
			cwd: chunksDir,
			stdout: "ignore",
			stderr: "ignore",
		},
	)

	await proc.exited

	if (proc.exitCode === 0) {
		// Clean up temp file list
		await Bun.file(fileListPath).delete?.()

		// Delete chunk files
		for (let i = 0; i < numChunks; i++) {
			const chunkFile = `${chunksDir}/${chapterTitle}_${i}.wav`
			await Bun.file(chunkFile).delete?.()
		}
	} else {
		console.error(`✗ ffmpeg failed with exit code ${proc.exitCode}`)
	}
}

export interface AudioMetadata {
	title: string
	album: string
	artist: string
	trackNumber: number
	totalTracks: number
	coverImagePath?: string
}

export async function embedMetadata(
	wavPath: string,
	mp3Path: string,
	meta: AudioMetadata,
) {
	const args = ["ffmpeg", "-y", "-i", wavPath]

	if (meta.coverImagePath) {
		args.push("-i", meta.coverImagePath)
	}

	args.push(
		"-map", "0:a",
		...(meta.coverImagePath ? ["-map", "1:v"] : []),
		"-c:a", "libmp3lame",
		"-b:a", "192k",
		...(meta.coverImagePath ? ["-c:v", "copy", "-id3v2_version", "3"] : []),
		"-metadata", `title=${meta.title}`,
		"-metadata", `album=${meta.album}`,
		"-metadata", `artist=${meta.artist}`,
		"-metadata", `track=${meta.trackNumber}/${meta.totalTracks}`,
		mp3Path,
	)

	const proc = Bun.spawn(args, {
		cwd: process.cwd(),
		stdout: "ignore",
		stderr: "ignore",
	})

	await proc.exited

	if (proc.exitCode === 0) {
		await Bun.file(wavPath).delete?.()
	} else {
		console.error(`✗ ffmpeg metadata embedding failed for ${mp3Path}`)
	}
}
