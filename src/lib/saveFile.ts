import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Blob-URL `<a download>` clicks are silently swallowed by Capacitor's
 * Android WebView -- there's no download manager to hand them to, so nothing
 * happens. On native, write the file into app cache and hand it to the
 * share sheet instead, which lets the user save or send it anywhere.
 */
export async function saveTextFile(filename: string, contents: string, mimeType: string) {
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ url: written.uri, title: filename });
    return;
  }

  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
