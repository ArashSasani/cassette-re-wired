import { uploadFile, sourceAudioUrl } from "../api/client.js";
import type { RunStateStore } from "../state/run-state.js";
import type { PipelineController } from "./pipeline.js";

export interface UploadCallbacks {
  onUploadStart(): void;
  onUploadDone(runId: string): void;
  onUploadFailed(status: number): void;
}

export function wireUpload(
  runState: RunStateStore,
  pipeline: PipelineController,
  callbacks: UploadCallbacks,
): void {
  const uploadForm = document.getElementById("upload-form") as HTMLFormElement;
  const uploadStatus = document.getElementById("upload-status")!;
  const configSection = document.getElementById("config-section")!;
  const uploadZone = document.getElementById("upload-zone")!;
  const uploadFilename = document.getElementById("upload-filename")!;
  const sourceFile = document.getElementById("source-file") as HTMLInputElement;

  function applyFile(file: File | undefined | null) {
    if (!file) return;
    uploadFilename.textContent = file.name;
    uploadZone.classList.add("has-file");
  }

  sourceFile.addEventListener("change", () => applyFile(sourceFile.files?.[0]));

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
  ["dragleave", "dragend", "drop"].forEach((evt) =>
    uploadZone.addEventListener(evt, () => uploadZone.classList.remove("drag-over")),
  );
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    // Inject dropped file into the hidden input via DataTransfer.
    const dt = new DataTransfer();
    dt.items.add(file);
    sourceFile.files = dt.files;
    applyFile(file);
  });

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = sourceFile.files?.[0];
    if (!file) return;

    callbacks.onUploadStart();

    uploadStatus.textContent = "Uploading...";
    const result = await uploadFile(file);
    if (!result.ok) {
      uploadStatus.textContent = `Upload failed: ${result.status}`;
      callbacks.onUploadFailed(result.status);
      return;
    }

    runState.setRun(result.id);
    uploadStatus.textContent = `Uploaded. Run id: ${result.id}`;
    configSection.hidden = false;
    // Route the src assignment through the pipeline controller so the same
    // detach + fresh-nonce flow used at run-start applies here: prevents any
    // audio buffer or URL from a previous upload leaking into this one.
    pipeline.setBeforeAudio(sourceAudioUrl(result.id, pipeline.nextAudioNonce()));
    callbacks.onUploadDone(result.id);
  });
}
