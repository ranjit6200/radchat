# Task: Integrate MediaPipe / LiteRT for Web to Run MedGemma 1.5 4B-IT Offline

Integrate the MediaPipe for Web runtime into our existing React application to execute the quantized MedGemma 1.5 4B-IT multimodal model entirely in-browser.

Act as an expert Senior Frontend Engineer specializing in On-Device WebGPU AI applications. 

I need you to write a clean, production-grade custom React hook (`useMedGemma`) and a supporting singleton service wrapper (`MedGemmaEngine.ts`) to manage a multimodal local LLM using the official `@mediapipe/tasks-genai` engine.

Here are the exact architecture constraints and specifications:

1. DEPENDENCIES & FORMATS:
   - Use npm imports for: `import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai';`
   - Use the official Google CDN for the GenAI tasks WASM bridge directory: "https://jsdelivr.net"
   - The model file is loaded locally from './model.litertlm' (MedGemma 1.5 4B).

2. REUSABLE SERVICE WRAPPER (MedGemmaEngine.ts):
   - Implement a TypeScript singleton pattern class `MedGemmaEngine`.
   - It should maintain private states for `FilesetResolver` and `LlmInference`.
   - Expose an async `init(onProgress?: (step: string) => void): Promise<void>` method. Ensure it avoids duplicate initializations if called multiple times simultaneously.
   - Expose an async `analyze(prompt: string, processedCanvas: HTMLCanvasElement): Promise<string>` method that pipes the text instruction along with the image resource directly to the underlying MediaPipe generation task.

3. REACT STATE WRAPPER HOOK (useMedGemma.ts):
   - Manage states tracking: `isReady` (boolean), `isGenerating` (boolean), `error` (string | null), and `statusMessage` (string, e.g., "Downloading model files...", "Initializing WebGPU buffers...").
   - Expose an `initEngine()` execution mechanism.
   - Expose a `generateAnalysis(prompt: string, processedCanvas: HTMLCanvasElement): Promise<string | null>` runner that wraps the engine's inference logic securely in error catch gates and mutates the status flags during runtime generation.

4. IMAGE PREPROCESSING:
   - Resize and format images to match MedGemma's input tensor size requirements using HTML5 Canvas or MediaPipe image utility helpers. Refer to "preprocess.md" for specifications.
