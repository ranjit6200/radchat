"""
Deploy ``unsloth/medgemma-1.5-4b-it-GGUF`` (8-bit Q8_0) on Modal with a T4 GPU.

The app serves an OpenAI-compatible ``/chat/completions`` endpoint backed by
``llama.cpp``'s ``llama-server`` so it drops straight into the radchat frontend
(see ``src/services/llmClient.ts`` and ``src/utils/promptBuilder.ts``):

* ``POST /chat/completions`` and ``POST /v1/chat/completions``
* multimodal ``content`` parts of the form
  ``{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}``
* ``response_format = {"type": "json_object"}`` is honoured (schema-constrained JSON)
* permissive CORS so the GitHub Pages client can call it from a browser
* Bearer-token auth on ``/chat/completions`` (the key is read from the
  ``vllm-api-key-secret`` Modal secret)

The assistant reply is a single JSON object matching ``ClinicalFindings``
(``study``, ``findings[]``, ``impression``, ``differentialDiagnoses[]``,
``recommendations[]``, ``urgency``) - exactly what ``src/utils/clinicalParser.ts``
expects.

--------------------------------------------------------------------------
One-time setup
--------------------------------------------------------------------------
1. Install and authenticate the Modal client::

       pip install modal
       modal setup

2. ``unsloth/medgemma-1.5-4b-it-GGUF`` is gated, so create a Modal secret that
   holds a Hugging Face access token with access to the repo::

       modal secret create huggingface-secret HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx

3. Create the Modal secret that holds the API key clients must send to call the
   endpoint. The value can be any string you choose::

       modal secret create vllm-api-key-secret API_KEY=<your-secret-key>

   The key is read from the ``API_KEY`` env var by default; override the name with
   the ``API_KEY_ENV`` environment variable if yours differs.

4. (Recommended) Pre-download the ~5 GB of weights into the persistent Volume so
   the first request does not have to::

       modal run deploy_medgemma.py

--------------------------------------------------------------------------
Deploy & use
--------------------------------------------------------------------------
Deploy::

    modal deploy deploy_medgemma.py

Copy the Web Function URL printed by ``modal deploy`` and paste it into the
radchat "API" bar:

    Base URL : https://<workspace>--medgemma-1-5-4b-gguf-web.modal.run
    API key  : <your-secret-key>   (sent as "Authorization: Bearer ...")
    Model    : medgemma-1.5-4b-it-Q8_0.gguf

For a hot-reloading dev server instead of a persistent deploy::

    modal serve deploy_medgemma.py
"""

import os
import shutil
import subprocess
import time

import modal

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

APP_NAME = "medgemma-1-5-4b-gguf"

# Gated Hugging Face repo (requires HF_TOKEN in a Modal secret).
REPO_ID = "unsloth/medgemma-1.5-4b-it-GGUF"
# 8-bit quantized weights (~4.1 GB).
MODEL_FILE = "medgemma-1.5-4b-it-Q8_0.gguf"
# Vision projector required for image inputs (~0.85 GB).
MMPROJ_FILE = "mmproj-F16.gguf"

# Name of the Modal secret holding the Hugging Face token (env var ``HF_TOKEN``).
HF_SECRET_NAME = os.environ.get("HF_SECRET_NAME", "huggingface-secret")

# Modal secret holding the API key clients must present as a Bearer token.
API_SECRET_NAME = os.environ.get("API_SECRET_NAME", "vllm-api-key-secret")
# Env-var name of the key inside that secret.
API_KEY_ENV = os.environ.get("API_KEY_ENV", "API_KEY")

MODELS_DIR = "/models"
# llama-server shipped by the prebuilt ghcr.io/ggml-org/llama.cpp:server-cuda image.
LLAMA_SERVER_BIN = "/app/llama-server"
# /app also holds the dynamic CUDA backend (libggml-cuda.so), because that image is
# built with GGML_BACKEND_DL=ON, so llama-server must search there for it.
LLAMA_SERVER_DIR = os.path.dirname(LLAMA_SERVER_BIN)
LLAMA_PORT = 8080

GPU = "T4"                 # T4 has 16 GB VRAM; Q8_0 + mmproj + KV cache fit easily.
CONTEXT_SIZE = 8192        # plenty for an image + report; keeps the KV cache small.
REQUEST_TIMEOUT = 600      # seconds; ~1024 tokens on a T4 is roughly 30-60 s.

# SigLIP vision input size for MedGemma 1.5 4B; images are stretched to this square (default_to_square).
MEDGEMMA_IMAGE_SIZE = 896

