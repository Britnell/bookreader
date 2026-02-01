import * as tonic from "./supertonic.ts";
import * as kokoro from "./kokoro.ts";

async function main() {
	// const voice = tonic.voices[9];
	const voice = kokoro.voices[0];
	console.log({ voice });

	// const audio = await tonic.generateSpeech({
	// 	text: "Hello, this is a test of the text to speech system.",
	// 	speed: 1.0,
	// 	voice,
	// });

	const audio = await kokoro.generateSpeech({
		text: "Hello, this is a test of the text to speech system.",
		speed: 1.0,
		voice,
	});

	audio.save("output.wav");
}

main().catch(console.error);
