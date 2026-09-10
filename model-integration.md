# Task: Integrate MediaPipe / LiteRT for Web to Run MedGemma 1.5 4B-IT Offline

Integrate the MediaPipe / LiteRT for Web runtime into our existing React application to execute the quantized MedGemma 1.5 4B-IT multimodal model entirely in-browser.

## Core Requirements
1. **Runtime Library**: Install and configure `@mediapipe/tasks-vision` or the latest LiteRT for Web text/multimodal task runner packages via npm.
2. **Model Loading & Initialization (`src/hooks/useMedGemma.ts`)**:
   - Implement an asynchronous loading hook that downloads or fetches the quantized MedGemma 1.5 4B-IT model files (`.task` or model assets) from `/public/models/`.
   - Configure execution delegates with **GPU acceleration (WebGPU / WebGL)** preferred, falling back safely to CPU (WASM) if hardware acceleration fails.
   - Provide explicit loading states (`isLoading`, `progressPercentage`, `error`) to drive UI progress bars.
3. **Multimodal Inference Pipeline (`src/utils/imageProcessor.ts` & hook)**:
   - Accept the user's text prompt along with an array of uploaded image files/blobs from our state layer.
   - Resize and format images to match MedGemma's input tensor size requirements using HTML5 Canvas or MediaPipe image utility helpers. Refer to "preprocess.md" for specifications.
   - Execute inference locally without sending data externally (true offline air-gapped execution).
4. **Prompt & Schema Enforcement (`src/utils/promptBuilder.ts`)**:
   - Combine the user's text input, multi-image tensors, system prompt, and output schema guidelines into the native prompt template format expected by the model. (system prompt and output schema will be added later)
   - Stream or return the text result incrementally back to the active chat session in **ChatWindow.tsx**.

## Acceptance Criteria
- Dropping or pasting multiple images alongside a text query correctly feeds multi-modal tokens into the LiteRT session.
- The UI handles the heavy local initialization cleanly without crashing the main browser thread (use a Web Worker if necessary for the runtime).
- All operations remain 100% offline with zero external network requests during inference.