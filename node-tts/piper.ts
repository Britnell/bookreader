import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as ort from "onnxruntime-node";
import { Writer } from "wav";

// Configuration from piper
const PIPER_CONFIG = {
	repoUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/",
	defaults: {
		sampleRate: 22050,
		numChannels: 1,
		noiseScale: 0.667,
		lengthScale: 1,
		noiseW: 0.8,
	},
	phonemeIdConfig: {
		pad: "_",
		bos: "^",
		eos: "$",
		interspersePad: true,
		addBos: true,
		addEos: true,
	},
};

interface ModelConfig {
	audio?: { sample_rate?: number };
	espeak: { voice: string };
	inference?: {
		noise_scale?: number;
		length_scale?: number;
		noise_w?: number;
	};
	phoneme_type?: string;
	phoneme_map?: Record<string, string[]>;
	phoneme_id_map?: Record<string, number[]>;
}

interface PcmData {
	samples: Float32Array;
	sampleRate: number;
	numChannels: number;
}

/**
 * Download a file from URL
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(destPath);
		https
			.get(url, (response) => {
				response.pipe(file);
				file.on("finish", () => {
					file.close();
					resolve();
				});
			})
			.on("error", (err) => {
				fs.unlink(destPath, () => {});
				reject(err);
			});
	});
}

/**
 * Convert phonemes to phoneme IDs based on model config
 */
function toPhonemeIds(phonemes: string[], modelConfig: ModelConfig): number[] {
	if (!modelConfig.phoneme_id_map)
		throw new Error("Missing modelConfig.phoneme_id_map");

	const { bos, eos, pad, addBos, addEos, interspersePad } =
		PIPER_CONFIG.phonemeIdConfig;
	const missing = new Set<string>();
	const phonemeIds: number[] = [];

	if (addBos) {
		phonemeIds.push(...modelConfig.phoneme_id_map[bos]);
		if (interspersePad) phonemeIds.push(...modelConfig.phoneme_id_map[pad]);
	}

	for (const phoneme of phonemes) {
		if (phoneme in modelConfig.phoneme_id_map) {
			phonemeIds.push(...modelConfig.phoneme_id_map[phoneme]);
			if (interspersePad) phonemeIds.push(...modelConfig.phoneme_id_map[pad]);
		} else {
			missing.add(phoneme);
		}
	}

	if (addEos) {
		phonemeIds.push(...modelConfig.phoneme_id_map[eos]);
	}

	if (missing.size) console.warn("Missing mapping for phonemes", missing);
	return phonemeIds;
}

/**
 * Convert text to phonemes using Piper service API
 */
async function textToPhonemes(
	text: string,
	language: string,
	phonemeType: "text" | "espeak",
): Promise<string[][]> {
	const serviceUrl = "https://service.lsdsoftware.com";
	const res = await fetch(
		serviceUrl + "/piper?capabilities=batchPhonemize-1.0",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				method: "batchPhonemize",
				type: phonemeType,
				texts: [text],
				lang: language,
			}),
		},
	);

	if (!res.ok) throw new Error("Server return " + res.status);
	const results = (await res.json()) as Array<{
		text: string;
		phonemes: string[][];
	}>;
	return results[0].phonemes;
}

/**
 * Create inference engine from ONNX model
 */
async function createInferenceEngine(
	modelPath: string,
	modelConfig: ModelConfig,
) {
	const sampleRate =
		modelConfig.audio?.sample_rate ?? PIPER_CONFIG.defaults.sampleRate;
	const numChannels = PIPER_CONFIG.defaults.numChannels;
	const noiseScale =
		modelConfig.inference?.noise_scale ?? PIPER_CONFIG.defaults.noiseScale;
	const lengthScale =
		modelConfig.inference?.length_scale ?? PIPER_CONFIG.defaults.lengthScale;
	const noiseW = modelConfig.inference?.noise_w ?? PIPER_CONFIG.defaults.noiseW;

	const session = await ort.InferenceSession.create(modelPath);

	return {
		async infer(phonemeIds: number[]): Promise<PcmData> {
			const feeds: Record<string, ort.Tensor> = {
				input: new ort.Tensor(
					"int64",
					BigInt64Array.from(phonemeIds.map(BigInt)),
					[1, phonemeIds.length],
				),
				input_lengths: new ort.Tensor(
					"int64",
					BigInt64Array.from([BigInt(phonemeIds.length)]),
				),
				scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW]),
			};

			const output = await session.run(feeds);
			const samples = output.output as ort.Tensor;

			return {
				samples: new Float32Array(samples.data as ArrayBuffer),
				sampleRate,
				numChannels,
			};
		},
		async dispose() {
			await session.release();
		},
	};
}

