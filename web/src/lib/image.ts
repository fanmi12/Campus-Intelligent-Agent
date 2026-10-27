// 手机照片动辄几 MB，上传前先压缩：长边不超过 1600 像素、转成 JPEG，识别效果不受影响
export async function compressImage(
  file: File,
  maxSide = 1600,
  quality = 0.82,
): Promise<{ url: string; mediaType: string; filename: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  const source = bitmap ?? (await loadImageElement(file));
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;

  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持图片处理");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close();

  return {
    url: canvas.toDataURL("image/jpeg", quality),
    mediaType: "image/jpeg",
    filename: file.name.replace(/\.[^.]+$/, "") + ".jpg",
  };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片，换一张试试"));
    };
    image.src = url;
  });
}