# JSON Schema the model must emit. Mirrors ClinicalFindings in src/types.ts, and is
# enforced through llama.cpp's grammar-constrained "json_schema" response format so the
# model cannot fall back to free-form reasoning/prose. "findings" is listed first so
# generation starts on the report body - the JSON analogue of ending a prose prompt with
# "FINDINGS:".
# --------------------------------------------------------------------------- #
# Replacement Schema: Forces internal reasoning space before structure.
# --------------------------------------------------------------------------- #

CLINICAL_FINDINGS_SCHEMA = {
    "type": "object",
    "properties": {
        # This property MUST remain first. It gives MedGemma a text padding buffer 
        # to execute image cross-attention loops before forcing structured clinical prose.
        "visual_analysis": {
            "type": "string", 
            "description": "Internal raw visual reasoning and feature tracking path."
        },
        "findings": {
            "type": "array", 
            "items": {"type": "string"}
        },
        "impression": {"type": "string"},
        "study": {"type": "string"},
        "differentialDiagnoses": {
            "type": "array", 
            "items": {"type": "string"}
        },
        "recommendations": {
            "type": "array", 
            "items": {"type": "string"}
        },
        "urgency": {
            "type": "string", 
            "enum": ["routine", "urgent", "emergent"]
        },
    },
    # By making visual_analysis required and placing it first, the grammar engine 
    # lets the model 'think' visually before generating report metrics.
    "required": ["visual_analysis", "findings", "impression"],
    "additionalProperties": False,
}


