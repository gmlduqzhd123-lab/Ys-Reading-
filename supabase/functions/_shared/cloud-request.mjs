export async function readCloudJob(request) {
  if (
    request.method !== "POST" ||
    Number(request.headers.get("content-length") ?? 0) > 300 ||
    !request.body
  )
    throw Error("INVALID_REQUEST");
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let length = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 300) {
        await reader.cancel();
        throw Error("INVALID_REQUEST");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (
      typeof value?.job !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        value.job,
      ) ||
      Object.keys(value).length !== 1
    )
      throw Error("INVALID_REQUEST");
    return value.job;
  } finally {
    reader.releaseLock();
  }
}
