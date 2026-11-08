import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { personPage } from './people';

/** A real (tiny, solid purple) PNG, so the upload path does actual image work. */
function png(width = 64, height = 64): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([168, 85, 247]))]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('memories, goals and capsules made by one partner show up live for the other', async ({ browser }) => {
  const a = await personPage(browser, 'asha');
  const b = await personPage(browser, 'bilal');
  const stamp = Date.now();

  await test.step('A pins a photo memory; it uploads and B sees it', async () => {
    const title = `Sunset at the beach ${stamp}`;
    await a.getByRole('button', { name: 'Add', exact: true }).click();
    await a.getByRole('button', { name: /^Memory/ }).click();
    await a.locator('input[type=file]').setInputFiles({ name: 'sunset.png', mimeType: 'image/png', buffer: png() });
    await a.getByPlaceholder('What happened?').fill(title);
    await a.getByRole('button', { name: 'Add to the board' }).click();
    await expect(a.getByRole('button', { name: 'Add to the board' })).toBeHidden({ timeout: 20_000 });

    await b.goto('/#memories');
    await expect(b.getByText(title).first()).toBeVisible();
  });

  await test.step('A creates a goal; B logs progress until it completes', async () => {
    const title = `Cook pasta together ${stamp}`;
    await a.goto('/#goals');
    await a.getByRole('button', { name: 'New goal' }).click();
    await a.getByPlaceholder('Goal Title').fill(title);
    await a.getByPlaceholder('Target').fill('2');
    await a.getByRole('button', { name: 'Create Goal' }).click();

    await b.goto('/#goals');
    const add = b.getByRole('button', { name: `Add progress to ${title}` });
    await add.click();
    await expect(a.getByText('50%')).toBeVisible(); // live on A's screen
    await add.click();
    await expect(add).toBeHidden(); // completed: the + becomes a check
  });

  await test.step('A locks a capsule; B sees it', async () => {
    const title = `Open on our anniversary ${stamp}`;
    await a.goto('/#capsules');
    await a.getByRole('button', { name: 'New capsule' }).click();
    await a.getByPlaceholder('Capsule Title').fill(title);
    await a.locator('input[type=date]').fill('2030-02-14');
    await a.getByRole('button', { name: 'Lock Capsule' }).click();

    await b.goto('/#capsules');
    await expect(b.getByText(title)).toBeVisible();
  });
});
