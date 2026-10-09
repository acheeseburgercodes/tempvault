# Train or customize the local TempVault model

TempVault does not need model training to answer questions about new files. At question time, it reads the local vault, prioritizes selected files, and supplies their text and metadata to Ollama. This retrieval-based design means adding or removing a file takes effect immediately.

Fine-tune only if you want a particular answer style, terminology, classification scheme, or repeated workflow.

## Fast path: create a customized local model

1. Install Ollama for Windows from <https://ollama.com/download/windows>.
2. Open PowerShell and pull a base model that fits your hardware:

   ```powershell
   ollama pull gemma3:4b
   ```

3. Copy `models/Modelfile.example` to a working folder and adjust the system instructions.
4. Create the model name expected by TempVault:

   ```powershell
   ollama create tempvault-agent -f .\Modelfile
   ollama run tempvault-agent
   ```

5. In TempVault, open **Settings**, set **Local AI model** to `tempvault-agent`, save, then open **Ask AI**.

This changes instructions and runtime parameters; it does not change model weights.

## External fine-tuning workflow

TempVault intentionally does not train models or send training data anywhere. Perform these steps with the external training tool and hardware you choose.

1. Build a consented training dataset. A common chat JSONL shape is:

   ```json
   {"messages":[{"role":"system","content":"You are a precise private file analyst."},{"role":"user","content":"Summarize this incident note: ..."},{"role":"assistant","content":"Summary: ..."}]}
   ```

2. Remove secrets and personal data that the resulting model should not memorize. Keep a separate validation split.
3. Fine-tune the same base architecture using LoRA or QLoRA in an external tool such as LLaMA-Factory, Axolotl, or Unsloth. Follow that tool's current instructions for the exact model architecture.
4. Evaluate the adapter on held-out examples. Check factuality, refusal behavior, citation style, and whether it invents file contents.
5. Merge the adapter into the base model if your tool requires it, then export either:
   - a supported Safetensors model directory, or
   - a GGUF file quantized for your machine.
6. Create a new `Modelfile` that points to the exported weights:

   ```text
   FROM D:\TempVault\models\tempvault-finetuned.gguf
   PARAMETER temperature 0.2
   PARAMETER num_ctx 32768
   SYSTEM """You are TempVault Agent. Ground every answer in the supplied file context and cite filenames in square brackets."""
   ```

7. Import it into Ollama and test it before connecting TempVault:

   ```powershell
   ollama create tempvault-agent -f .\Modelfile
   ollama run tempvault-agent
   ```

8. Keep Ollama bound to loopback. TempVault uses only `http://127.0.0.1:11434` and has no cloud-model fallback.

Ollama's current import documentation covers supported Safetensors architectures and GGUF import: <https://docs.ollama.com/import>. The Modelfile reference is at <https://docs.ollama.com/modelfile>.

## What the agent can read

- Text, Markdown, source code, JSON, YAML, CSV, logs, and similar text files: content plus metadata.
- Folders: a local directory listing plus metadata.
- Images, audio, video, PDFs, archives, installers, and other binary formats: metadata only in the current version.
- Selected files are placed first in context; remaining vault files follow until the local context budget is reached.

For confidential vaults, train on representative synthetic examples instead of copies of real private files.
