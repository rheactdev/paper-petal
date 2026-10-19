import "@tanstack/react-start/client-only";
import { useEffect, useRef } from "react";
import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import {
  fontTypes,
  imageTypes,
  validateAssetBytes,
  type AssetKind,
  type UserAsset,
} from "../../data/user-assets";
import { useAssetLibrary } from "./asset-library";
import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

registerPlugin(
  FilePondPluginFileValidateType,
  FilePondPluginFileValidateSize,
  FilePondPluginImagePreview,
);

export async function validateUpload(file: Blob, kind: AssetKind) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = validateAssetBytes(kind, bytes);
  if (kind === "font") {
    const face = new FontFace(
      "petal-upload-validation",
      await file.arrayBuffer(),
    );
    try {
      await face.load();
    } catch {
      throw new Error("This font couldn’t be read. Choose another font file.");
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error();
    } catch {
      throw new Error("This image couldn’t be read. Choose another sticker.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return mime;
}

export default function AssetPond({ kind }: { kind: AssetKind }) {
  const library = useAssetLibrary();
  const uploads = useRef(new Set<() => void>());
  const signal = library.signal;
  useEffect(() => {
    const abort = () => {
      uploads.current.forEach((cancel) => cancel());
      uploads.current.clear();
    };
    signal?.addEventListener("abort", abort);
    return () => {
      signal?.removeEventListener("abort", abort);
      abort();
    };
  }, [signal]);
  return (
    <FilePond
      allowMultiple
      allowRevert={false}
      labelButtonRemoveItem="Remove from upload list"
      allowPaste={false}
      allowDrop
      maxParallelUploads={2}
      acceptedFileTypes={[...(kind === "font" ? fontTypes : imageTypes)]}
      maxFileSize={kind === "font" ? "10485760B" : "20971520B"}
      allowImagePreview={kind === "sticker"}
      imagePreviewHeight={90}
      imagePreviewTransparencyIndicator="grid"
      name="file"
      labelIdle={`Drop ${kind === "font" ? "fonts" : "stickers"} or <span class="filepond--label-action">Browse</span>`}
      fileValidateTypeDetectType={async (source) =>
        validateAssetBytes(kind, new Uint8Array(await source.arrayBuffer()))
      }
      labelFileProcessingError={(error) =>
        typeof error === "string"
          ? error
          : String(error.body || "Upload failed. Please retry.")
      }
      server={{
        process: (_name, file, _metadata, load, error, progress, abort) => {
          const request = new XMLHttpRequest();
          let cancelled = false;
          if (signal?.aborted) {
            error("Sign in again to upload files.");
            return;
          }
          const cancel = () => {
            cancelled = true;
            uploads.current.delete(cancel);
            request.abort();
            abort();
          };
          uploads.current.add(cancel);
          request.open("POST", "/api/assets");
          request.timeout = 120000;
          request.upload.onprogress = (event) =>
            progress(event.lengthComputable, event.loaded, event.total);
          request.onerror = request.ontimeout = () => {
            uploads.current.delete(cancel);
            error("Upload failed. Check your connection and retry.");
          };
          request.onload = () => {
            uploads.current.delete(cancel);
            if (signal?.aborted) return;
            try {
              const result = JSON.parse(request.responseText) as UserAsset & {
                message?: string;
              };
              if (request.status < 200 || request.status >= 300) {
                error(result.message || "Upload failed. Please retry.");
                return;
              }
              load(result.id);
              void library.refresh();
            } catch {
              error("Upload failed. Please retry.");
            }
          };
          const form = new FormData();
          form.append("kind", kind);
          form.append("file", file, file.name);
          void validateUpload(file, kind)
            .then(() => {
              if (!cancelled && !signal?.aborted) request.send(form);
            })
            .catch((reason) => {
              uploads.current.delete(cancel);
              if (!cancelled && !signal?.aborted)
                error(
                  reason instanceof Error
                    ? reason.message
                    : "This file couldn’t be read.",
                );
            });
          return { abort: cancel };
        },
        revert: null,
        fetch: null,
        restore: null,
        load: null,
      }}
    />
  );
}