# --------------------------------------------------------------------------- #
# Container image: prebuilt, CUDA-enabled llama.cpp (no source compilation)
# --------------------------------------------------------------------------- #
# The official image ships /app/llama-server built with GGML_CUDA=ON for all
# supported GPU architectures (including sm_75 / Tesla T4) on CUDA 12.8, so the
# Modal image build is just a cached pip install instead of a full C++ compile.
image = (
    modal.Image.from_registry(
        "ghcr.io/ggml-org/llama.cpp:server-cuda",
        add_python="3.11",
    )
    # The base image sets ENTRYPOINT ["/app/llama-server"]. Reset it, otherwise
    # Modal's Python runner is passed as arguments to llama-server and startup
    # fails with "error: invalid argument: python" (exit code 1).
    .entrypoint([])
    .pip_install(
        "fastapi[standard]",
        "httpx",
        "huggingface_hub[hf_transfer]",
        "pillow",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

# Persistent cache for the weights so cold starts do not re-download ~5 GB.
volume = modal.Volume.from_name("medgemma-gguf-models", create_if_missing=True)

# Secret providing HF_TOKEN for the gated download.
hf_secret = modal.Secret.from_name(HF_SECRET_NAME)

# Secret providing the endpoint API key (``API_KEY`` by default).
api_secret = modal.Secret.from_name(API_SECRET_NAME)

app = modal.App(APP_NAME)

# --------------------------------------------------------------------------- #
# Model download (runs once, cached in the Volume)
# --------------------------------------------------------------------------- #

def _ensure_model_files() -> None:
    """Make sure the Q8_0 weights and the vision projector exist in the Volume."""
    from huggingface_hub import hf_hub_download

    token = os.environ.get("HF_TOKEN") or None
    os.makedirs(MODELS_DIR, exist_ok=True)

    downloaded = False
    for filename in (MODEL_FILE, MMPROJ_FILE):
        dest = os.path.join(MODELS_DIR, filename)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print(
                f"[download] {filename} already cached ({os.path.getsize(dest):,} bytes)",
                flush=True,
            )
            continue

        print(f"[download] fetching {REPO_ID}/{filename} ...", flush=True)
        try:
            path = hf_hub_download(
                repo_id=REPO_ID,
                filename=filename,
                local_dir=MODELS_DIR,
                token=token,
            )
        except Exception as exc:  # noqa: BLE001 - re-raised with actionable context
            raise RuntimeError(
                f"Could not download {REPO_ID}/{filename}. The repo is gated: make sure a "
                f"Modal secret named '{HF_SECRET_NAME}' exposes a valid HF_TOKEN that has "
                f"accepted the model license. Underlying error: {exc}"
            ) from exc

        # If huggingface_hub produced a cache symlink, materialise a real file so the
        # Volume stays self-contained across container restarts.
        if os.path.islink(path):
            real_path = os.path.realpath(path)
            os.remove(path)
            shutil.copy2(real_path, path)
        downloaded = True

    if downloaded:
        volume.commit()
        print("[download] Volume committed", flush=True)


@app.function(
    image=image,
    volumes={MODELS_DIR: volume},
    secrets=[hf_secret],
    timeout=60 * 60,
)
def download_model() -> str:
    """Pre-fetch the GGUF weights into the Volume. Run with ``modal run``."""
    _ensure_model_files()
    return f"Models ready in {MODELS_DIR}: {MODEL_FILE}, {MMPROJ_FILE}"


@app.local_entrypoint()
def main() -> None:
    """``modal run deploy_medgemma.py`` -> warm the model cache."""
    print(download_model.remote())

# --------------------------------------------------------------------------- #
# Inference server (llama.cpp) + OpenAI-compatible FastAPI proxy
# --------------------------------------------------------------------------- #

def _preprocess_image_data_url(data_url: str) -> str:
    """Normalise an ``image_url`` to the input MedGemma 1.5 4B expects.

    MedGemma is Gemma 3 based, and Gemma 3's image processor resizes by *stretching*
    to the exact square input (``default_to_square``, no padding), so we do the same:
    force 3-channel RGB (dropping alpha / replicating grayscale) and resize to
    MEDGEMMA_IMAGE_SIZE x MEDGEMMA_IMAGE_SIZE with Lanczos interpolation. The
    remaining stages (rescale + mean/std normalisation) are applied inside llama.cpp's
    mmproj/SigLIP tower, which consumes an encoded image rather than a raw tensor.

    We deliberately do NOT letterbox (pad with black bars): that mismatches Gemma 3's
    preprocessing and shrinks the anatomy within the frame, which can hide findings.
    """
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return data_url

    header, _, encoded = data_url.partition(",")
    if ";base64" not in header or not encoded:
        return data_url

    import base64
    import io

    from PIL import Image

    try:
        raw = base64.b64decode(encoded)
    except Exception:  # noqa: BLE001 - not our base64; leave it for llama-server
        return data_url

    try:
        with Image.open(io.BytesIO(raw)) as opened:
            image = opened.convert("RGB")  # drop alpha / replicate grayscale to RGB
    except Exception:  # noqa: BLE001 - unreadable image; let llama-server report it
        return data_url

    # Stretch to the model's fixed square input (matches Gemma 3's default_to_square).
    image = image.resize(
        (MEDGEMMA_IMAGE_SIZE, MEDGEMMA_IMAGE_SIZE),
        Image.Resampling.LANCZOS,
    )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _build_proxy_app():
    """A thin, CORS-enabled reverse proxy in front of the local llama-server."""
    import hmac

    import json

    import httpx
    from fastapi import Depends, FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, Response
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    api = FastAPI(title="MedGemma (llama.cpp) OpenAI-compatible proxy")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],       # the radchat client runs on GitHub Pages
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    upstream = f"http://127.0.0.1:{LLAMA_PORT}"
    client = httpx.AsyncClient(timeout=httpx.Timeout(REQUEST_TIMEOUT - 20, connect=10.0))

    expected_api_key = os.environ.get(API_KEY_ENV, "")
    _bearer = HTTPBearer(auto_error=False)

    def _prepare_chat_request(body: bytes) -> bytes:
        """Rewrite a chat request before it reaches llama-server.

        1. Upgrade ``response_format`` from json_object to a grammar-constrained
           json_schema so the model must emit ClinicalFindings JSON (a bare
           json_object request is not enforced, so the model returns free prose).
        2. Normalise every attached image to MedGemma's 896x896 RGB SigLIP input.

        The system/user prompt is owned by the client (src/utils/promptBuilder.ts) and is
        forwarded untouched.
        """
        try:
            payload = json.loads(body)
        except Exception:  # noqa: BLE001 - forward anything unparseable untouched
            return body
        if not isinstance(payload, dict):
            return body

        response_format = payload.get("response_format")
        if isinstance(response_format, dict) and response_format.get("type") == "json_object":
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "clinical_findings",
                    "schema": CLINICAL_FINDINGS_SCHEMA,
                    "strict": True,
                },
            }

        for message in payload.get("messages") or []:
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict) or part.get("type") != "image_url":
                    continue
                image_url = part.get("image_url")
                if isinstance(image_url, dict) and isinstance(image_url.get("url"), str):
                    image_url["url"] = _preprocess_image_data_url(image_url["url"])

        return json.dumps(payload).encode("utf-8")

    async def require_api_key(
        credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    ) -> None:
        """Reject requests without the correct ``Authorization: Bearer <key>`` header."""
        if not expected_api_key:
            raise HTTPException(status_code=503, detail="Server API key is not configured.")
        if credentials is None or not hmac.compare_digest(
            credentials.credentials, expected_api_key
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid or missing API key.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def _forward(request: Request, upstream_path: str) -> Response:
        headers = {}
        content_type = request.headers.get("content-type")
        if content_type:
            headers["content-type"] = content_type
        body = await request.body()
        if upstream_path == "/v1/chat/completions":
            body = _prepare_chat_request(body)
        try:
            resp = await client.post(f"{upstream}{upstream_path}", content=body, headers=headers)
        except httpx.HTTPError as exc:
            return JSONResponse(
                status_code=503,
                content={
                    "error": {
                        "message": f"llama-server is not reachable yet: {exc}",
                        "type": "unavailable_error",
                    }
                },
            )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/json"),
        )

    @api.post("/chat/completions", dependencies=[Depends(require_api_key)])
    async def chat_completions(request: Request) -> Response:
        # radchat appends "/chat/completions" to whatever base URL is configured.
        return await _forward(request, "/v1/chat/completions")

    @api.post("/v1/chat/completions", dependencies=[Depends(require_api_key)])
    async def chat_completions_v1(request: Request) -> Response:
        return await _forward(request, "/v1/chat/completions")

    @api.get("/v1/models")
    async def list_models() -> Response:
        resp = await client.get(f"{upstream}/v1/models")
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type="application/json",
        )

    @api.get("/health")
    async def health() -> JSONResponse:
        try:
            resp = await client.get(f"{upstream}/health")
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
        except Exception:  # noqa: BLE001 - report "starting" while the model loads
            return JSONResponse(content={"status": "starting"}, status_code=503)

    @api.get("/")
    async def root() -> dict:
        return {
            "status": "ok",
            "model": MODEL_FILE,
            "endpoints": [
                "/chat/completions",
                "/v1/chat/completions",
                "/v1/models",
                "/health",
            ],
            "auth": "Authorization: Bearer <key> required for /chat/completions",
        }

    return api


