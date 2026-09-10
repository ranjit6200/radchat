# Project Implementation Plan: MedGemma Web Chat Clone

## 1. Project Overview & Architecture
- **Objective**: Build an OpenWebUI/ChatLLM clone running **MedGemma 1.5 4B-IT** fully in-browser using **ONNX Runtime Web** or **MediaPipe / LiteRT for Web**.
- **State Management**: Ephemeral (In-memory state only, no database or backend persistence).
- **Core Interface**: Left sidebar for switching/creating separate active chats, central chat container, multi-image upload zone (drag-and-drop, paste, file picker), and text prompt input.
- **Output Requirements**: Strict adherence to a predefined system prompt and a structured JSON/markdown output schema for clinical findings.

---

## 2. Tech Stack & Dependencies
- **Framework**: React / Vite (or Next.js in static export mode) + Tailwind CSS for UI components.
- **Icons / UI Utilities**: `lucide-react`, `clsx`, `tailwind-merge`.
- **Inference Runtime**: 
  - *Option A*: `onnxruntime-web` with WebGL/WebGPU execution providers.
  - *Option B*: `@mediapipe/tasks-vision` / LiteRT Web runtime configured for multimodal Gemma variants.
- **Image Processing**: Native browser Canvas API / `FileReader` for multi-image preprocessing and resizing.

---

## 3. Directory Structure
```text
├── public/
│   └── models/               # Place MedGemma 1.5 4B-IT web-optimized weights here (or load via CDN/Hugging Face cache)
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx       # Left sidebar for managing in-memory chat sessions
│   │   ├── ChatWindow.tsx    # Active chat history display
│   │   ├── ChatInput.tsx     # Text box + Multi-image upload, preview thumbnails, paste listener
│   │   └── StructuredView.tsx# Custom renderer for the required output schema
│   ├── hooks/
│   │   └── useMedGemma.ts    # Web worker or core inference wrapper (ONNX/LiteRT initialization & execution)
│   ├── utils/
│   │   ├── imageProcessor.ts # Handles multi-image scaling, tokenization preparation, and formatting
│   │   └── promptBuilder.ts  # Injects system prompt and enforces the target schema
│   ├── App.tsx               # Main layout orchestrator (state container for ephemeral chats)
│   └── main.tsx
├── package.json
└── plan.md