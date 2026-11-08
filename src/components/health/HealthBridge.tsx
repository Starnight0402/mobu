import { useEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { App as CapApp } from '@capacitor/app';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useMutation } from '../../lib/queryCache';
import { goToTab } from '../../lib/navigation';
import { setSharedFiles } from '../../lib/healthIntent';
import { hcGranted, hcStatus, lastSync, syncHealthConnect } from '../../lib/healthConnect';

/*
 * Invisible glue, mounted once inside the signed-in app:
 *  - files shared into Mobu from other apps (WhatsApp, Gmail, Files) become a
 *    pending upload and open Health -> Records;
 *  - Health Connect is re-synced when the app comes to the front, at most every
 *    few hours, once it has been connected from Health settings.
 */

interface SharePlugin {
  take(): Promise<{ files: { path: string; name: string; mime: string }[] }>;
  addListener(event: 'shared', cb: () => void): Promise<{ remove: () => void }>;
}
const share = registerPlugin<SharePlugin>('MobuShare');

const SYNC_EVERY_MS = 4 * 3_600_000;

function b64ToFile(b64: string, name: string, mime: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

export function HealthBridge() {
  const convex = useConvex();
  const importBatch = useMutation(api.health.vitals.importHealthConnect);
  const syncing = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let off: (() => void) | undefined;
    const take = async () => {
      try {
        const { files } = await share.take();
        if (!files.length) return;
        const out: File[] = [];
        for (const f of files) {
          const r = await Filesystem.readFile({ path: f.path, directory: Directory.Cache });
          out.push(b64ToFile(r.data as string, f.name, f.mime));
          void Filesystem.deleteFile({ path: f.path, directory: Directory.Cache }).catch(() => {});
        }
        setSharedFiles(out);
        goToTab('health-records');
      } catch {
        /* an older APK without the plugin */
      }
    };
    void take();
    void share.addListener('shared', take).then((h) => (off = () => h.remove())).catch(() => {});
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const tick = async () => {
      if (syncing.current || Date.now() - lastSync() < SYNC_EVERY_MS || !lastSync()) return;
      syncing.current = true;
      try {
        if ((await hcStatus()) !== 'available') return;
        const g = await hcGranted(true, true);
        if (g.read === 0) return;
        await syncHealthConnect({
          importBatch: (a) => importBatch(a as never),
          manualSince: async (since) => (await convex.query(api.health.vitals.manualSince, { since })).map((v) => ({ type: v.type as never, time: v.time, value: v.value, value2: v.value2 })),
          cycle: true,
          write: true,
        });
      } catch {
        /* try again next time */
      } finally {
        syncing.current = false;
      }
    };
    void tick();
    const h = CapApp.addListener('appStateChange', (s) => s.isActive && void tick());
    return () => void h.then((x) => x.remove());
  }, [convex, importBatch]);

  return null;
}