@app.cls(
    image=image,
    gpu=GPU,
    volumes={MODELS_DIR: volume},
    secrets=[hf_secret, api_secret],
    timeout=REQUEST_TIMEOUT,
    startup_timeout=60 * 45,   # first boot may download ~5 GB into the Volume
    scaledown_window=600,      # keep the T4 warm for 10 min after the last request
    max_containers=1,          # exactly one T4, ever
    memory=16384,
)
class MedGemma:
    @modal.enter()
    def start(self) -> None:
        _ensure_model_files()
        self._proc = self._launch_llama_server()
        self._wait_until_ready()

    def _launch_llama_server(self) -> subprocess.Popen:
        cmd = [
            LLAMA_SERVER_BIN,
            "--model", os.path.join(MODELS_DIR, MODEL_FILE),
            "--mmproj", os.path.join(MODELS_DIR, MMPROJ_FILE),
            "--n-gpu-layers", "999",   # offload every layer to the T4
            "--ctx-size", str(CONTEXT_SIZE),
            "--host", "127.0.0.1",
            "--port", str(LLAMA_PORT),
            "--reasoning-format", "deepseek",
            "--jinja",                 # use the GGUF chat template (<start_of_image> etc.)
        ]
        # No --no-mmap: llama.cpp memory-maps the GGUF by default, so startup does
        # not eagerly copy the whole model out of the network Volume.
        # The prebuilt image uses GGML_BACKEND_DL=ON, so the CUDA backend is a shared
        # library in /app; run from there and point llama-server at it explicitly.
        env = {**os.environ, "GGML_BACKEND_DIR": LLAMA_SERVER_DIR}
        print("[llama-server] launching: " + " ".join(cmd), flush=True)
        return subprocess.Popen(cmd, cwd=LLAMA_SERVER_DIR, env=env)

    def _wait_until_ready(self, timeout: float = 60 * 30) -> None:
        import urllib.error
        import urllib.request

        url = f"http://127.0.0.1:{LLAMA_PORT}/health"
        deadline = time.time() + timeout
        while time.time() < deadline:
            exit_code = self._proc.poll()
            if exit_code is not None:
                raise RuntimeError(f"llama-server exited during startup (code {exit_code})")
            try:
                with urllib.request.urlopen(url, timeout=3) as resp:
                    if resp.status == 200:
                        print("[llama-server] ready", flush=True)
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(2)
        raise TimeoutError("llama-server did not become ready in time")

    @modal.exit()
    def stop(self) -> None:
        proc = getattr(self, "_proc", None)
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()

    @modal.asgi_app()
    def web(self):
        return _build_proxy_app()




