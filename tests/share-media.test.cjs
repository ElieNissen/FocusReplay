const test = require('node:test');
const assert = require('node:assert/strict');
const { mediaPlan, encodeMedia } = require('../electron/share-media.cjs');
test('public and authorized derivatives have separate IDs; hidden frames never include a camera', () => {
  const policy = {
    publicScreen: 'blurred',
    publicCamera: 'visible',
    profileScreen: 'visible',
    profileCamera: 'hidden',
  };
  const plan = mediaPlan({ id: 'frame' }, policy, true);
  assert.equal(Object.keys(plan).length, 3);
  assert.equal(new Set(Object.values(plan).map((m) => m.id)).size, 3);
  assert.deepEqual(mediaPlan({ id: 'frame', private: true }, policy, true), {});
  assert.equal(mediaPlan({ id: 'frame' }, policy, false).publicCamera, undefined);
  assert.notEqual(
    plan.publicScreen.id,
    mediaPlan({ id: 'frame' }, { ...policy, publicScreen: 'visible' }, true).publicScreen.id,
  );
});
test('blur destroys detail before encoding and every derivative is bounded to 12 KB', () => {
  const sizes = [];
  const nativeImage = {
    createFromBuffer: () => ({
      resize({ width }) {
        sizes.push(width);
        return this;
      },
      toJPEG: () => Buffer.alloc(sizes.at(-1) > 320 ? 13000 : 10000),
    }),
  };
  assert.equal(encodeMedia(nativeImage, Buffer.from('fixture'), 'blurred').length, 10000);
  assert.deepEqual(sizes.slice(0, 2), [12, 640]);
  assert.throws(
    () =>
      encodeMedia(
        {
          createFromBuffer: () => ({
            resize() {
              return this;
            },
            toJPEG: () => Buffer.alloc(13000),
          }),
        },
        Buffer.alloc(1),
        'visible',
      ),
    /volumineuse/,
  );
});

test('authorized sharp screen gets a separate 96 KB budget; camera and public stay small', () => {
  const widths=[],qualities=[];
  const nativeImage={createFromBuffer:()=>({getSize:()=>({width:2560}),resize({width}){widths.push(width);return this;},toJPEG(q){qualities.push(q);return Buffer.alloc(90000);}})};
  assert.equal(encodeMedia(nativeImage,Buffer.alloc(1),'visible',false,'profileScreen').length,90000);
  assert.equal(widths[0],1920);assert.equal(qualities[0],78);
  assert.throws(()=>encodeMedia(nativeImage,Buffer.alloc(1),'visible',false,'publicScreen'),/volumineuse/);
  assert.throws(()=>encodeMedia(nativeImage,Buffer.alloc(1),'visible',true,'profileCamera'),/volumineuse/);
});