/**
 * Save PCM data to WAV file
 */
function savePcmToWav(pcmData: PcmData, outputPath: string): void {
	const writer = new Writer({
		channels: pcmData.numChannels,
		sampleRate: pcmData.sampleRate,
		bitDepth: 16,
	});

	writer.pipe(fs.createWriteStream(outputPath));

	// Convert Float32 samples to Int16
	const int16Data = new Int16Array(pcmData.samples.length);
	for (let i = 0; i < pcmData.samples.length; i++) {
		let s = Math.max(-1, Math.min(1, pcmData.samples[i]));
		int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}

	writer.write(Buffer.from(int16Data.buffer));
	writer.end();

	return new Promise((resolve, reject) => {
		writer.on("finish", resolve);
		writer.on("error", reject);
	});
}

/**
 * Main demo: synthesize text to speech
 */
async function demo() {
	console.log("Piper TTS Node.js Demo");
	console.log("======================\n");

	const voiceKey = "en_US-lessac-medium";
	const modelDir = path.join(__dirname, "models");
	const modelPath = path.join(modelDir, `${voiceKey}.onnx`);
	const configPath = path.join(modelDir, `${voiceKey}.json`);
	const outputPath = path.join(modelDir, "output.wav");

	// Create models directory if it doesn't exist
	if (!fs.existsSync(modelDir)) {
		fs.mkdirSync(modelDir, { recursive: true });
	}

	try {
		// Download model and config if needed
		if (!fs.existsSync(modelPath)) {
			console.log(`Downloading model ${voiceKey}.onnx...`);
			const modelFile = `en_US/lessac/medium/en_US-lessac-medium.onnx`;
			await downloadFile(PIPER_CONFIG.repoUrl + modelFile, modelPath);
			console.log("✓ Model downloaded\n");
		}

		if (!fs.existsSync(configPath)) {
			console.log(`Downloading config ${voiceKey}.json...`);
			const configFile = `en_US/lessac/medium/en_US-lessac-medium.onnx.json`;
			await downloadFile(PIPER_CONFIG.repoUrl + configFile, configPath);
			console.log("✓ Config downloaded\n");
		}

		// Load model config
		const modelConfigJson = fs.readFileSync(configPath, "utf-8");
		const modelConfig: ModelConfig = JSON.parse(modelConfigJson);

		console.log("Creating inference engine...");
		const engine = await createInferenceEngine(modelPath, modelConfig);
		console.log("✓ Engine ready\n");

		// Convert text to phonemes
		const text = "Hello world";
		console.log(`Converting text to phonemes: "${text}"...`);
		const phonemeSequences = await textToPhonemes(
			text,
			modelConfig.espeak.voice,
			"espeak",
		);
		console.log(`✓ Got ${phonemeSequences.length} phoneme sequences\n`);

		// Synthesize each phoneme sequence
		let allSamples: number[] = [];
		for (let i = 0; i < phonemeSequences.length; i++) {
			const phonemes = phonemeSequences[i];
			console.log(`Synthesizing phrase ${i + 1}/${phonemeSequences.length}...`);

			const phonemeIds = toPhonemeIds(phonemes, modelConfig);
			const pcmData = await engine.infer(phonemeIds);

			allSamples = allSamples.concat(Array.from(pcmData.samples));

			// Add silence between sentences
			const silenceSamples = Math.round(0.2 * pcmData.sampleRate);
			allSamples = allSamples.concat(Array(silenceSamples).fill(0));
		}

		const sampleRate =
			modelConfig.audio?.sample_rate ?? PIPER_CONFIG.defaults.sampleRate;
		const duration = (allSamples.length / sampleRate).toFixed(2);
		console.log(`✓ Generated ${duration}s of audio\n`);

		console.log(`Saving to ${outputPath}...`);
		const finalPcmData: PcmData = {
			samples: new Float32Array(allSamples),
			sampleRate,
			numChannels: 1,
		};
		await savePcmToWav(finalPcmData, outputPath);
		console.log("✓ WAV file saved!\n");

		await engine.dispose();
		console.log("Demo complete!");
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
}

demo();
