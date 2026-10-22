import { expect, test, TEST_PNG } from "../../support/fixtures.ts";

test("an upload is re-encoded as JPEG and served to signed-in users only", async ({ member, anon }) => {
  const image = await member.client.uploadPng(TEST_PNG);
  expect(image).toMatchObject({ width: 2, height: 2 });
  expect(image.url).toMatch(/^\/media\/[0-9a-f-]{36}\.jpg$/);

  const served = await member.client.request.get(image.url);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/jpeg");
  const bytes = await served.body();
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG, not the PNG we sent

  expect((await anon.request.get(image.url)).status()).toBe(401);
});

test("something that is not an image is refused", async ({ member }) => {
  const res = await member.client.request.post("/api/media", {
    multipart: { file: { name: "note.png", mimeType: "image/png", buffer: Buffer.from("not an image") } },
  });
  expect(res.status()).toBe(415);
});
