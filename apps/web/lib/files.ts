"use client";
import { HOME_DOC_RULES } from "@zarva/core";

/**
 * Turns a picked file into what the API accepts. Phone photos are 3-8 MB; we shrink them to
 * at most 1600 px as JPEG (about 200-400 KB) so uploads work on slow mobile data.
 * PDFs are sent as they are (max 5 MB).
 */
export async function prepareUpload(file: File): Promise<{ mime: string; dataBase64: string; previewUrl: string | null }> {
  if (file.type === "application/pdf") {
    if (file.size > HOME_DOC_RULES.maxBytes) throw new Error("PDF must be under 5 MB");
    return { mime: file.type, dataBase64: await toBase64(file), previewUrl: null };
  }
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo (JPG or PNG) or a PDF");
  const img = await loadImage(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that photo"))), "image/jpeg", 0.82));
  if (blob.size > HOME_DOC_RULES.maxBytes) throw new Error("Photo is too large even after shrinking");
  return { mime: "image/jpeg", dataBase64: await toBase64(blob), previewUrl: URL.createObjectURL(blob) };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo. Try another one.")); };
    img.src = url;
  });
}

async function toBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
