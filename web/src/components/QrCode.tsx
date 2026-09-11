import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 二维码生成组件：把文本/链接渲染为二维码图片（dataURL，零后端） */
export function QrCode({ text, size = 160 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: "#16213a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  if (!src) {
    return <div className="skeleton" style={{ width: size, height: size }} aria-label="二维码生成中" />;
  }
  return <img src={src} width={size} height={size} alt="名片二维码" style={{ borderRadius: 8 }} />;
}
