export async function joinAudioChunks(
	outputDir: string,
	chapterTitle: string,
	numChunks: number,
) {
	const outputFile = `${outputDir}/${chapterTitle}.wav`
	const fileListPath = `${outputDir}/chunklist.txt`

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
			cwd: process.cwd(),
			stdout: "inherit",
			stderr: "inherit",
		},
	)

	await proc.exited

	if (proc.exitCode === 0) {
		console.log(`✓ Created ${outputFile}`)

		// Clean up temp file list
		await Bun.file(fileListPath).delete?.()

		// Delete chunk files
		for (let i = 0; i < numChunks; i++) {
			const chunkFile = `${outputDir}/${chapterTitle}_${i}.wav`
			await Bun.file(chunkFile).delete?.()
		}
		console.log(`✓ Cleaned up ${numChunks} chunk files`)
	} else {
		console.error(`✗ ffmpeg failed with exit code ${proc.exitCode}`)
	}
}
