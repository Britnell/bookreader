import { pipeline } from "@huggingface/transformers"

const synthesizer = await pipeline(
	"text-to-speech",
	"huggingworld/chatterbox-ONNX",
	{ dtype: "fp32" },
)

const result = await synthesizer("Hello, this is a test", {
	speaker_embeddings: null, // Not needed
})
