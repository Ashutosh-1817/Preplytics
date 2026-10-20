import { toBlob } from 'html-to-image';

export const CARD_W = 360;
export const CARD_H = 450;

// 360x450 at 3x = a crisp 1080x1350 PNG (Instagram 4:5)
export const renderCardBlob = async (node) => {
  if (document.fonts?.ready) await document.fonts.ready;

  const options = {
    pixelRatio: 3,
    cacheBust: true,
    skipFonts: true, // avoids cross-origin font-embedding failures
    width: CARD_W,
    height: CARD_H,
    style: { transform: 'none', margin: '0' }, // never export the on-screen scale
  };

  await toBlob(node, options); // warm-up pass: Safari renders blank on the first call
  const blob = await toBlob(node, options);
  if (!blob) throw new Error('Image export failed');
  return blob;
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const canShareFiles = () => {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
    );
  } catch {
    return false;
  }
};